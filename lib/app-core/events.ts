import "server-only";

import { appCoreDb } from "./service";

type SeatBooking = {
  ticket_type_id: string;
  quantity: number;
  status: string;
  order_lines: {
    refunded_quantity: number;
    orders: { status: string; reservation_expires_at: string | null };
  };
};

async function reservedSeats(eventId: string) {
  const db = appCoreDb();
  const { data, error } = await db.from("bookings")
    .select("ticket_type_id,quantity,status,order_lines!inner(refunded_quantity,orders!inner(status,reservation_expires_at))")
    .eq("event_id", eventId)
    .in("status", ["pending", "confirmed"]);

  if (error) {
    console.error("Unable to load event availability", { code: error.code });
    throw new Error("Unable to load event availability");
  }

  const now = Date.now();
  const byTicketType = new Map<string, number>();
  let total = 0;

  for (const booking of (data ?? []) as unknown as SeatBooking[]) {
    const { orders: order, refunded_quantity: refunded } = booking.order_lines;
    const expired = order.status === "pending" && order.reservation_expires_at && Date.parse(order.reservation_expires_at) < now;
    if (booking.status === "pending" && expired) continue;

    const reserved = booking.status === "pending" ? booking.quantity : Math.max(0, booking.quantity - refunded);
    total += reserved;
    byTicketType.set(booking.ticket_type_id, (byTicketType.get(booking.ticket_type_id) ?? 0) + reserved);
  }
  return { total, byTicketType };
}

function availableOptionSeats(
  ticket: { id: string; capacity: number | null },
  eventSeats: number,
  reservedByTicketType: Map<string, number>,
) {
  if (ticket.capacity === null) return eventSeats;
  return Math.max(0, Math.min(eventSeats, ticket.capacity - (reservedByTicketType.get(ticket.id) ?? 0)));
}

export function hasEventStarted(startsAt: string) {
  return Date.parse(startsAt) <= Date.now();
}

export async function listPublishedEvents() {
  const db = appCoreDb();
  const { data, error } = await db.from("events")
    .select("id,slug,title,subtitle,short_description,starts_at,ends_at,capacity,image_url,series_id,series_name,ticket_types(id,capacity)")
    .eq("status", "published")
    .eq("ticket_types.is_active", true)
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true });

  if (error) throw new Error("Unable to load events");
  return Promise.all((data ?? []).map(async ({ ticket_types: tickets, ...event }) => {
    const reserved = await reservedSeats(event.id);
    const remainingSeats = Math.max(0, event.capacity - reserved.total);
    const optionSeats = tickets.reduce((total, ticket) => (
      total + availableOptionSeats(ticket, remainingSeats, reserved.byTicketType)
    ), 0);

    return { ...event, remaining_seats: Math.min(remainingSeats, optionSeats) };
  }));
}

export async function getPublishedEvent(slug: string) {
  const db = appCoreDb();
  const { data: event, error } = await db.from("events")
    .select("id,slug,legacy_slug,title,subtitle,short_description,description,starts_at,ends_at,capacity,image_url,series_id,series_name")
    .or(`slug.eq.${slug},legacy_slug.eq.${slug}`)
    .eq("status", "published")
    .maybeSingle();

  if (error || !event) return null;

  const [{ data: tickets, error: ticketError }, reserved] = await Promise.all([
    db.from("ticket_types")
      .select("id,name,description,price_pence,capacity")
      .eq("event_id", event.id)
      .eq("is_active", true)
      .order("price_pence", { ascending: true }),
    reservedSeats(event.id),
  ]);

  if (ticketError) {
    console.error("Unable to load ticket types", { code: ticketError.code });
    throw new Error("Unable to load ticket types");
  }

  const remainingSeats = Math.max(0, event.capacity - reserved.total);
  const ticketTypes = (tickets ?? []).map((ticket) => ({
    ...ticket,
    remaining_seats: availableOptionSeats(ticket, remainingSeats, reserved.byTicketType),
  }));
  const bookableSeats = Math.min(remainingSeats, ticketTypes.reduce((total, ticket) => total + ticket.remaining_seats, 0));

  return { ...event, ticket_types: ticketTypes, remaining_seats: bookableSeats };
}
