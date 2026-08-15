# Module 5: Rollbacks & Failure Recovery

**Environment:** `kind` (local)
**Prerequisites:** Module 4 complete — Finovra deployed via its Helm chart, with `automated`, `prune`, and `selfHeal` all enabled

---

## Learning Objectives

By the end of this module, you should be able to:
- Explain why ArgoCD's `Health Status` alone doesn't prove a release is actually working
- Perform a native ArgoCD rollback, and explain exactly what it does and doesn't fix
- Roll back the "correct" GitOps way, with `git revert`, and explain why it's preferred over rewriting history
- Pause ArgoCD's reconciliation during an incident, apply an emergency mitigation, and resume cleanly once a real fix is ready

---

## 1. "Healthy" Doesn't Mean "Working"

This module's practice material is `arsr319/finovra-dashboard:1.0.1` — a real, deliberately broken build. The bug: `public/index.html`'s client-side JS calls `fetch("/api/tile")` instead of `fetch("/api/tiles")` — a typo'd, non-existent endpoint. The request 404s, the failure is silently caught, and the page just never finishes loading its content.

Here's what makes this bug worth building a whole module's practice material around: **deploy it, and ArgoCD tells you everything is fine.** The container starts. `/` still returns `200`, so liveness and readiness probes pass. `Sync Status` reads `Synced`. `Health Status` reads `Healthy`. Every signal `kubectl get pods` and `argocd app get` can give you says this release is good — and the dashboard is visibly broken the moment you open it in a browser.

This is deliberate, and it's the whole point of Section 1's learning objective: **ArgoCD's health checks tell you the container is running the way Kubernetes expects, not that the application is doing its job correctly.** A crash-looping Pod is easy to catch. A Pod that starts fine and quietly serves a broken page is not — and it's a far more common real-world failure mode than a crash. Before you reach for any rollback technique, the actual diagnostic step is: **look at the thing.**

---

## 2. Technique 1: Native ArgoCD Rollback

ArgoCD remembers every sync it's ever performed — that history is what powers the UI's **History and Rollback** tab and the `argocd app rollback` command. In principle, rolling back is as simple as pointing at an earlier entry:

```bash
argocd app history finovra
argocd app rollback finovra <ID>
```

**There's a catch, and it's worth hitting deliberately rather than reading about it:** if `automated` sync is enabled, ArgoCD refuses outright:

```
rollback cannot be initiated when auto-sync is enabled
```

This makes sense once you think about it — automated sync's entire job is "make the cluster match the latest commit in Git." A native rollback tells the cluster to run something *other* than the latest commit. Those two instructions directly conflict, so ArgoCD won't let you set up a fight it would just keep re-losing every reconciliation cycle. You have to disable automated sync first:

```bash
argocd app set finovra --sync-policy none
argocd app rollback finovra <ID>
```

**Here's the more important catch, and it's the real lesson of this technique:** once the rollback completes, the *cluster* is back on the good version — but `Sync Status` now reads `OutOfSync`, because **Git still has the bad commit at `HEAD`.** You fixed what's running without fixing what Git says should be running. Anyone who looks at the repo still sees the broken release as "current." If automated sync gets re-enabled by someone before the real fix lands, ArgoCD will cheerfully redeploy the broken version right back — Git is still the source of truth, and native rollback never touched it.

That's the tradeoff: native rollback is the **fastest** way to get a good version running again, but it's a live-cluster action that leaves Git lying about reality until someone follows up with a real fix.

---

## 3. Technique 2: Git Revert — The "Correct" Way

`git revert` fixes the actual problem: Git's dishonesty. Instead of telling the *cluster* to ignore Git, you create a new commit that undoes the bad one:

```bash
git revert <bad-commit-sha>
git push origin main
```

