/**
 * Format an ISO date string or epoch ms for display in the user's locale.
 */
export function formatDateTimeDisplay(value, fallback = "—") {
  if (value == null || value === "") return fallback;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
