import { LONDON_TIME_ZONE } from "@/lib/time/london";

const londonMonth = new Intl.DateTimeFormat("en-GB", {
  timeZone: LONDON_TIME_ZONE, year: "numeric", month: "2-digit",
});
const monthName = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "long" });

export function eventRevenueMonthKey(date: Date) {
  const parts = londonMonth.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
}

export type EventRevenueMonth = {
  key: string;
  name: string;
  year: number;
  current: number;
  previous: number;
  inProgress: boolean;
};

export function eventRevenueComparison(now: Date, totals: ReadonlyMap<string, number>): EventRevenueMonth[] {
  const [year, month] = eventRevenueMonthKey(now).split("-").map(Number);
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 12 + index, 1));
    const chartYear = date.getUTCFullYear();
    const suffix = `-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    const key = `${chartYear}${suffix}`;
    return {
      key,
      name: monthName.format(date),
      year: chartYear,
      current: totals.get(key) ?? 0,
      previous: totals.get(`${chartYear - 1}${suffix}`) ?? 0,
      inProgress: index === 11,
    };
  });
}
