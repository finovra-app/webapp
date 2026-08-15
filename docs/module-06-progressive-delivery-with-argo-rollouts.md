# Module 6: Progressive Delivery with Argo Rollouts

**Environment:** `kind` (local)
**Prerequisites:** Module 5 complete — you've recovered from a bad dashboard release three different ways

---

## Learning Objectives

By the end of this module, you should be able to:
- Explain why plain ArgoCD sync isn't enough for a release you're not fully confident in
- Convert a Deployment into an Argo Rollouts canary, with a dedicated canary Service for targeted checks
- Write an `AnalysisTemplate` that checks something plain health probes can't
- Watch a bad release get caught and automatically aborted — before it ever reaches full rollout, with zero manual rollback command

---

## 1. Why Plain Sync Isn't Enough

Every deploy so far has worked the same way: push a change, ArgoCD applies it to every Pod, and you find out afterward whether it was a good idea. Module 5 showed you exactly how bad "afterward" can be — `1.0.1` was `Healthy` by every signal ArgoCD had, and it was still broken.

**Argo Rollouts** changes the shape of a deploy: instead of replacing every Pod at once, a new release ships to a small subset of Pods first (the **canary**), gets checked automatically, and only proceeds to 100% if the check passes. If it fails, Argo Rollouts aborts on its own — the majority of traffic never touched the bad release at all.

This module's practice material is a new capability on the dashboard: `arsr319/finovra-dashboard:1.0.2` adds a `FAIL_MODE` env var (same pattern the backend services have used since Module 1) that makes a dedicated `/healthz` endpoint fail, while `/` — what plain Deployment probes check — stays green throughout. That gap is deliberate: it's what the canary analysis in this module is actually built to catch.

---

## 2. Installing Argo Rollouts

Argo Rollouts is a separate controller with its own CRDs — install both the controller and the `kubectl` plugin used to inspect rollouts.

```bash
kubectl create namespace argo-rollouts
kubectl apply -n argo-rollouts -f https://github.com/argoproj/argo-rollouts/releases/latest/download/install.yaml

# macOS
brew install argoproj/tap/kubectl-argo-rollouts

# Linux
curl -LO https://github.com/argoproj/argo-rollouts/releases/latest/download/kubectl-argo-rollouts-linux-amd64
chmod +x kubectl-argo-rollouts-linux-amd64
sudo mv kubectl-argo-rollouts-linux-amd64 /usr/local/bin/kubectl-argo-rollouts
```

Verify:

```bash
kubectl argo rollouts version
kubectl get pods -n argo-rollouts
```

No changes to ArgoCD itself are needed — it already understands the `Rollout` resource's health natively, the same way it understands a plain `Deployment`.

---

## 3. Canary Strategy, Piece by Piece

A `Rollout` looks almost exactly like the `Deployment` you've had since Module 3 — same `template`, same containers, same probes — with the resource `kind` changed and a `strategy` added:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: dashboard
spec:
  replicas: 2
  # ...same selector/template as the Deployment...
  strategy:
    canary:
      canaryService: dashboard-canary
      stableService: dashboard-stable
      steps:
        - setWeight: 50
        - analysis:
            templates:
              - templateName: dashboard-healthz-check
```

- **`canaryService` / `stableService`** — two Services the Rollout controller manages for you, each automatically pointed at just the canary Pods or just the stable Pods. You pre-create them as empty shells; the controller injects the right selector.
- **`steps`** — `setWeight: 50` splits replicas roughly 50/50 between canary and stable; `analysis` runs a check against the canary *before* going further.
- **Notice what's unchanged:** the existing `dashboard` Service (what you `port-forward` to view the app) still selects on plain `app: dashboard`, so it keeps working exactly as before — `canaryService`/`stableService` exist purely to give the analysis step something precise to check.

You'll need the two service shells and one `AnalysisTemplate`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: dashboard-canary
spec:
  selector:
    app: dashboard
  ports:
    - port: 3000
      targetPort: 3000
---
apiVersion: v1
kind: Service
metadata:
  name: dashboard-stable
spec:
  selector:
    app: dashboard
  ports:
    - port: 3000
      targetPort: 3000
```

```yaml
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: dashboard-healthz-check
spec:
  metrics:
    - name: healthz-ok
      interval: 10s
      count: 3
      successCondition: result == "ok"
      provider:
        web:
          url: "http://dashboard-canary.finovra.svc.cluster.local:3000/healthz"
          jsonPath: "{$.status}"
```

The `web` provider does an HTTP GET against the canary-specific service, pulls `status` out of the JSON response via `jsonPath`, and compares it against `successCondition`. `interval`/`count` mean "check 3 times, 10 seconds apart" — a real check across a few samples, not a single roll of the dice.

> **What happens if the HTTP call itself fails** (like our `/healthz` returning a `500`)? The metric doesn't even get to evaluate `successCondition` — a non-2xx response counts as a measurement error on its own. Enough consecutive errors (`consecutiveErrorLimit`, default `4`) aborts the rollout, same as failing the condition outright.

---

## Lab: Ship a Canary, Then Break One

