# Runbook: `Deploy — Production` failed (taskflow-api)

**Who:** on-call engineer. **Goal:** users back on a known-good version in under 5 minutes, then find out why.

**What production is.** kind cluster `kind-taskflow`, namespace `default`:

| Object | Role |
|---|---|
| `svc/taskflow` | The only Service users hit. `spec.selector.color` picks the live colour. Port 8080 → 3000. |
| `deploy/taskflow-blue`, `deploy/taskflow-green` | Two identical Deployments; container `app`, image `localhost:5001/taskflow-api:<7-char SHA>`. |
| `svc/taskflow-blue`, `svc/taskflow-green` | Per-colour Services, used for smoke tests before a switch. |
| Health check | `GET /health` on port 8080 returns 200 when the app and its database are up. |

Every command below runs from a machine with `kubectl` and the kind kubeconfig:

```bash
kubectl config use-context kind-taskflow
```

---

## 1. Find out where the deploy stopped (1 minute)

Open the failed build → **Console Output** and search for `Live:`.

```
Live: blue -> deploying 3f34669 to green      ← LIVE = blue, NEXT = green
```

Write both colours down. Then find the last stage that ran:

| Last line in the console | What it means | Go to |
|---|---|---|
| `Pipeline Health Gate FAILED` | Deploy never started. Production is untouched. | **§5** |
| error in `set image` / `rollout status … timed out` | The new colour never became ready. Traffic was never switched. | **§2** |
| `smoke-<N>` pod failed (`curl: (22)` / `(7)`) | New colour is up but unhealthy. Traffic was never switched. | **§2** |
| `verify-<N>` pod failed (after `patch svc`) | Traffic **was** switched, then the check failed. | **§2** (rollback must have run) |
| `ROLLBACK: deploy failed, restoring Service selector to <LIVE>` | Automatic rollback ran. | **§2** to confirm it |
| Build aborted / Jenkins died mid-deploy, no `ROLLBACK` line | Automatic rollback may **not** have run. | **§3** |

## 2. Confirm that users are on the old colour

```bash
kubectl get svc taskflow -o jsonpath='{.spec.selector.color}{"\n"}'     # must print LIVE
kubectl run rb-check --rm -i --restart=Never --image=curlimages/curl -- \
  curl -sf -o /dev/null -w '%{http_code}\n' http://taskflow:8080/health  # must print 200
```

Both correct → **users are safe.** Go to §4.
Selector prints NEXT, or health is not 200 → **§3 now.**

## 3. Manual rollback: switch traffic back

```bash
LIVE=blue        # the colour from the "Live:" line in step 1
kubectl patch svc taskflow -p "{\"spec\":{\"selector\":{\"color\":\"$LIVE\"}}}"
kubectl get svc taskflow -o jsonpath='{.spec.selector.color}{"\n"}'
kubectl run rb-check --rm -i --restart=Never --image=curlimages/curl -- \
  curl -sf http://taskflow:8080/health
```

**If LIVE is unhealthy too** (health still not 200), both colours are bad. Put the last good image on LIVE:

```bash
# Last good tag = IMAGE_TAG of the last green build on main (Jenkins → taskflow/lab4/main → last successful build → "Building" line),
# or what LIVE was running before this incident:
kubectl rollout history deployment/taskflow-$LIVE
kubectl rollout undo deployment/taskflow-$LIVE                       # back to the previous ReplicaSet
# or pin an exact known-good SHA:
kubectl set image deployment/taskflow-$LIVE app=localhost:5001/taskflow-api:<GOOD_SHA>
kubectl rollout status deployment/taskflow-$LIVE --timeout=120s
```

Then run the two checks in §2 again. Do not continue until they pass.

## 4. Contain the bad version

```bash
NEXT=green
kubectl get deployment taskflow-$NEXT -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'   # the bad image
kubectl logs deployment/taskflow-$NEXT --tail=100                                                    # why it failed
kubectl get pods -l color=$NEXT
```

* Leave `taskflow-$NEXT` running with the bad image: it gets no traffic, and its logs are evidence.
  The next green build on `main` overwrites it.
* **Do not re-run the build** hoping it passes. A re-run deploys the same SHA.
  Fix forward with a new commit, or `git revert <bad SHA>` on `main`.
* The next deploy switches to `NEXT` again after the smoke test passes, so it is safe to push the fix.

## 5. Health Gate blocked the deploy

Nothing was deployed; production still runs LIVE. The gate reads the last 20 `main` builds from Prometheus:

```bash
curl -s 'http://localhost:9090/api/v1/query' --data-urlencode \
  'query=sum(default_jenkins_builds_success_build_count_total{jenkins_job="taskflow/lab4/main"}) / sum(default_jenkins_builds_total_build_count_total{jenkins_job="taskflow/lab4/main"})'
```

* Below 0.90 → `main` has been failing. Fix those failures first. The gate passes again once
  enough green builds push the rate over 90%, because only the last 20 builds are kept.
* `cannot read metrics … failing closed` → Prometheus is down: `cd monitoring && docker compose up -d prometheus`
  and check `docker network inspect kind` lists `prometheus`.
* Only for an urgent fix, and only with a second engineer approving: redeploy manually with §3's
  `kubectl set image` on the **non-live** colour, smoke-test it on `taskflow-<colour>:8080/health`, then patch the Service.
  Write down why the gate was bypassed.

## 6. Close out

1. Post in the team channel (or reply to the Jenkins failure email): build URL, LIVE/NEXT colours,
   bad SHA, current selector, time users were affected (switch time → rollback time).
2. Open an issue with the console log excerpt and `kubectl logs` from §4.
3. Add a test or gate that would have caught it: a unit/E2E test, a smoke-test assertion, or an alert.
