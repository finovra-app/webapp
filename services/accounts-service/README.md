# accounts-service

Node.js + Express. Sample personal finance "accounts" product.

## Endpoints

- `GET /healthz` → `200 {"status": "ok"}`
- `GET /version` → `{"version": "<VERSION>", "service": "accounts-service"}`
- `GET /account` → sample balance + 3 sample transactions

## Config (env vars)

| Var | Default | Meaning |
|---|---|---|
| `PORT` | `8000` | Port to listen on |
| `VERSION` | `dev` | Returned by `/version` |
| `FAIL_MODE` | `false` | When `"true"`, `GET /account` throws instead of returning data (500 via Express's default error handler) — for simulating a bad release later |
| `LATENCY_MS` | `0` | Artificial delay (ms) added to `GET /account` before it responds — for canary/analysis failure injection later |

## Run locally

```bash
npm install
PORT=8000 VERSION=1.0.0 npm start
```
