# dashboard

Node.js + Express. Serves a static dark-themed dashboard (Tailwind via CDN, no
build step) showing one tile per backend service.

## Config (env vars)

| Var | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Port to listen on |
| `VERSION` | `dev` | Shown in the header, returned by nothing else (dashboard has no `/version` of its own yet) |
| `SERVICES` | `""` | Comma-separated `name:url` pairs, e.g. `accounts:http://accounts-service:8000,investments:http://investments-service:8000` |

## How it works

The browser never talks to backend services directly — it can't resolve their
internal DNS names, and calling them cross-origin would need CORS. Instead:

1. The client polls the dashboard's own `GET /api/tiles` every 5s.
2. The server fans that out to each configured service's `/healthz` and
   `/version`, with a 2s timeout per call.
3. A service that fails to respond renders as a greyed-out "Coming Soon" tile
   instead of erroring or disappearing.

## Run locally

```bash
npm install
PORT=3000 VERSION=1.0.0 SERVICES="accounts:http://localhost:8000" npm start
```
