const express = require('express');
const { convert, convertFromCountry, listCurrencies } = require('../services/converter');
const { dateInZone, isValidDate } = require('../utils/date');

const httpError = (status, message) => Object.assign(new Error(message), { status });

module.exports = function ratesRouter({ store, timeZone }) {
  const router = express.Router();
  const today = () => dateInZone(timeZone);

  /** Resolves the rate file for ?date= (defaults to today; today's file rolls automatically). */
  async function loadDoc(req) {
    const date = req.query.date ?? today();
    if (!isValidDate(date)) throw httpError(400, 'date must be in YYYY-MM-DD format');
    const t = today();
    if (date > t) throw httpError(404, `No rates for future date ${date}`);
    const doc = date === t ? await store.ensure(date) : await store.read(date);
    if (!doc) throw httpError(404, `No rate file for ${date}`);
    return doc;
  }

  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

  // GET /api/currencies — supported currencies (PHP + ASEAN quotes)
  router.get('/currencies', wrap(async (req, res) => {
    const doc = await store.ensure(today());
    res.json({ base: doc.base, currencies: listCurrencies(doc) });
  }));

  // GET /api/rates/dates — dates that have a rate file
  router.get('/rates/dates', wrap(async (req, res) => {
    await store.ensure(today());
    res.json({ dates: await store.listDates() });
  }));

  // GET /api/rates?date=YYYY-MM-DD — all pairs for a date
  router.get('/rates', wrap(async (req, res) => {
    res.json(await loadDoc(req));
  }));

  // GET /api/rates/:pair?date= — a single pair, e.g. PHP-THB
  router.get('/rates/:pair', wrap(async (req, res) => {
    const doc = await loadDoc(req);
    const pair = req.params.pair.toUpperCase();
    const info = doc.pairs[pair];
    if (!info) throw httpError(404, `Unknown pair ${pair}`);
    res.json({ pair, date: doc.date, ...info });
  }));

  // PUT /api/rates/:pair { rate } — update today's rate for a pair
  router.put('/rates/:pair', wrap(async (req, res) => {
    const rate = Number(req.body?.rate);
    if (!Number.isFinite(rate) || rate <= 0) throw httpError(400, 'rate must be a positive number');
    const date = today();
    await store.ensure(date);
    const pair = req.params.pair.toUpperCase();
    const doc = await store.setRate(date, pair, rate);
    if (!doc) throw httpError(404, `Unknown pair ${pair}`);
    res.json({ pair, date, ...doc.pairs[pair] });
  }));

  // GET /api/countries/:country/rates?amount=&date=
  // Converts the country's currency into every other supported currency.
  // :country is a country name (e.g. "thailand", "Lao PDR") or currency code (e.g. "THB").
  router.get('/countries/:country/rates', wrap(async (req, res) => {
    const amount = req.query.amount === undefined ? 1 : Number(req.query.amount);
    if (!Number.isFinite(amount) || amount < 0) throw httpError(400, 'amount must be a non-negative number');
    const result = convertFromCountry(await loadDoc(req), req.params.country, amount);
    if (!result) throw httpError(404, `Unknown country ${req.params.country}`);
    res.json(result);
  }));

  // GET /api/convert?from=PHP&to=THB&amount=100&date=
  router.get('/convert', wrap(async (req, res) => {
    const from = String(req.query.from || 'PHP').toUpperCase();
    const to = String(req.query.to || '').toUpperCase();
    const amount = req.query.amount === undefined ? 1 : Number(req.query.amount);
    if (!to) throw httpError(400, 'to is required');
    if (!Number.isFinite(amount) || amount < 0) throw httpError(400, 'amount must be a non-negative number');
    res.json(convert(await loadDoc(req), from, to, amount));
  }));

  return router;
};
