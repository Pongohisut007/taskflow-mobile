// Lab 10 Pipeline Health Gate.
// Usage: PROMETHEUS_URL=http://prometheus:9090 node ci/pipeline-health.mjs <jenkins job full name>
//
// Exits 1 when the job's success rate over its last ~20 finished builds, read from
// the Lab 09 Prometheus metrics, is below HEALTH_MIN_SUCCESS_RATE (0.90).
//
// The Jenkins Prometheus plugin's build counters start from zero whenever Jenkins
// restarts, so the raw counter values are not "the last 20 builds". Prometheus keeps
// the history, though, and increase() handles counter resets. The gate therefore
// widens the look-back window until it covers at least 20 builds (or the whole
// 15-day retention) and computes success / total inside that window.
// Fails closed: if Prometheus can't be read, the deploy stops.
const job = process.argv[2];
const base = process.env.PROMETHEUS_URL ?? 'http://prometheus:9090';
const minRate = Number(process.env.HEALTH_MIN_SUCCESS_RATE ?? '0.90');
const wantBuilds = Number(process.env.HEALTH_WINDOW_BUILDS ?? '20');
const windows = ['1h', '6h', '1d', '3d', '7d', '15d'];

if (!job) {
  console.error('usage: node ci/pipeline-health.mjs <jenkins job full name>');
  process.exit(2);
}

async function query(expr) {
  const res = await fetch(`${base}/api/v1/query?query=${encodeURIComponent(expr)}`);
  if (!res.ok) throw new Error(`Prometheus returned HTTP ${res.status} for ${expr}`);
  const body = await res.json();
  return body.data.result.length ? Number(body.data.result[0].value[1]) : 0;
}

const selector = `{jenkins_job="${job}"}`;
// increase() drops the first sample of a series born inside the window (e.g. the
// first successful build), so add that first value back for such series.
const builds = (metric, w) => {
  const m = `default_jenkins_builds_${metric}_build_count_total${selector}`;
  return query(`round((sum(increase(${m}[${w}])) or vector(0)) + (sum(min_over_time(${m}[${w}]) unless ${m} offset ${w}) or vector(0)))`);
};

async function main() {
  let window, total = 0, success = 0;
  for (window of windows) {
    total = await builds('total', window);
    if (total >= wantBuilds) break;
  }
  success = await builds('success', window);

  if (total === 0) {
    console.log(`Pipeline health: no finished builds of ${job} in the last ${window}; nothing to judge, gate passes.`);
    return 0;
  }

  const rate = Math.min(success / total, 1);
  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  console.log(`Pipeline health for ${job}: ${success}/${total} successful builds in the last ${window} ` +
              `(window grows until it covers ${wantBuilds} builds) = ${pct(rate)}, minimum ${pct(minRate)}`);
  if (rate < minRate) {
    console.error(`Pipeline Health Gate FAILED: ${pct(rate)} < ${pct(minRate)} — production deploy aborted`);
    return 1;
  }
  console.log('Pipeline Health Gate passed');
  return 0;
}

// exitCode instead of process.exit(): lets pending sockets close cleanly.
process.exitCode = await main().catch((err) => {
  console.error(`Pipeline Health Gate FAILED: cannot read metrics (${err.message}) — failing closed`);
  return 1;
});
