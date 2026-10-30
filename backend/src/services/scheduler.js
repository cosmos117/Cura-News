/**
 * Ingestion scheduler.
 *
 * The pipeline is also exposed through the protected admin ingest endpoint.
 *
 * Ingestion runs only within the IST window (05:00–23:59 IST). At 00:00 IST
 * all articles are cleaned up and ingestion pauses until 05:00 IST the next
 * day. This keeps the database refreshed during active hours and reset daily.
 *
 * This runs the same pipeline on a fixed interval so articles accumulate
 * continuously through the day. It deliberately reuses newsProcessor's existing
 * in-flight lock, so a slow run that outlives its interval simply skips the
 * next tick rather than overlapping.
 */

import { config } from "../config/env.js";
import News from "../models/News.js";

// Indian Standard Time offset: UTC+5:30
const IST_OFFSET_MS = config.IST_OFFSET_MINUTES * 60 * 1000;

const intervalMs = Math.max(config.INGEST_INTERVAL_MINUTES, 1) * 60 * 1000;

let timer = null;
let ticker = null;
let midnightTimer = null;
let startTimer = null;
let started = false;

/** Minutes since midnight in IST (0–1439). */
function getISTMinutes() {
  const d = new Date(Date.now() + IST_OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** True when the current IST time is inside 05:00–23:59:59 IST. */
function isIngestionWindow() {
  const m = getISTMinutes();
  return m >= 300 && m < 1440;
}

/** True when the current IST time is exactly 00:00 IST (midnight). */
function isCleanupTime() {
  return getISTMinutes() === 0;
}

/**
 * Run the pipeline once, swallowing errors.
 * A failed run must never take the interval down with it.
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

/** Delete every article in the database (daily cleanup at 00:00 IST). */
const runCleanup = async (trigger) => {
  try {
    const result = await News.deleteMany({});
    console.log(`🧹 Scheduled cleanup (${trigger}) deleted ${result.deletedCount} articles`);
  } catch (error) {
    console.error(`❌ Scheduled cleanup (${trigger}) failed:`, error.message);
  }
};

/** Compute delay (ms) until the next 00:00 IST. */
function delayUntilMidnight() {
  const now = new Date();
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  const nextMidnight = new Date(istNow);
  nextMidnight.setUTCHours(0, 0, 0, 0);
  nextMidnight.setUTCDate(nextMidnight.getUTCDate() + 1);
  const nextMidnightUtc = new Date(nextMidnight.getTime() - IST_OFFSET_MS);
  return Math.max(nextMidnightUtc.getTime() - now.getTime(), 0);
}

/** Compute delay (ms) until the next 05:00 IST. */
function delayUntilFiveAM() {
  const now = new Date();
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  const nextStart = new Date(istNow);
  nextStart.setUTCHours(5, 0, 0, 0);
  if (nextStart.getTime() <= istNow.getTime()) {
    nextStart.setUTCDate(nextStart.getUTCDate() + 1);
  }
  const nextStartUtc = new Date(nextStart.getTime() - IST_OFFSET_MS);
  return Math.max(nextStartUtc.getTime() - now.getTime(), 0);
}

/** Schedule the one-time midnight cleanup + 05:00 IST restart. */
function scheduleMidnightCycle() {
  if (midnightTimer) clearTimeout(midnightTimer);
  midnightTimer = setTimeout(async () => {
    await runCleanup("midnight");
    scheduleStartAtFiveAM();
  }, delayUntilMidnight());
  midnightTimer.unref?.();
}

/** Resume the interval scheduler at 05:00 IST. */
function scheduleStartAtFiveAM() {
  if (startTimer) clearTimeout(startTimer);
  startTimer = setTimeout(() => {
    startIntervalScheduler();
    scheduleMidnightCycle();
  }, delayUntilFiveAM());
  startTimer.unref?.();
}

/** Start the periodic ingestion loop (only runs inside the IST window). */
function startIntervalScheduler() {
  if (timer) clearInterval(timer);
  timer = setInterval(async () => {
    if (isCleanupTime()) {
      await runCleanup("interval-check");
      scheduleStartAtFiveAM();
      return;
    }
    if (isIngestionWindow()) {
      await runOnce("interval");
    }
    // Outside window (00:01–04:59 IST): skip, wait for 05:00 IST restart.
  }, intervalMs);
  timer.unref?.();
}

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

  // Populate immediately if within the window, so a fresh server isn't empty.
  if (isIngestionWindow()) {
    ticker = setTimeout(() => runOnce("startup"), 5000);
    ticker.unref?.();
  }

  // Start the interval loop and the midnight cleanup schedule.
  startIntervalScheduler();
  scheduleMidnightCycle();

  console.log(
    `⏰ Ingestion scheduler started (window: 05:00–23:59 IST, interval: ${config.INGEST_INTERVAL_MINUTES} min, cleanup at 00:00 IST)`,
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
  if (midnightTimer) {
    clearTimeout(midnightTimer);
    midnightTimer = null;
  }
  if (startTimer) {
    clearTimeout(startTimer);
    startTimer = null;
  }
  if (started) console.log("⏹️  Ingestion scheduler stopped");
  started = false;
};