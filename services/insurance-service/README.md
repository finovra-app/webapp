# insurance-service

Node.js + Express. Sample personal finance "insurance" product.

## Endpoints

- `GET /healthz` → `200 {"status": "ok"}`
- `GET /version` → `{"version": "<VERSION>", "service": "insurance-service"}`
- `GET /policies` → 2 sample insurance policies

## Config (env vars)

| Var | Default | Meaning |
|---|---|---|
| `PORT` | `8000` | Port to listen on |
| `VERSION` | `dev` | Returned by `/version` |
| `FAIL_MODE` | `false` | When `"true"`, `GET /policies` throws instead of returning data (500) |
| `LATENCY_MS` | `0` | Artificial delay (ms) added to `GET /policies` before it responds |

## Run locally

```bash
npm install
PORT=8000 VERSION=1.0.0 npm start
```
