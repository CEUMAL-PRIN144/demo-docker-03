const fs = require('node:fs/promises');
const path = require('node:path');
const { isValidDate } = require('../utils/date');

const FILE_RE = /^(.+)(\d{4}-\d{2}-\d{2})\.json$/;

/**
 * File-backed store of PHP→ASEAN currency pairs. One JSON file per calendar
 * date (e.g. data/rates/PHP-ASEAN-2026-11-09.json). When a date's file does
 * not exist yet, it is created by rolling forward the most recent earlier file
 * (or the seed file if there is none).
 */
class RateStore {
  constructor({ ratesDir, seedFile, filePrefix }) {
    this.ratesDir = ratesDir;
    this.seedFile = seedFile;
    this.filePrefix = filePrefix;
    this.locks = new Map(); // date -> pending promise, serialises writes per file
  }

  filePath(date) {
    return path.join(this.ratesDir, `${this.filePrefix}${date}.json`);
  }

  async listDates() {
    await fs.mkdir(this.ratesDir, { recursive: true });
    const names = await fs.readdir(this.ratesDir);
    return names
      .map((n) => n.match(FILE_RE))
      .filter((m) => m && m[1] === this.filePrefix && isValidDate(m[2]))
      .map((m) => m[2])
      .sort();
  }

  async read(date) {
    try {
      return JSON.parse(await fs.readFile(this.filePath(date), 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  async write(date, doc) {
    await fs.mkdir(this.ratesDir, { recursive: true });
    const target = this.filePath(date);
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, `${JSON.stringify(doc, null, 2)}\n`);
    await fs.rename(tmp, target); // atomic replace
  }

  /** Runs `fn` exclusively for a given date's file. */
  async withLock(date, fn) {
    const prev = this.locks.get(date) || Promise.resolve();
    const run = prev.then(fn, fn);
    const tail = run.catch(() => {});
    this.locks.set(date, tail);
    try {
      return await run;
    } finally {
      if (this.locks.get(date) === tail) this.locks.delete(date);
    }
  }

  /** Returns the file for `date`, creating it by rolling forward if missing. */
  async ensure(date) {
    const existing = await this.read(date);
    if (existing) return existing;

    return this.withLock(date, async () => {
      const again = await this.read(date);
      if (again) return again;

      const earlier = (await this.listDates()).filter((d) => d < date);
      const sourceDate = earlier.at(-1);
      const source = sourceDate
        ? await this.read(sourceDate)
        : JSON.parse(await fs.readFile(this.seedFile, 'utf8'));

      const now = new Date().toISOString();
      const doc = {
        base: source.base || 'PHP',
        date,
        createdAt: now,
        updatedAt: now,
        rolledFrom: sourceDate || 'seed',
        pairs: Object.fromEntries(
          Object.entries(source.pairs).map(([pair, info]) => [
            pair,
            { country: info.country, currency: info.currency, rate: info.rate },
          ]),
        ),
      };
      await this.write(date, doc);
      return doc;
    });
  }

  /** Updates one pair's rate in the file for `date` (file must exist). */
  async setRate(date, pair, rate) {
    return this.withLock(date, async () => {
      const doc = await this.read(date);
      if (!doc) return null;
      if (!doc.pairs[pair]) return undefined;
      doc.pairs[pair] = { ...doc.pairs[pair], rate };
      doc.updatedAt = new Date().toISOString();
      await this.write(date, doc);
      return doc;
    });
  }
}

module.exports = { RateStore };
