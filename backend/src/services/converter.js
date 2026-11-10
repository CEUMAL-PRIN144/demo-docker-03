/**
 * Converts between PHP and any ASEAN currency in a rate document, and between
 * two ASEAN currencies by crossing through PHP. Rates are "1 PHP = rate QUOTE".
 */
function ratesByCode(doc) {
  const map = { [doc.base]: 1 };
  for (const [pair, info] of Object.entries(doc.pairs)) {
    map[pair.split('-')[1]] = info.rate;
  }
  return map;
}

function convert(doc, from, to, amount) {
  const rates = ratesByCode(doc);
  if (!(from in rates)) throw Object.assign(new Error(`Unsupported currency: ${from}`), { status: 400 });
  if (!(to in rates)) throw Object.assign(new Error(`Unsupported currency: ${to}`), { status: 400 });

  const rate = rates[to] / rates[from];
  return {
    from,
    to,
    amount,
    rate: round(rate),
    result: round(amount * rate),
    date: doc.date,
    via: from !== doc.base && to !== doc.base ? doc.base : undefined,
  };
}

/** PHP plus every quote currency in the document, with country metadata. */
function listCurrencies(doc) {
  return [
    { code: doc.base, country: 'Philippines', currency: 'Philippine Peso' },
    ...Object.entries(doc.pairs).map(([pair, info]) => ({
      code: pair.split('-')[1],
      country: info.country,
      currency: info.currency,
    })),
  ];
}

const normalize = (s) => String(s).toLowerCase().replace(/[^a-z]/g, '');

/** Finds a currency by country name (case/space/punctuation-insensitive) or currency code. */
function findByCountry(doc, query) {
  const q = normalize(query);
  return listCurrencies(doc).find(
    (c) => normalize(c.country) === q || normalize(c.code) === q,
  );
}

/** Converts `amount` of the country's currency into every other supported currency. */
function convertFromCountry(doc, query, amount) {
  const source = findByCountry(doc, query);
  if (!source) return null;
  return {
    country: source.country,
    currency: source.currency,
    code: source.code,
    amount,
    date: doc.date,
    conversions: listCurrencies(doc)
      .filter((c) => c.code !== source.code)
      .map((c) => {
        const { rate, result } = convert(doc, source.code, c.code, amount);
        return { country: c.country, currency: c.currency, code: c.code, rate, result };
      }),
  };
}

function round(n) {
  return Number(n.toPrecision(10));
}

module.exports = { convert, convertFromCountry, findByCountry, listCurrencies, ratesByCode };
