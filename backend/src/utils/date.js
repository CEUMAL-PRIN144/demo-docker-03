const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Returns YYYY-MM-DD for the given instant in the given IANA time zone. */
function dateInZone(timeZone, at = new Date()) {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

function isValidDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Milliseconds from `now` until the next calendar day starts in `timeZone`. */
function msUntilNextDay(timeZone, now = new Date()) {
  const today = dateInZone(timeZone, now);
  // Binary-search the first instant whose zoned date differs from today (DST-safe).
  let lo = now.getTime();
  let hi = lo + 26 * 60 * 60 * 1000;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (dateInZone(timeZone, new Date(mid)) === today) lo = mid;
    else hi = mid;
  }
  return hi - now.getTime();
}

module.exports = { dateInZone, isValidDate, msUntilNextDay };
