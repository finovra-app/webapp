# Module 6: Progressive Delivery with Argo Rollouts

**Environment:** `kind` (local)
**Prerequisites:** Module 5 complete — you've recovered from a bad dashboard release three different ways

---

## Learning Objectives

By the end of this module, you should be able to:
- Explain why plain ArgoCD sync isn't enough for a release you're not fully confident in
- Convert a Helm-templated Deployment into an Argo Rollouts canary, with a dedicated canary Service for targeted checks
- Write an `AnalysisTemplate` that checks something plain health probes can't
- Watch a bad release get caught and automatically aborted — before it ever reaches full rollout, with zero manual rollback command

---

## 1. Why Plain Sync Isn't Enough

Every deploy so far has worked the same way: push a change, ArgoCD applies it to every Pod, and you find out afterward whether it was a good idea. Module 5 showed you exactly how bad "afterward" can be — `1.0.1` was `Healthy` by every signal ArgoCD had, and it was still broken.

**Argo Rollouts** changes the shape of a deploy: instead of replacing every Pod at once, a new release ships to a small subset of Pods first (the **canary**), gets checked automatically, and only proceeds to 100% if the check passes. If it fails, Argo Rollouts aborts on its own — the majority of traffic never touched the bad release at all.

This module's practice material is a new, genuinely broken build: `arsr319/finovra-dashboard:1.0.3`. It's not the same image as the good release with a flag flipped — it's a different artifact, with a bug baked into its own Dockerfile default, the same way `1.0.1` was in Module 5. What's new this time is *where* the bug lives: it breaks a dedicated `/healthz` endpoint while `/` — what a plain Deployment's probes check — stays green throughout. That gap is deliberate: it's what the canary analysis in this module is actually built to catch.

> **Would a bad config on a good image trigger the same thing?** Yes, and it's worth knowing that up front. If `1.0.2` deployed fine but a bad environment variable or misconfigured dependency broke `/healthz` at runtime, the `AnalysisTemplate` you're about to build would catch that exactly the same way — it doesn't care *why* the check failed, only that it did. This module ships a bad image because "ship a new release" is the more common real-world trigger for a canary, but config-only regressions are just as real, and just as catchable by the same mechanism.

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

## 3. Canary Strategy, In the Chart

Since Module 4, `dashboard`'s template has lived at `helm-chart/templates/dashboard.yaml` as a plain `Deployment`. Converting it to a `Rollout` is the same edit you'd make to raw YAML — swap `apiVersion`/`kind`, add a `strategy` block — it just happens inside a Helm template, so the parts that were already parameterized (image tag, resources) stay exactly as they were:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: dashboard
spec:
  replicas: {{ .Values.dashboard.replicas }}
  # ...same selector/template as the Deployment, including the
  # {{ .Values.dashboard.image.tag | default .Values.image.tag }} pattern from Module 4...
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
- **Notice what's *not* here:** no `FAIL_MODE` env var, no extra `values.yaml` field for it. The bug lives entirely in the `1.0.3` image itself — the chart doesn't need to know anything special to trigger it. A canary of a bad *release* is just a canary of a bad *image tag*, the same "bump a value" motion as everything since Module 5.

The two canary/stable Services and the `AnalysisTemplate` don't need any `{{ }}` templating at all — they're static, so they live in one new chart template file, `dashboard-canary.yaml`:

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
---
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

### Step 1 — Convert the dashboard's Helm template to a Rollout

Replace `helm-chart/templates/dashboard.yaml`'s content with this in full — note **both** `apiVersion` and `kind` change at the top, not just `kind`: `Rollout` is a different CRD entirely, not a renamed `Deployment`, so leaving `apiVersion: apps/v1` in place will make the apply fail:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: dashboard
  labels:
    app: dashboard
