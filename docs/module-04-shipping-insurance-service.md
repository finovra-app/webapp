# Module 4: Shipping a Feature the GitOps Way

**Duration:** 45 min
**Environment:** `kind` (local)
**Prerequisites:** Module 3 complete — `finoxa` is `Synced`/`Healthy` at v1.0.0, with `automated`, `prune`, and `selfHeal` all enabled from Steps 6-8

---

## Learning Objectives

By the end of this module, you should be able to:
- Add a brand-new service to a running ArgoCD-managed app using nothing but a Git commit
- Explain why `directory.recurse` means the Application spec itself never needs to change for this
- Ship a multi-file change (a new service *and* a version bump to existing ones) as a single, atomic release
- Recognize why adding a new resource never needs `prune`, while removing one does

---

## You Already Know How To Do This

Module 3 taught you every mechanic this module needs: `automated` sync deploys what's in Git, `directory.recurse` walks every subfolder under `k8s/plain-manifests/`, and `prune`/`selfHeal` keep the cluster honest. This module doesn't introduce anything new — it's the payoff. You're going to ship a real feature, the way a real team would: one commit, zero `kubectl`, zero `argocd` commands.

The feature: **Finoxa v1.0.0 → v2.0.0**, adding `insurance-service`. The Insurance tile — greyed out and "Coming Soon" since Module 3 — goes live.

---

## What's In This Release

Finoxa's versioning is **lockstep** (see the root `README.md`): every release bumps *all* services to the same version number, even ones that didn't change, so the version number always describes "the whole app," not one service. That means v2.0.0 touches three things in one commit:

| Change | File | Why |
|---|---|---|
| Add `insurance-service` | `k8s/plain-manifests/insurance-service/deployment.yaml` + `service.yaml` (new) | The actual feature — this is the only functional change |
| Bump `dashboard`'s image tag + `VERSION` env | `k8s/plain-manifests/dashboard/deployment.yaml` | Keeps the version banner and the release number in sync |
| Bump `accounts-service`'s image tag + `VERSION` env | `k8s/plain-manifests/accounts-service/deployment.yaml` | Same reason — its code hasn't changed, only its version label |

`arsr319/finoxa-dashboard:2.0.0` and `arsr319/finoxa-accounts-service:2.0.0` already exist on Docker Hub — byte-identical to their `:1.0.0` images, just retagged, exactly like the root README describes. You're not rebuilding anything this module; that's what Module 6 (CI) is for.

---

## Lab: Ship v2.0.0

All edits happen in your fork of **`gitops`** — the repo you forked back in Module 3.

### Step 1 — Add the new service's manifests

Create `k8s/plain-manifests/insurance-service/deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: insurance-service
  labels:
    app: insurance-service
spec:
  replicas: 1
  selector:
    matchLabels:
      app: insurance-service
  template:
    metadata:
      labels:
        app: insurance-service
    spec:
      containers:
        - name: insurance-service
          image: arsr319/finoxa-insurance-service:2.0.0
          ports:
            - containerPort: 8000
          env:
            - name: PORT
              value: "8000"
            - name: VERSION
              value: "2.0.0"
            - name: FAIL_MODE
              value: "false"
            - name: LATENCY_MS
              value: "0"
          livenessProbe:
            httpGet:
              path: /healthz
              port: 8000
            initialDelaySeconds: 3
          readinessProbe:
            httpGet:
              path: /healthz
              port: 8000
            initialDelaySeconds: 3
          resources:
            requests:
              cpu: 50m
              memory: 64Mi
            limits:
              cpu: 100m
              memory: 128Mi
```

And `k8s/plain-manifests/insurance-service/service.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: insurance-service
  labels:
    app: insurance-service
spec:
  selector:
    app: insurance-service
  ports:
    - port: 8000
      targetPort: 8000
```

Notice this is a **new folder**, not an edit to an existing file — and the Application spec you wrote in Module 3 already has `directory.recurse: true`. You don't need to touch `finoxa-app.yaml` at all for ArgoCD to find it.

### Step 2 — Bump the two existing services to v2.0.0

In `k8s/plain-manifests/dashboard/deployment.yaml`, change:

```yaml
image: arsr319/finoxa-dashboard:1.0.0    # -> 2.0.0
...
- name: VERSION
  value: "1.0.0"                          # -> "2.0.0"
```

In `k8s/plain-manifests/accounts-service/deployment.yaml`, change the same two fields (`image` tag and `VERSION` env) from `1.0.0` to `2.0.0`.

### Step 3 — Commit and push, all together

```bash
git add k8s/plain-manifests/insurance-service/ k8s/plain-manifests/dashboard/deployment.yaml k8s/plain-manifests/accounts-service/deployment.yaml
git commit -m "Ship v2.0.0: add insurance-service"
git push origin main
```

One commit, three files, one release — this is what a real version bump looks like in a manifests repo.

### Step 4 — Watch it deploy itself

Don't run `kubectl apply` or `argocd app sync`. Just watch:

```bash
argocd app get finoxa
kubectl get pods -n finoxa -w
```

Within ArgoCD's usual reconciliation window (or hit refresh in the UI if you don't want to wait), you should see:
- A brand-new `insurance-service` Pod appear and go `1/1 Running`
- `dashboard` and `accounts-service` each get one Pod restarted (same image content, new tag — Kubernetes still treats a tag change as a new rollout)
- `argocd app get finoxa` settle back to `Sync Status: Synced`, `Health Status: Healthy`

Press `Ctrl+C` once everything's `Running`.

### Step 5 — Confirm it in the browser

```bash
kubectl port-forward svc/dashboard -n finoxa 8082:3000
```

Open **http://localhost:8082** — the header now reads **v2.0.0**, the 💰 Accounts and 🛡️ Insurance tiles are both live, and Investments/Loans are still greyed-out "Coming Soon." Same mechanism as Module 3, just one tile further along.

**Checkpoint:** `argocd app get finoxa` shows `Synced`/`Healthy` with 3 backend services + dashboard running, and you never typed `kubectl apply` or `argocd app sync` once during this lab.

---

## Why This Didn't Need `prune`

Recap Question 4 from Module 3 asked why `automated` sync could *create* a resource without `prune`, but couldn't *remove* one. This module is that answer in practice: everything you did here was additive — a new Deployment, a new Service, two changed tags — and `automated` sync handled all of it with no help from `prune`. `prune` only ever matters when something is *deleted* from Git — you'll see it earn its keep again the next time Finoxa's manifest set actually shrinks.

---

## Recap Questions

1. Why didn't `finoxa-app.yaml` (the Application spec) need any changes to pick up `insurance-service`?
2. `dashboard` and `accounts-service`'s code didn't change in this release — so why did their Pods restart?
3. If you had forgotten to enable `automated` sync back in Module 3, what would Step 4 have looked like instead?
4. Why didn't this release need `prune: true` to work correctly, even though it's enabled?

---

## What's Next

In **Module 5**, we'll redeploy Finoxa using its Helm chart instead of plain YAML, then compare that to a Kustomize-based deployment — two different ways to describe "what should be running" for the same app.
