const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createApp } = require('../src/app');
const { RateStore } = require('../src/services/rateStore');
const { dateInZone, msUntilNextDay } = require('../src/utils/date');

const TZ = 'Asia/Manila';
const seedFile = path.join(__dirname, '..', 'data', 'seed', 'php-asean.json');
let dir, store, server, base;

const get = async (p) => {
  const r = await fetch(base + p);
  return { status: r.status, body: await r.json() };
};

before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rates-'));
  store = new RateStore({ ratesDir: dir, seedFile, filePrefix: 'PHP-ASEAN-' });
  server = createApp({ store, timeZone: TZ }).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await fs.rm(dir, { recursive: true, force: true });
});

test("today's file is created from seed on first request", async () => {
  const today = dateInZone(TZ);
  const { status, body } = await get('/api/rates');
  assert.equal(status, 200);
  assert.equal(body.date, today);
  assert.equal(body.rolledFrom, 'seed');
  assert.equal(Object.keys(body.pairs).length, 10);
  await fs.access(path.join(dir, `PHP-ASEAN-${today}.json`));
});

test('new date rolls forward from latest earlier file', async () => {
  await store.write('2020-01-01', {
    base: 'PHP', date: '2020-01-01',
    pairs: { 'PHP-THB': { country: 'Thailand', currency: 'Thai Baht', rate: 0.6 } },
  });
  const doc = await store.ensure('2020-01-02');
  assert.equal(doc.rolledFrom, '2020-01-01');
  assert.equal(doc.pairs['PHP-THB'].rate, 0.6);
  assert.deepEqual((await store.listDates()).slice(0, 2), ['2020-01-01', '2020-01-02']);
});

test('concurrent ensure creates a single consistent file', async () => {
  const docs = await Promise.all(Array.from({ length: 10 }, () => store.ensure('2020-02-01')));
  assert.ok(docs.every((d) => d.createdAt === docs[0].createdAt));
});

test('convert PHP -> THB, THB -> PHP and cross-rate', async () => {
  const thb = (await get('/api/rates/php-thb')).body.rate;
  const a = await get('/api/convert?from=PHP&to=THB&amount=100');
  assert.equal(a.status, 200);
  assert.ok(Math.abs(a.body.result - 100 * thb) < 1e-6);

  const b = await get(`/api/convert?from=THB&to=PHP&amount=${100 * thb}`);
  assert.ok(Math.abs(b.body.result - 100) < 1e-6);

  const c = await get('/api/convert?from=SGD&to=MYR&amount=1');
  assert.equal(c.body.via, 'PHP');
});

test('PUT updates today rate', async () => {
  const r = await fetch(`${base}/api/rates/PHP-VND`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rate: 455 }),
  });
  assert.equal(r.status, 200);
  assert.equal((await get('/api/rates/PHP-VND')).body.rate, 455);
});

test('validation and not-found errors', async () => {
  assert.equal((await get('/api/convert?to=XXX')).status, 400);
  assert.equal((await get('/api/convert?to=THB&amount=abc')).status, 400);
  assert.equal((await get('/api/rates?date=2026-13-40')).status, 400);
  assert.equal((await get('/api/rates?date=1999-01-01')).status, 404);
  assert.equal((await get('/api/rates?date=2999-01-01')).status, 404);
  assert.equal((await get('/api/rates/PHP-JPY')).status, 404);
});

test('msUntilNextDay lands on next Manila midnight', () => {
  const now = new Date('2026-11-09T15:30:00Z'); // 23:30 Manila
  assert.equal(msUntilNextDay(TZ, now), 30 * 60 * 1000);
});

test('country endpoint converts into every other currency', async () => {
  const { status, body } = await get('/api/countries/Thailand/rates?amount=100');
  assert.equal(status, 200);
  assert.equal(body.code, 'THB');
  assert.equal(body.conversions.length, 10);
  assert.ok(!body.conversions.some((c) => c.code === 'THB'));
  const php = body.conversions.find((c) => c.code === 'PHP');
  const thb = (await get('/api/rates/PHP-THB')).body.rate;
  assert.ok(Math.abs(php.result - 100 / thb) < 1e-6);

  assert.equal((await get('/api/countries/lao%20pdr/rates')).body.code, 'LAK');
  assert.equal((await get('/api/countries/philippines/rates')).body.code, 'PHP');
  assert.equal((await get('/api/countries/sgd/rates')).body.country, 'Singapore');
  assert.equal((await get('/api/countries/japan/rates')).status, 404);
  assert.equal((await get('/api/countries/thailand/rates?amount=-1')).status, 400);
});
