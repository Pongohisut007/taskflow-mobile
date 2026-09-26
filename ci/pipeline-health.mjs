// Lab 10 Pipeline Health Gate.
// Usage: PROMETHEUS_URL=http://prometheus:9090 node ci/pipeline-health.mjs <jenkins job full name>
//
// Reads the Lab 09 Prometheus metrics for one Jenkins job and exits 1 when the
// success rate over its retained builds is below HEALTH_MIN_SUCCESS_RATE (0.90).
// The Jenkinsfile keeps exactly 20 builds (buildDiscarder), so "retained builds"
// is "the last 20 builds". Fails closed: if Prometheus can't be read, the deploy stops.
const job = process.argv[2];
const base = process.env.PROMETHEUS_URL ?? 'http://prometheus:9090';
const minRate = Number(process.env.HEALTH_MIN_SUCCESS_RATE ?? '0.90');

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
try {
  const total = await query(`sum(default_jenkins_builds_total_build_count_total${selector})`);
  const success = await query(`sum(default_jenkins_builds_success_build_count_total${selector})`);

  if (total === 0) {
    console.log(`Pipeline health: no finished builds recorded yet for ${job}; nothing to judge, gate passes.`);
    process.exit(0);
  }

  const rate = success / total;
  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  console.log(`Pipeline health for ${job}: ${success}/${total} successful builds = ${pct(rate)} (minimum ${pct(minRate)})`);
  if (rate < minRate) {
    console.error(`Pipeline Health Gate FAILED: ${pct(rate)} < ${pct(minRate)} — production deploy aborted`);
    process.exit(1);
  }
  console.log('Pipeline Health Gate passed');
} catch (err) {
  console.error(`Pipeline Health Gate FAILED: cannot read metrics (${err.message}) — failing closed`);
  process.exit(1);
}