With automated sync enabled, ArgoCD picks this up on its own — no `argocd app sync`, no `argocd app rollback`, nothing that touches the live `Application` object. `Sync Status` and `Health Status` both settle back to `Synced`/`Healthy`, and this time they mean it: Git and the cluster agree, and Git's history is honest — it shows a bad release *and* the commit that reverted it, not a rewritten past. This is why it's the technique most teams reach for by default: slower than a native rollback (you're waiting on the normal Git → sync path), but it never leaves a gap between what's running and what Git claims is running.

---

## 4. Technique 3: Pausing Reconciliation During an Incident

The first two techniques both assume you can fix things by changing *desired state* — either the live Application (Technique 1) or Git (Technique 2). Real incidents aren't always that clean. Sometimes the fastest way to stop the bleeding is a direct, temporary `kubectl` action — and with `selfHeal` enabled, ArgoCD will fight you on it.

Watch this happen: scale the broken dashboard to zero, trying to stop it serving broken pages to users while you figure out a real fix.

```bash
kubectl scale deployment dashboard -n finovra --replicas=0
```

Within seconds, it's back at `1/1`. `selfHeal` did exactly what it's supposed to do — Git still says `replicas: 1`, so ArgoCD reverted your change. Correct behavior in general, actively unhelpful in this specific moment.

**The fix: pause reconciliation on this Application before making the emergency change.**

```bash
argocd app set finovra --sync-policy none
kubectl scale deployment dashboard -n finovra --replicas=0
```

This time it sticks — `Sync Status` flips to `OutOfSync` (ArgoCD notices the drift and says so), but nothing reverts it, because there's no automated sync left to do the reverting. You've bought yourself time without ArgoCD undoing your mitigation every few seconds.

Now, *while paused*, prepare the actual fix the normal way:

```bash
git revert <bad-commit-sha>
git push origin main
```

Nothing happens yet — reconciliation is still paused, so the cluster stays exactly as you left it (zero replicas, bad image) even though Git already has the real fix sitting there. This is intentional: pausing means pausing, not "sync everything except this one field."

Once you're ready to hand control back to ArgoCD:

```bash
argocd app set finovra --sync-policy automated --auto-prune --self-heal
```

Everything converges in one reconciliation — the replica count back to `1`, *and* the image back to the good version — because Git was already fixed while you were paused. `Sync Status: Synced`, `Health Status: Healthy`.

> **Why not just `kubectl edit` the broken code?** You can't — the bug is baked into the container image itself. A `kubectl` hotfix can change what's *running* (replica count, resource limits, env vars, taking a bad Pod out of rotation) but it can't rewrite application code sitting inside an already-built image. That's exactly why this technique exists: it's for stabilizing the blast radius of an incident, not for fixing the underlying defect. The defect always still needs a real fix, via Git, same as Technique 2.

---

## Lab: Break It, Then Recover It Three Ways

All of this happens in your fork of `gitops`.

### Step 1 — Deploy the bad release

Edit `helm-chart/values.yaml`: find the **`dashboard:`** block specifically and change its `image.tag` from `""` to `"1.0.1"`.

```yaml
dashboard:
  replicas: 1
  image:
    tag: "1.0.1"   # was ""
```

**Change only this one line.** `accounts-service`, `insurance-service`, `investments-service`, and `loans-service` each have their own `image.tag: ""` line right below it in the same file — a blanket find-and-replace for `tag: ""` across the whole file will bump all five services instead of just `dashboard`, and the four backends don't have a `1.0.1` image on Docker Hub at all, so they'll go straight to `ImagePullBackOff`. Edit `dashboard`'s block by hand. One field, one service — that's the whole point of the fallback pattern from Module 4.

Because the template derives both the image tag *and* the `VERSION` env var from this same field, this single line is enough — no second edit needed the way the old plain-YAML version required.

```bash
git add helm-chart/values.yaml
git commit -m "Bump dashboard to 1.0.1"
git push origin main
```

Wait for automated sync to pick it up, then confirm the trap:

```bash
argocd app get finovra
```

`Sync Status: Synced`, `Health Status: Healthy` — looks completely fine. Now open the dashboard in your browser. The header shows `v...` forever and the tile grid never populates. **That's the diagnostic step this module opened with:** the status line lied, or more precisely, it told you something true (the container's running) that you mistook for something false (the app works).

