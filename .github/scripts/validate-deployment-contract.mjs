import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const ci = read(".github/workflows/ci.yml");
const deployWorkflow = read(".github/workflows/deploy-production.yml");
const deployScript = read(".github/scripts/deploy-production.sh");
const compose = read("docker-compose.prod.yml");
const dockerfile = read("docker/Dockerfile");
const deployFunction = deployScript.slice(
  deployScript.indexOf("deploy() {"),
  deployScript.indexOf("\nrecord_success() {"),
);

for (const service of ["api", "worker", "web", "migrate"]) {
  const upper = service.toUpperCase();
  assert.ok(
    compose.includes(`  ${service}:\n    image: ` + "${HIRESCOPE_" + `${upper}_IMAGE:`),
    `${service} must use its configured immutable image`,
  );
}

assert.match(ci, /target: \[api, worker, web, migrate\]/);
assert.match(ci, /tags: \$\{\{ steps\.image\.outputs\.name \}\}:\$\{\{ github\.sha \}\}/);

assert.doesNotMatch(compose, /APP_COMMIT_SHA/);
assert.doesNotMatch(compose, /^\s+build:/m);
assert.match(compose, /postgres:\n    image: postgres:16-alpine/);
assert.match(compose, /redis:\n    image: redis:7-alpine/);
assert.match(compose, /storage-init:\n    image: busybox:1\.36/);

assert.match(ci, /APP_COMMIT_SHA=\$\{\{ github\.sha \}\}/);
assert.match(ci, /labels: org\.opencontainers\.image\.revision=\$\{\{ github\.sha \}\}/);
assert.equal((dockerfile.match(/LABEL org\.opencontainers\.image\.revision=\$APP_COMMIT_SHA/g) ?? []).length, 4);

assert.match(deployWorkflow, /github\.event\.workflow_run\.head_branch == 'main'/);
assert.match(deployWorkflow, /github\.event\.workflow_run\.head_repository\.full_name == github\.repository/);
assert.match(deployWorkflow, /Refusing stale CI rerun/);
assert.match(deployWorkflow, /git merge-base --is-ancestor "\$deploy_sha" origin\/main/);
assert.match(deployWorkflow, /No successful push-main CI run exists for deploy_sha/);

assert.match(deployWorkflow, /deploy:\n(?:.|\n)*?timeout-minutes: 60/);
assert.match(deployScript, /pull_timeout_seconds=900/);
assert.match(deployScript, /migration_timeout_seconds=600/);
assert.match(deployScript, /health_command_timeout_seconds=15/);
assert.match(deployScript, /env COMPOSE_PARALLEL_LIMIT=1/);
assert.match(deployScript, /for service in migrate api worker web; do\n\s+pull_service_image compose "\$service"/);
assert.match(deployScript, /Image pull started: \$service/);
assert.match(deployScript, /Image pull completed: \$service/);
assert.match(deployScript, /Image pull failed: \$service/);
assert.match(deployScript, /run_migration compose/);
assert.match(deployScript, /timeout --signal=TERM --kill-after=30s "\$\{migration_timeout_seconds\}s"/);
assert.match(deployScript, /run_health_command "\$service container status"/);
assert.match(deployScript, /--connect-timeout 5 --max-time "\$health_command_timeout_seconds"/);
assert.match(deployScript, /"\$\{compose\[@\]\}" up -d --force-recreate api worker web/);
assert.ok(
  deployFunction.indexOf("run_migration compose") <
    deployFunction.indexOf('${compose[@]}" up -d --force-recreate api worker web'),
  "migration must finish before application containers are updated",
);
assert.doesNotMatch(deployScript, /pull migrate api worker web/);
assert.doesNotMatch(deployScript, /"\$\{compose\[@\]\}" up -d --force-recreate\s*$/m);
assert.doesNotMatch(deployScript, /up -d --force-recreate[^\n]*(?:postgres|redis)/);
assert.doesNotMatch(deployScript, /docker compose[^\n]*build/);

console.log("Immutable deployment contracts are valid.");