All of this happens in your fork of `gitops`.

### Step 1 — Convert the dashboard to a Rollout

Replace `k8s/plain-manifests/dashboard/deployment.yaml`'s content: change `kind: Deployment` to `kind: Rollout`, bump `replicas` to `2`, bump the image to `arsr319/finovra-dashboard:1.0.2` (and `VERSION` to match), add `FAIL_MODE: "false"` to `env`, and add the `strategy.canary` block from Section 3. Add the two canary/stable Service files and the `AnalysisTemplate` alongside it in the same folder.

```bash
git add k8s/plain-manifests/dashboard/
git commit -m "Convert dashboard to an Argo Rollouts canary"
git push origin main
```

### Step 2 — Confirm the first rollout deploys cleanly

There's no prior release to canary against yet, so the very first rollout skips straight to fully deployed:

```bash
kubectl argo rollouts get rollout dashboard -n finovra
```

Wait for `Status: ✔ Healthy`, `Step: 2/2`, `SetWeight: 100`. Confirm `argocd app get finovra` also shows `Synced`/`Healthy` — ArgoCD is reading the Rollout's own status, not guessing.

### Step 3 — Ship a good change, watch the canary pass

Edit the Rollout's `dashboard-stable`/canary env — actually, just push any harmless change (e.g. leave `FAIL_MODE: "false"` as-is and bump a comment, or move straight to Step 4). This step is optional if you want to see one full successful canary cycle before breaking anything.

### Step 4 — Inject the failure

Flip `FAIL_MODE` to `"true"` in the Rollout's env, commit, push:

```bash
git add k8s/plain-manifests/dashboard/rollout.yaml
git commit -m "Simulate a bad dashboard release"
git push origin main
```

Watch it happen — this takes about a minute, so don't be surprised if nothing looks different for the first 30-40 seconds:

```bash
kubectl argo rollouts get rollout dashboard -n finovra --watch
```

You'll see `SetWeight` jump to `50`, then the analysis step start running. After a few failed checks, watch the status flip to `✖ Degraded` with a message like:

```
RolloutAborted: ... Metric "healthz-ok" assessed Error due to consecutiveErrors (5) > consecutiveErrorLimit (4): "Error Message: received non 2xx response code: 500"
```

Press `Ctrl+C`. Confirm two things:

```bash
argocd app get finovra
kubectl get svc dashboard-stable -n finovra -o jsonpath='{.spec.selector}'
curl -s http://localhost:8082/api/tiles   # if you still have the port-forward from earlier modules running
```

`Sync Status` stays `Synced` the whole time — Git and the live Rollout object agree, `FAIL_MODE: true` really is what's declared. Only `Health Status` flags the problem, because the *analysis* failed, not because anything drifted from Git. **This is worth sitting with:** the sync/health distinction from Module 3 just showed up again, in a completely different context, and it's exactly as useful here as it was there.

The stable Pods — still running the last good release — never stopped serving traffic.

### Step 5 — Fix it and confirm recovery

```bash
git revert HEAD
git push origin main
kubectl argo rollouts get rollout dashboard -n finovra --watch
```

A fresh commit is a fresh revision, so Argo Rollouts attempts the canary again from scratch — no special "retry" command needed. Watch it pass the analysis this time and promote to `Step: 2/2`, `SetWeight: 100`, `Healthy`.

**Checkpoint:** you've now watched a canary release get caught and rolled back automatically — no `argocd app rollback`, no `git revert` *before* the fact, nothing manual in the moment it mattered. The only human action was deciding what change to push next.

---

## Key Terms Glossary

| Term | Meaning |
|---|---|
| **Canary** | A small subset of Pods running the new release, checked before the rest of the fleet is updated |
| **`canaryService` / `stableService`** | Services the Rollout controller manages automatically, each scoped to just canary or just stable Pods |
| **`AnalysisTemplate`** | A reusable definition of what to check and how often, referenced by name from a Rollout's steps |
| **`web` provider** | An `AnalysisTemplate` metric type that does an HTTP GET and evaluates the response |
| **`consecutiveErrorLimit`** | How many failed HTTP calls in a row before the analysis gives up and counts it as a failure — separate from `successCondition` failing |
| **RolloutAborted** | The terminal state when analysis fails during a canary step — the release stops advancing, stable Pods keep serving |

---

## Recap Questions

1. Why does the `dashboard` Service (used for viewing the app) keep working normally throughout this whole module, while `dashboard-canary` and `dashboard-stable` exist as separate Services?
2. In Step 4, why did `Sync Status` stay `Synced` even while the Rollout was actively failing?
3. Why couldn't a plain `Deployment`'s liveness/readiness probes have caught this module's `FAIL_MODE` bug the way the canary analysis did?
4. In Step 5, why didn't you need to run any special "retry" command to get the Rollout to attempt the canary again?

---

## What's Next

In **Module 7**, we build a real dev → staging → prod promotion flow using Kustomize overlays and a PR-based workflow — plus a short add-on on Sync Waves and Lifecycle Hooks, using Finovra's own dashboard-depends-on-backends shape as the example.