### Step 2 — Recover with native rollback

```bash
argocd app history finovra
argocd app set finovra --sync-policy none
argocd app rollback finovra <ID-of-the-1.0.0-revision>
```

Confirm the dashboard is visibly fixed, then confirm the catch:

```bash
argocd app get finovra
```

`Sync Status: OutOfSync` — the cluster's fixed, Git isn't. Leave it like this for a moment and let that sink in before moving on.

### Step 3 — Recover with Git revert

Find the bad commit's SHA (`git log --oneline`), then:

```bash
git revert <bad-commit-sha>
git push origin main
argocd app set finovra --sync-policy automated --auto-prune --self-heal
```

Watch `argocd app get finovra` settle to `Synced`/`Healthy` — this time genuinely, both the cluster *and* Git agree the good version is current.

### Step 4 — Redeploy the bad release, then recover by pausing

Repeat Step 1 (`dashboard.image.tag` back to `1.0.1` in `helm-chart/values.yaml`, commit, push, wait for sync).

Try the *unprotected* emergency scale-down first, and watch it get reverted:

```bash
kubectl scale deployment dashboard -n finovra --replicas=0
kubectl get deployment dashboard -n finovra -w
```

Press `Ctrl+C` once you see it bounce back to `1/1`. Now do it the protected way:

```bash
argocd app set finovra --sync-policy none
kubectl scale deployment dashboard -n finovra --replicas=0
kubectl get deployment dashboard -n finovra
```

Confirm it stays at `0/0` this time. Prepare and push the real fix:

```bash
git revert <bad-commit-sha>
git push origin main
kubectl get deployment dashboard -n finovra
```

Confirm nothing has changed yet — still paused. Finally, resume:

```bash
argocd app set finovra --sync-policy automated --auto-prune --self-heal
argocd app get finovra
```

**Checkpoint:** `Sync Status: Synced`, `Health Status: Healthy`, `dashboard` back at `1/1` on `1.0.0`. You've now recovered from the same broken release three different ways, and watched each technique's specific tradeoff play out for real — not just read about it.

---

## Key Terms Glossary

| Term | Meaning |
|---|---|
| **Native rollback** | `argocd app rollback` — fastest recovery, but only changes the live cluster; Git still shows the bad release as current until you fix it separately |
| **Git revert** | A new commit that undoes a bad one — slower (waits on the normal sync path) but keeps Git and the cluster in agreement the whole time |
| **`--sync-policy none`** | Disables automated sync on the live `Application` object without touching Git or your local manifest file |
| **Reconciliation pause** | Temporarily disabling automated sync so an emergency `kubectl` mitigation isn't immediately reverted by `selfHeal` |
| **Health Status vs. actual correctness** | A Pod can be `Healthy` (passing its probes) while the application it's running is completely broken — probes check what you told them to check, nothing more |

---

## Recap Questions

1. Why did `Health Status` stay `Healthy` throughout this entire module, even while the dashboard was visibly broken?
2. Why does ArgoCD refuse to run `argocd app rollback` while automated sync is enabled?
3. After a native rollback, `Sync Status` shows `OutOfSync`. What, specifically, is out of sync with what?
4. In Step 4, the exact same `kubectl scale --replicas=0` command produced two different outcomes. What changed in between, and why?
5. Why couldn't a `kubectl` hotfix fix the actual bug in this module's practice release, only mitigate around it?

---

## What's Next

In **Module 6**, we look at progressive delivery with Argo Rollouts — deploying the dashboard as a canary release, injecting a failure, and watching an automated analysis catch and roll it back before it ever reaches full rollout, without anyone running a manual rollback command at all.
