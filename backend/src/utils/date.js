/**
 * Date helpers
 */

/**
 * Start of the current UTC day.
 *
 * Article timestamps arrive from RSS feeds in UTC. Using server-local midnight
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

const IST_OFFSET_MINUTES = 330;

export const istDayKey = (from = new Date()) => {
  const shifted = new Date(new Date(from).getTime() + IST_OFFSET_MINUTES * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
};

export const istDayRange = (from = new Date()) => {
  const shifted = new Date(new Date(from).getTime() + IST_OFFSET_MINUTES * 60 * 1000);
  const start = new Date(`${shifted.toISOString().slice(0, 10)}T00:00:00.000Z`);
  return {
    $gte: new Date(start.getTime() - IST_OFFSET_MINUTES * 60 * 1000),
    $lt: new Date(start.getTime() + 24 * 60 * 60 * 1000),
  };
};