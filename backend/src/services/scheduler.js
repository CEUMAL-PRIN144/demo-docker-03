const { dateInZone, msUntilNextDay } = require('../utils/date');

/**
 * Creates today's rate file now, then rolls a new file at every midnight in
 * `timeZone`. Returns a stop() function.
 */
function startDailyRoll(store, timeZone, log = console) {
  let timer;
  let stopped = false;

  const roll = async () => {
    const date = dateInZone(timeZone);
    try {
      const doc = await store.ensure(date);
      log.info(`[rates] file ready for ${date} (rolled from ${doc.rolledFrom})`);
    } catch (err) {
      log.error(`[rates] failed to roll file for ${date}:`, err);
    }
  };

  const scheduleNext = () => {
    if (stopped) return;
    // +1s guard so we land safely inside the new day.
    timer = setTimeout(async () => {
      await roll();
      scheduleNext();
    }, msUntilNextDay(timeZone) + 1000);
    timer.unref?.();
  };

  roll().then(scheduleNext);

  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

module.exports = { startDailyRoll };
