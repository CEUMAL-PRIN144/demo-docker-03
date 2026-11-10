const config = require('./config');
const { createApp } = require('./app');
const { RateStore } = require('./services/rateStore');
const { startDailyRoll } = require('./services/scheduler');

const store = new RateStore(config);
const app = createApp({ store, timeZone: config.timeZone });

startDailyRoll(store, config.timeZone);

app.listen(config.port, () => {
  console.log(`Currency converter listening on http://localhost:${config.port} (TZ ${config.timeZone})`);
});
