import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export function todayISO(timeZone: string, now = new Date()): string {
  return formatInTimeZone(now, timeZone, "yyyy-MM-dd");
}

export function formatStamp(value: Date, timeZone: string): string {
  return formatInTimeZone(value, timeZone, "yyyy-MM-dd HH:mm");
}

export function businessDayRange(date: string, timeZone: string): { start: Date; end: Date } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Use a date in YYYY-MM-DD format.");
  }
  return {
    start: fromZonedTime(`${date}T00:00:00.000`, timeZone),
    end: fromZonedTime(`${date}T23:59:59.999`, timeZone),
  };
}

export function businessRange(
  from: string,
  to: string,
  timeZone: string,
): { start: Date; end: Date } {
  const start = businessDayRange(from, timeZone).start;
  const end = businessDayRange(to, timeZone).end;
  if (start.getTime() > end.getTime()) {
    throw new Error("The start date must be on or before the end date.");
  }
  return { start, end };
}

export function parseBusinessDateTime(value: string, timeZone: string): Date {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return fromZonedTime(`${trimmed}T00:00:00.000`, timeZone);
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
    return fromZonedTime(`${trimmed}:00.000`, timeZone);
  }
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    const normalized = trimmed.replace(" ", "T");
    const withSeconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)
      ? `${normalized}:00`
      : normalized;
    return fromZonedTime(withSeconds, timeZone);
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Enter a date and time such as 2026-01-15 14:30.");
  }
  return parsed;
}
