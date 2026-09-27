// Lab 10 Pipeline Health Gate.
// Usage: PROMETHEUS_URL=http://prometheus:9090 node ci/pipeline-health.mjs <jenkins job full name>
//
// Exits 1 when fewer than HEALTH_MIN_SUCCESS_RATE (0.90) of the job's last 20
// finished builds succeeded. Data comes from the Lab 09 Prometheus, using the
// Jenkins Prometheus plugin's per-build metrics (perBuildMetrics, max 20 builds):
//   default_jenkins_builds_build_result_ordinal{jenkins_job, number}
//   0 = SUCCESS, 1 = UNSTABLE, 2 = FAILURE, 3 = NOT_BUILT, 4 = ABORTED
// (The plugin's *_build_count counters restart at zero with Jenkins, so they
// can't answer "the last 20 builds".) Fails closed if Prometheus can't be read.
const job = process.argv[2];
const base = process.env.PROMETHEUS_URL ?? 'http://prometheus:9090';
const minRate = Number(process.env.HEALTH_MIN_SUCCESS_RATE ?? '0.90');
const lastN = Number(process.env.HEALTH_WINDOW_BUILDS ?? '20');
const RESULT = ['SUCCESS', 'UNSTABLE', 'FAILURE', 'NOT_BUILT', 'ABORTED'];

if (!job) {
  console.error('usage: node ci/pipeline-health.mjs <jenkins job full name>');
  process.exit(2);
}

async function main() {
  const expr = `default_jenkins_builds_build_result_ordinal{jenkins_job="${job}"}`;
  const res = await fetch(`${base}/api/v1/query?query=${encodeURIComponent(expr)}`);
  if (!res.ok) throw new Error(`Prometheus returned HTTP ${res.status}`);
  const series = (await res.json()).data.result;

  // One series per build; skip NOT_BUILT and anything still running (no result yet).
  const builds = series
    .map((s) => ({ number: Number(s.metric.number), result: RESULT[Number(s.value[1])] }))
    .filter((b) => b.result && b.result !== 'NOT_BUILT')
    .sort((a, b) => b.number - a.number)
    .slice(0, lastN);

  if (builds.length === 0) {
    console.log(`Pipeline health: no finished builds of ${job} recorded yet; nothing to judge, gate passes.`);
    return 0;
  }

  const ok = builds.filter((b) => b.result === 'SUCCESS').length;
  const rate = ok / builds.length;
  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  console.log(`Pipeline health for ${job}: ${ok}/${builds.length} of the last ${lastN} builds succeeded = ${pct(rate)} (minimum ${pct(minRate)})`);
  console.log('  ' + builds.map((b) => `#${b.number}:${b.result}`).join(' '));
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
