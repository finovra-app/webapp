# investments-service

Python + FastAPI. Sample personal finance "investments" product.

## Endpoints

- `GET /healthz` → `200 {"status": "ok"}`
- `GET /version` → `{"version": "<VERSION>", "service": "investments-service"}`
- `GET /portfolio` → sample holdings + total portfolio value

## Config (env vars)

| Var | Default | Meaning |
|---|---|---|
| `PORT` | `8000` | Port to listen on |
| `VERSION` | `dev` | Returned by `/version` |
| `FAIL_MODE` | `false` | When `"true"`, `GET /portfolio` raises instead of returning data (500) |
| `LATENCY_MS` | `0` | Artificial delay (ms) added to `GET /portfolio` before it responds |

## Run locally

```bash
pip install -r requirements.txt
PORT=8000 VERSION=1.0.0 python app.py
```
