/**
 * Ingestion scheduler.
 *
 * The pipeline is also exposed through the protected admin ingest endpoint.
 * This scheduler keeps ingestion moving continuously through the day.
 *
 * This runs the same pipeline on a fixed interval so articles accumulate
 * continuously through the day. It deliberately reuses newsProcessor's existing
 * in-flight lock, so a slow run that outlives its interval simply skips the
 * next tick rather than overlapping.
 */

import { config } from "../config/env.js";

const intervalMs = Math.max(config.INGEST_INTERVAL_MINUTES, 1) * 60 * 1000;

let timer = null;
let ticker = null;
let started = false;

/**
 * Run the pipeline once, swallowing errors.
 *
 * A failed run must never take the interval down with it: an unhandled
 * rejection here would crash the whole server, turning a transient feed outage
 * into an outage of the API itself.
 */
const runOnce = async (trigger) => {
  try {
    const { default: newsProcessor } = await import("./newsProcessor.js");
    const report = await newsProcessor.processDailyNews();

    if (report.alreadyRunning) {
      console.log(`⏭️  Scheduled ingest skipped (${trigger}): a run is already in progress`);
      return;
    }

    console.log(
      `✅ Scheduled ingest (${trigger}) finished: ${report.stats.stored} stored, ` +
        `${report.stats.duplicates} duplicates`,
    );
  } catch (error) {
    console.error(`❌ Scheduled ingest (${trigger}) failed:`, error.message);
  }
};

/**
 * Start the periodic pipeline.
 *
 * Disabled under NODE_ENV=test so the verification suite never triggers a
 * background run against its in-memory database.
 *
 * @returns {boolean} true when the scheduler is running
 */
export const startScheduler = () => {
  if (config.isTest) {
    console.log("🧪 Ingestion scheduler disabled (NODE_ENV=test)");
    return false;
  }

  if (started) return true;

  started = true;

  // Kick off shortly after boot rather than instantly, so the server is already
  // listening and a slow Mongo connect cannot delay startup.
  timer = setInterval(() => runOnce("interval"), intervalMs);
  // Do not hold the event loop open on our account; the HTTP server does that.
  timer.unref?.();

  // Populate immediately so a freshly restarted server is not empty for a
  // whole interval. Delayed slightly to let the DB connection settle.
  ticker = setTimeout(() => runOnce("startup"), 5000);
  ticker.unref?.();

  console.log(
    `⏰ Ingestion scheduler started (every ${config.INGEST_INTERVAL_MINUTES} min)`,
  );
  return true;
};

/** Stop the periodic pipeline. Safe to call when not running. */
export const stopScheduler = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (ticker) {
    clearTimeout(ticker);
    ticker = null;
  }
  if (started) console.log("⏹️  Ingestion scheduler stopped");
  started = false;
};

export const isSchedulerRunning = () => started;