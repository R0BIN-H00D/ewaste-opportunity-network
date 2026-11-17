'use strict';
// A small in-process scheduler for the jobs that must run on their own (today: pickup reminders). One timer, one run at a time,
// and a failing job is logged and tried again next time rather than stopping anything. It is safe to run on several servers
// at once because each job claims its own work in the database before acting on it.
const logger = require('../utils/logger');
const reminders = require('../services/reminderService');

const JOBS = [{ name: 'pickup reminders', run: () => reminders.sendDue() }];
let timer = null;
let running = false;

async function tick(jobs = JOBS) {
  if (running) return { skipped: true }; // the last run is still going: do not pile up
  running = true;
  const results = {};
  try {
    for (const job of jobs) {
      try {
        results[job.name] = await job.run();
      } catch (err) {
        logger.warn({ job: job.name, err: err.message }, 'a scheduled job failed; it will run again next time');
        results[job.name] = { failed: true };
      }
    }
  } finally {
    running = false;
  }
  return results;
}

/** Starts the timer (idempotent). The first run is a few seconds after start-up. */
function start({ intervalMs = 5 * 60 * 1000, firstRunMs = 5000 } = {}) {
  if (timer) return;
  timer = setInterval(() => { tick(); }, intervalMs);
  timer.unref?.();
  const first = setTimeout(() => { tick(); }, firstRunMs);
  first.unref?.();
  logger.info({ everyMinutes: intervalMs / 60000 }, 'scheduler started');
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, tick, JOBS };