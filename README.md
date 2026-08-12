# Finoxa

A fake personal finance dashboard built for the ArgoCD/GitOps Udemy course.
Each backend "product" (accounts, investments, insurance, loans) shows up as a
tile on the `dashboard` frontend.

**Status:** all 4 backend services + dashboard scaffolded. Kubernetes
manifests, Helm chart, Kustomize overlays, CI workflow, and build script are
not built yet.

## Versioning

All services are versioned **in lockstep** — one release number for the whole
app, bumped each time a new tile is added:

| Version | Adds | Tiles live | Still "Coming Soon" |
|---|---|---|---|
| `1.0.0` | accounts | Accounts | Insurance, Investments, Loans |
| `2.0.0` | insurance | Accounts, Insurance | Investments, Loans |
| `3.0.0` | investments | Accounts, Insurance, Investments | Loans |
| `4.0.0` | loans | Accounts, Insurance, Investments, Loans | — |

The dashboard's `SERVICES` env var always lists **all 4** backend URLs,
regardless of version — a service with no running container just times out and
renders greyed-out with "Coming Soon" instead of being omitted. That's what
makes the version-to-version diff visible to a viewer.

Every image is published to Docker Hub as `arsr319/finoxa-<service>:<version>`.
Because it's lockstep, most tags across versions point at byte-identical
images (e.g. `accounts-service` hasn't changed since `1.0.0`, but is still
tagged `2.0.0`/`3.0.0`/`4.0.0`) — a deliberate simplification for this
early, narrative part of the course. Once GitHub Actions/CI is introduced,
each service will get its own independently-bumped version instead.

> Note: `insurance-service:1.0.0` and `investments-service:1.0.0` also exist
> on Docker Hub from an earlier (abandoned) per-service versioning attempt —
> they're stale and not referenced anywhere in this repo. Safe to delete from
> Docker Hub whenever convenient.

## Run locally (dev — builds from source)

```bash
docker compose up --build
```

Open http://localhost:8082 — all 4 tiles, since local dev always runs
everything.

## Run a specific published version (pulls from Docker Hub)

```bash
cd deploy
docker compose -p finoxa-v1 -f docker-compose.v1.yml up -d   # Accounts only
docker compose -p finoxa-v2 -f docker-compose.v2.yml up -d   # + Insurance
docker compose -p finoxa-v3 -f docker-compose.v3.yml up -d   # + Investments
docker compose -p finoxa-v4 -f docker-compose.v4.yml up -d   # + Loans
```

All four share host port 8082, so bring one down before starting the next:

```bash
docker compose -p finoxa-v1 -f docker-compose.v1.yml down
```
