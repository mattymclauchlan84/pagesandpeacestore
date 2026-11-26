export type EventBookingRule = {
  child_ticket_id: string;
  adult_ticket_id: string;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readEventBookingRule(value: unknown): EventBookingRule | null {
  if (value == null) return null;

  if (typeof value === "object" && "child_ticket_id" in value && "adult_ticket_id" in value) {
    const { child_ticket_id, adult_ticket_id } = value;
    if (
      typeof child_ticket_id === "string" &&
      typeof adult_ticket_id === "string" &&
      uuid.test(child_ticket_id) &&
      uuid.test(adult_ticket_id) &&
      child_ticket_id.toLowerCase() !== adult_ticket_id.toLowerCase()
    ) {
      return { child_ticket_id: child_ticket_id.toLowerCase(), adult_ticket_id: adult_ticket_id.toLowerCase() };
    }
  }
  throw new Error("Invalid event booking rule");
}

export function isMissingEventBookingRuleColumn(error: { code: string; message: string } | null) {
  return Boolean(
    error &&
    (error.code === "42703" || error.code === "PGRST204") &&
    /\bbooking_rule\b/i.test(error.message),
  );
}

export function hasRequiredGroupTickets(rule: EventBookingRule, ticketIds: ReadonlySet<string>) {
  return ticketIds.has(rule.child_ticket_id) && ticketIds.has(rule.adult_ticket_id);
}
