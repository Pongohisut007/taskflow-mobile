# Lab 10 — 10-minute live walkthrough

**Goal:** show one real change moving through both pipelines, every gate firing in order,
and at least one gate blocking a bad change.

Open these tabs before you start:

| Tab | URL |
|---|---|
| API pipeline, `main` | http://localhost:8080/job/taskflow/job/lab4/job/main/ |
| Mobile pipeline, `main` | http://localhost:8080/job/taskflow/job/mobile/job/main/ |
| Grafana, Jenkins Pipeline Health | http://localhost:3001 |
| Architecture diagram | `docs/lab10/architecture.png` |
| Terminal | `kubectl get pods -n jenkins-agents -w` |

Check before the demo: `kubectl get svc taskflow -o jsonpath='{.spec.selector.color}'` shows which colour is live now.

---

## 0:00 – 1:00 · The map

Show `architecture.png`.

> "Two Jenkinsfiles, one per repository side: `Jenkinsfile` for taskflow-api and `frontend/Jenkinsfile` for the Flutter app.
> Red boxes are gates: if they fail, the build stops. Yellow boxes run on `main` only.
> There are no static agents. Every build asks the Lab 09 kind cloud for a fresh pod and deletes it at the end."

## 1:00 – 2:00 · Push the change

Push a small, reviewer-assigned change to `main` (through a PR), for example a new field in the tasks API.

> "The push triggers both multibranch jobs. Watch the terminal: an agent pod appears for this build."

Point at the new `taskflow-lab4-main-…` pod in the `kubectl -w` window.

## 2:00 – 4:00 · Fast, parallel checks (API)

Open the running build → Stage View.

> "**Secrets** first (gitleaks): a leaked key stops everything before anything is built.
> Then one parallel block with `failFast`: **Lint, Unit Test, SAST, Semgrep, SCA, Terraform validate, Ansible Lint, tfsec, checkov**.
> They don't depend on each other, so they run side by side. The first failure cancels the rest."

## 4:00 – 5:30 · Supply chain and quality

> "**SBOM & Sign**: syft makes a CycloneDX SBOM and cosign signs it with the Jenkins-held key.
> **Policy Gate**: OPA denies on critical vulnerabilities.
> **SonarQube → Quality Gate**: coverage must be at least 70%.
> **E2E**: the API and its own postgres run inside the same pod, and Playwright hits it."

## 5:30 – 6:30 · Build → Scan → Plan (sequential)

> "Now the order matters. **kaniko** builds the image with no Docker daemon, tagged with the 7-character commit SHA.
> **Trivy** fails the build on any HIGH or CRITICAL finding. **Terraform Plan** is archived as an artifact."

## 6:30 – 8:00 · The `main`-only path

> "Only on `main`: **Approval** is a real `input` step. Nobody answers within 15 minutes, nothing is applied.
> Then **Terraform Apply** runs the exact approved plan, and **Ansible** configures the host from a dynamic inventory built from Terraform output.
> **Pipeline Health Gate** asks Prometheus for the last 20 builds of this job. Below 90% success, production is not touched.
> **Deploy — Production** is blue/green: deploy to the idle colour, smoke-test it, switch the Service, verify.
> If anything fails, `post.failure` switches the Service back."

Show `kubectl get svc taskflow -o jsonpath='{.spec.selector.color}'` flipping colour.

## 8:00 – 9:00 · A gate blocking a bad change (live)

Pick one:

* **Unit test** (fast): push a commit that breaks an assertion in `backend/src/tasks/*.spec.ts`.
  Unit Test fails, `failFast` cancels the other parallel branches, and nothing is built or deployed.
* **Pipeline Health Gate** (evidence from build #9, `lab10-evidence/main-9-health-gate-blocked-console.txt`):
  ```
  Pipeline health for taskflow/lab4/main: 4/8 of the last 20 builds succeeded = 50.0% (minimum 90.0%)
  Pipeline Health Gate FAILED: 50.0% < 90.0% — production deploy aborted
  Stage "Deploy — Production" skipped due to earlier failure(s)
  ```
  Show that the live colour did not change.

Show the failure email that arrived with the branch name and build URL. Then revert the bad commit.

## 9:00 – 10:00 · Mobile + wrap-up

Open the mobile `main` build.

> "Same pattern for Flutter: **analyze, test with coverage and osv-scanner** in parallel, then a **debug APK** on every branch.
> On `main`, a **release AAB signed with the upload keystore stored in Jenkins**. The pipeline checks it with `jarsigner -verify` and fails if it's debug-signed."

Show the `aab-signer.txt` artifact: `CN=TaskFlow Upload`.

Close with the rollback runbook (`docs/lab10/rollback-runbook.md`): what on-call does if Deploy — Production fails.
