#!/bin/bash
# Lab 09 saturation test: queue N builds at once against the capped Kubernetes cloud.
# Usage: JENKINS_AUTH=user:token ./load-test.sh [count] [hold_seconds]
set -euo pipefail
COUNT=${1:-10}
HOLD=${2:-60}
JOB_URL=${JOB_URL:-http://localhost:8080/job/taskflow/job/lab4/job/nongao%252Flab9}
for i in $(seq 1 "$COUNT"); do
  # A distinct RUN_ID stops Jenkins from merging identical queued builds into one.
  curl -fsS -u "$JENKINS_AUTH" -X POST \
    "$JOB_URL/buildWithParameters?HOLD_SECONDS=$HOLD&RUN_ID=load-$(date +%s)-$i" >/dev/null
  echo "queued build $i/$COUNT (HOLD_SECONDS=$HOLD)"
done
