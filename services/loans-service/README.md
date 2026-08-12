# loans-service

Python + FastAPI. Sample personal finance "loans" product.

## Endpoints

- `GET /healthz` → `200 {"status": "ok"}`
- `GET /version` → `{"version": "<VERSION>", "service": "loans-service"}`
- `GET /loans` → sample loan balance + next payment date/amount

## Config (env vars)

| Var | Default | Meaning |
|---|---|---|
| `PORT` | `8000` | Port to listen on |
| `VERSION` | `dev` | Returned by `/version` |
| `FAIL_MODE` | `false` | When `"true"`, `GET /loans` raises instead of returning data (500) |
| `LATENCY_MS` | `0` | Artificial delay (ms) added to `GET /loans` before it responds |

## Run locally

```bash
pip install -r requirements.txt
PORT=8000 VERSION=4.0.0 python app.py
```