spec:
  replicas: {{ .Values.dashboard.replicas }}
  selector:
    matchLabels:
      app: dashboard
  template:
    metadata:
      labels:
        app: dashboard
    spec:
      containers:
        - name: dashboard
          image: "{{ .Values.image.repository }}/finovra-dashboard:{{ .Values.dashboard.image.tag | default .Values.image.tag }}"
          ports:
            - containerPort: 3000
          env:
            - name: PORT
              value: "3000"
            - name: VERSION
              value: "{{ .Values.dashboard.image.tag | default .Values.image.tag }}"
            - name: SERVICES
              value: "accounts:http://accounts-service:8000,insurance:http://insurance-service:8000,investments:http://investments-service:8000,loans:http://loans-service:8000"
          livenessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 3
          readinessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 3
          resources:
            {{- toYaml .Values.dashboard.resources | nindent 12 }}
  strategy:
    canary:
      canaryService: dashboard-canary
      stableService: dashboard-stable
      steps:
        - setWeight: 50
        - analysis:
            templates:
              - templateName: dashboard-healthz-check
---
apiVersion: v1
kind: Service
metadata:
  name: dashboard
  labels:
    app: dashboard
spec:
  selector:
    app: dashboard
  ports:
    - port: 3000
      targetPort: 3000
```

Add `helm-chart/templates/dashboard-canary.yaml` (the two Services and the `AnalysisTemplate` from Section 3), then update the `dashboard:` block in `helm-chart/values.yaml`:

```yaml
dashboard:
  replicas: 2
  image:
    tag: "1.0.2"
  resources:
    requests:
      cpu: 50m
      memory: 64Mi
    limits:
      cpu: 100m
      memory: 128Mi
```

```bash
helm lint helm-chart
helm template finovra helm-chart | grep -A2 "kind: Rollout"
```

Confirm it renders one `Rollout` (not `Deployment`) for `dashboard`, with `image: "arsr319/finovra-dashboard:1.0.2"` and no `FAIL_MODE` env entry anywhere. Then ship it:

```bash
git add helm-chart/
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

This step is optional — if you'd rather see one full successful canary cycle before breaking anything, push any harmless change to `helm-chart/values.yaml` (leave `dashboard.image.tag: "1.0.2"` as-is) and watch it sail through `Step: 2/2` on its own. Otherwise, move straight to Step 4.

### Step 4 — Inject the failure

Bump `dashboard.image.tag` to `"1.0.3"` in `helm-chart/values.yaml`, commit, push — the exact same motion as shipping any release since Module 5:

```bash
git add helm-chart/values.yaml
git commit -m "Ship a bad dashboard release: bump image tag to 1.0.3"
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

`Sync Status` stays `Synced` the whole time — Git and the live Rollout object agree, `1.0.3` really is the image that's declared and rendered. Only `Health Status` flags the problem, because the *analysis* failed, not because anything drifted from Git. **This is worth sitting with:** the sync/health distinction from Module 3 just showed up again, in a completely different context, and it's exactly as useful here as it was there.

The stable Pods — still running `1.0.2` — never stopped serving traffic.

### Step 5 — Fix it and confirm recovery

```bash
git revert HEAD
git push origin main
kubectl argo rollouts get rollout dashboard -n finovra --watch
```

A fresh commit is a fresh revision, so Argo Rollouts attempts the canary again from scratch — no special "retry" command needed. Watch it pass the analysis this time and promote to `Step: 2/2`, `SetWeight: 100`, `Healthy`.

**Checkpoint:** you've now watched a canary release get caught and rolled back automatically — no `argocd app rollback`, no `git revert` *before* the fact, nothing manual in the moment it mattered. The only human action was deciding what change to push next. And it all happened through the same Helm chart you committed to in Module 4, using the same "bump the image tag" motion Module 5 already taught — nothing here needed a new mental model or a step back out to raw YAML.

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
3. Why couldn't a plain `Deployment`'s liveness/readiness probes have caught `1.0.3`'s bug the way the canary analysis did?
4. In Step 5, why didn't you need to run any special "retry" command to get the Rollout to attempt the canary again?
5. The `AnalysisTemplate` doesn't know or care whether `/healthz` failed because of bad code or a bad config value. Why doesn't that distinction matter to it?

---

## What's Next

In **Module 7**, we build a real dev → staging → prod promotion flow using Kustomize overlays and a PR-based workflow — plus a short add-on on Sync Waves and Lifecycle Hooks, using Finovra's own dashboard-depends-on-backends shape as the example.
