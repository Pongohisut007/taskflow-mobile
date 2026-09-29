# SLO window reset on `taskflow/lab4/main` — 2026-09-27 16:36

**What:** deleted Jenkins builds #1–#9 of `taskflow/lab4/main`; numbering continues at #10.

**Why:** the Pipeline Health Gate judges the last 20 builds. Builds #1–#6 ran the
Lab 04–09 Jenkinsfiles (two were aborted by a PC restart). #7 failed on a Lab 10
bug that was fixed right after (kubectl namespace, PR #9). That history held `main`
at 4/8 = 50%, so the gate blocked every deploy of the new pipeline. This was demonstrated
in build #9 (see `main-9-health-gate-blocked-console.txt`). The pipeline changed
completely at PR #8, so the old builds say nothing about the health of the Lab 10 pipeline.

**Who decided:** the repository owner (asked before the reset).

**Kept as evidence before deleting:**
- `main-7-approval-apply-console.txt` — human approval, Terraform apply, Ansible (deploy failed: namespace bug)
- `main-8-deploy-success-console.txt` — health gate passed, blue/green switch green → blue
- `main-9-health-gate-blocked-console.txt` — gate at 50% blocked the production deploy

Production was not touched by the reset: `svc/taskflow` stayed on `blue` (`taskflow-api:02c0232`).
