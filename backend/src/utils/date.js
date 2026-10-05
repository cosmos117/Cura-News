/**
 * Date helpers
 */

/**
 * Start of the current UTC day.
 *
 * Article timestamps arrive from NewsAPI in UTC. Using server-local midnight
 * (setHours(0,0,0,0)) meant a non-UTC deployment silently returned the wrong
 * "today" window, so every day boundary here is UTC.
 *
 * @param {Date} [from] - Reference date (defaults to now)
 * @returns {Date} - UTC midnight at the start of that day
 */
export const startOfUtcDay = (from = new Date()) => {
  const d = new Date(from);
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
};

/**
 * Exclusive end of the current UTC day.
 *
 * @param {Date} [from] - Reference date (defaults to now)
 * @returns {Date} - UTC midnight at the start of the next day
 */
export const endOfUtcDay = (from = new Date()) => {
  const d = new Date(from);
  return new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate() + 1,
      0,
      0,
      0,
      0,
    ),
  );
};

/**
 * A MongoDB range filter matching a whole UTC day.
 *
 * @param {Date} [from] - Reference date (defaults to now)
 * @returns {{$gte: Date, $lt: Date}} - Range filter
 */
export const utcDayRange = (from = new Date()) => ({
  $gte: startOfUtcDay(from),
  $lt: endOfUtcDay(from),
});