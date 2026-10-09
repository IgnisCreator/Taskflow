// Due dates are calendar dates ("YYYY-MM-DD") with no time and no time zone. They are never turned
// into a Date in local time: the string is stored, sent and displayed as is.

/** True for a real calendar day, e.g. rejects "2026-02-30". */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  // An impossible month such as 13 gives an invalid Date; a day such as Feb 30 rolls over.
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "2026-03-01" -> "Mar 1, 2026", independent of the viewer's time zone. */
export function formatDueDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return `${MONTHS[month! - 1]} ${day}, ${year}`;
}
