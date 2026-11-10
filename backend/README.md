# PHP → ASEAN Currency Converter API

An ExpressJS REST API that converts the Philippine Peso (PHP) to the currencies of the other ASEAN member states. It has no database: rates are stored as JSON files, **one file per date**.

## Supported pairs

| Pair    | Country           | Currency          |
|---------|-------------------|-------------------|
| PHP-BND | Brunei Darussalam | Brunei Dollar     |
| PHP-KHR | Cambodia          | Cambodian Riel    |
| PHP-IDR | Indonesia         | Indonesian Rupiah |
| PHP-LAK | Lao PDR           | Lao Kip           |
| PHP-MYR | Malaysia          | Malaysian Ringgit |
| PHP-MMK | Myanmar           | Myanmar Kyat      |
| PHP-SGD | Singapore         | Singapore Dollar  |
| PHP-THB | Thailand          | Thai Baht         |
| PHP-USD | Timor-Leste       | US Dollar         |
| PHP-VND | Vietnam           | Vietnamese Dong   |

A rate means `1 PHP = rate × QUOTE`. The reverse direction (for example THB → PHP) and conversions between two ASEAN currencies (for example SGD → MYR, which goes through PHP) are worked out from these rates.

> The seed rates in `data/seed/php-asean.json` are indicative sample values, not live market data. Use `PUT /api/rates/:pair` to set real rates.

## Rolling rate files

```
data/
  seed/php-asean.json              # starting rates
  rates/PHP-ASEAN-2026-11-09.json  # one file per date (git-ignored)
  rates/PHP-ASEAN-2026-11-10.json
```

- On startup, and at every midnight (in `Asia/Manila` by default), the server creates the file for the new date.
- A new file copies the rates from the most recent earlier file. If there is no earlier file, it copies the seed file. Each file records the date it was copied from in `rolledFrom`.
- If a request for today arrives before the file exists, the file is created on demand.
- Updates go only into today's file, so past files stay as a history.
- Each write goes to a temporary file that is then renamed over the real one, and writes to the same file run one at a time.

## Getting started

```bash
cd backend
npm install
npm start          # http://localhost:3000
npm test
```

| Env var           | Default                    | Purpose                                      |
|-------------------|----------------------------|----------------------------------------------|
| `PORT`            | `3000`                     | HTTP port                                    |
| `RATES_TZ`        | `Asia/Manila`              | Time zone that decides when a new day starts |
| `RATES_DIR`       | `data/rates`               | Folder for the per-date rate files           |
| `RATES_SEED_FILE` | `data/seed/php-asean.json` | Starting rates                               |

## Docker

Build and run from the `backend` folder:

```bash
docker build -t php-asean-api .
docker run -d --name php-asean-api -p 3000:3000 -v php-asean-rates:/app/data/rates php-asean-api
```

- The image is based on `node:22-alpine`, installs production dependencies only, and runs as the non-root `node` user.
- Rate files are written to `/app/data/rates`. Mount a named volume there (as above) so the daily files survive container restarts.
- A built-in healthcheck calls `/health`.
- The environment variables in the table above can be overridden with `-e`, for example `-e RATES_TZ=Asia/Singapore`.

## Endpoints

| Method | Path                     | Description |
|--------|--------------------------|-------------|
| GET    | `/health`                | Health check |
| GET    | `/api/currencies`        | Supported currencies |
| GET    | `/api/rates/dates`       | Dates that have a rate file |
| GET    | `/api/rates?date=`       | All pairs for a date (default: today) |
| GET    | `/api/rates/:pair?date=` | One pair, e.g. `/api/rates/PHP-THB` |
| PUT    | `/api/rates/:pair`       | Set today's rate. Body: `{ "rate": 0.57 }` |
| GET    | `/api/countries/:country/rates` | Converts a country's currency into every other supported currency. `:country` is a name (`thailand`, `Lao PDR`) or a currency code (`THB`). Query: `amount` (default `1`), `date` (optional) |
| GET    | `/api/convert`           | `from` (default `PHP`), `to`, `amount` (default `1`), `date` (optional) |

### Examples

```bash
curl "localhost:3000/api/convert?to=THB&amount=1000"
# {"from":"PHP","to":"THB","amount":1000,"rate":0.5605,"result":560.5,"date":"2026-11-09"}

curl "localhost:3000/api/convert?from=SGD&to=MYR&amount=50"
# {"from":"SGD","to":"MYR","amount":50,"rate":3.234513274,"result":161.7256637,"date":"2026-11-09","via":"PHP"}

curl "localhost:3000/api/countries/thailand/rates?amount=100"
# {"country":"Thailand","currency":"Thai Baht","code":"THB","amount":100,"date":"2026-11-09",
#  "conversions":[{"country":"Philippines","currency":"Philippine Peso","code":"PHP","rate":1.784121320,"result":178.4121320}, ...]}

curl -X PUT localhost:3000/api/rates/PHP-THB -H 'content-type: application/json' -d '{"rate":0.57}'
```

Errors return JSON in the form `{ "error": "..." }`, with status 400 for bad input and 404 for an unknown pair, a date with no file, or a future date.
