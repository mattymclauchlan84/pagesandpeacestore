import "server-only";

export type EventTicketOption = {
  id: string;
  name: string;
  description: string | null;
  price_pence: number;
  capacity: number | null;
  is_active: boolean;
};

const maxInteger = 2_147_483_647;

export const readEventField = (data: FormData, name: string) => String(data.get(name) ?? "").trim();

export function isEventUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function readCapacity(value: string) {
  const capacity = Number(value);
  return /^\d+$/.test(value) && Number.isInteger(capacity) && capacity <= maxInteger ? capacity : null;
}

export function readTicketOptions(formData: FormData): EventTicketOption[] | null {
  const ids = formData.getAll("ticket_id").map(String);
  if (new Set(ids).size !== ids.length || ids.some((id) => !isEventUuid(id))) return null;

  const options: EventTicketOption[] = [];
  for (const [index, id] of ids.entries()) {
    const suffix = index === 0 ? "" : `_${id}`;
    const name = readEventField(formData, `ticket_name${suffix}`);
    const price = readEventField(formData, `ticket_price${suffix}`);
    const pricePence = Math.round(Number(price) * 100);
    const capacityValue = readEventField(formData, `ticket_capacity${suffix}`);
    const capacity = readCapacity(capacityValue);

    if (!name || !/^(?:\d+|\d*\.\d{1,2})$/.test(price) || pricePence > maxInteger || (capacityValue && capacity === null)) {
      return null;
    }

    options.push({
      id,
      name,
      description: readEventField(formData, `ticket_description${suffix}`) || null,
      price_pence: pricePence,
      capacity,
      is_active: readEventField(formData, `ticket_active${suffix}`) === "on",
    });
  }
  return options;
}

export function ticketSaveError(error: { message: string }) {
  switch (error.message) {
    case "EVENT_CAPACITY_BELOW_RESERVATIONS":
      return "Total capacity cannot be lower than the number of reserved places.";
    case "TICKET_CAPACITY_BELOW_RESERVATIONS":
      return "A ticket option’s capacity cannot be lower than the number already reserved for it.";
    case "GROUP_RULE_INVALID":
      return "Choose two different ticket options that are available for sale, or turn off the child and adult booking rule.";
    case "INVALID_TICKETS":
      return "Unable to save these ticket options. Check the details and try again.";
    case "EVENT_NOT_FOUND":
      return "This event no longer exists.";
    default:
      return "Unable to save this event. Please try again.";
  }
}
