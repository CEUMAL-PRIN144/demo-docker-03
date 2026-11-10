const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

module.exports = {
  port: Number(process.env.PORT) || 3000,
  // Calendar day boundaries are evaluated in this zone (default: Philippine time).
  timeZone: process.env.RATES_TZ || 'Asia/Manila',
  ratesDir: path.resolve(process.env.RATES_DIR || path.join(ROOT, 'data', 'rates')),
  seedFile: path.resolve(process.env.RATES_SEED_FILE || path.join(ROOT, 'data', 'seed', 'php-asean.json')),
  filePrefix: 'PHP-ASEAN-',
};
