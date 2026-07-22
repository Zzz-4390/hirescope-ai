import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const ci = read(".github/workflows/ci.yml");
const deployScript = read(".github/scripts/deploy-production.sh");
const compose = read("docker-compose.prod.yml");
const dockerfile = read("docker/Dockerfile");
const documentation = read("docs/production-deployment.md");
const buildStep = ci.slice(
  ci.indexOf("Build once and push immutable image to ACR and GHCR"),
  ci.indexOf("Record image digest"),
);
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
  assert.ok(
    ci.includes(`$ACR_PUBLIC_REGISTRY/$ACR_NAMESPACE/${service}`) ||
      ci.includes('"${{ matrix.target }}"'),
    `${service} must be published to ACR`,
  );
}

assert.equal(
  existsSync(".github/workflows/deploy-production.yml"),
  false,
  "automatic production CD workflow must remain removed",
);
assert.match(ci, /target: \[api, worker, web, migrate\]/);
assert.match(ci, /registry: \$\{\{ vars\.ACR_PUBLIC_REGISTRY \}\}/);
assert.match(ci, /username: \$\{\{ secrets\.ACR_PUSH_USERNAME \}\}/);
assert.match(ci, /password: \$\{\{ secrets\.ACR_PUSH_PASSWORD \}\}/);
assert.match(ci, /registry: ghcr\.io/);
assert.match(buildStep, /\$\{\{ steps\.image\.outputs\.acr \}\}:\$\{\{ github\.sha \}\}/);
assert.match(buildStep, /\$\{\{ steps\.image\.outputs\.ghcr \}\}:\$\{\{ github\.sha \}\}/);
assert.match(ci, /APP_COMMIT_SHA=\$\{\{ github\.sha \}\}/);
assert.match(ci, /labels: org\.opencontainers\.image\.revision=\$\{\{ github\.sha \}\}/);
assert.match(ci, /Production ACR:/);
assert.match(ci, /Backup GHCR:/);

assert.doesNotMatch(compose, /APP_COMMIT_SHA/);
assert.doesNotMatch(compose, /^\s+build:/m);
assert.match(compose, /postgres:\n    image: postgres:16-alpine/);
assert.match(compose, /redis:\n    image: redis:7-alpine/);
assert.match(compose, /storage-init:\n    image: busybox:1\.36/);
assert.equal(
  (dockerfile.match(/LABEL org\.opencontainers\.image\.revision=\$APP_COMMIT_SHA/g) ?? []).length,
  4,
);

assert.match(deployScript, /deploy_env_file="\$deployment_root\/\.env\.deploy"/);
assert.match(deployScript, /ACR_PUBLIC_REGISTRY="\$\(read_deploy_value ACR_PUBLIC_REGISTRY\)"/);
assert.match(deployScript, /ACR_NAMESPACE="\$\(read_deploy_value ACR_NAMESPACE\)"/);
assert.match(deployScript, /for service in migrate api worker web; do\n\s+pull_service_image compose "\$service"/);
assert.match(deployScript, /run_migration compose/);
assert.match(deployScript, /"\$\{compose\[@\]\}" up --no-deps -d --force-recreate api worker web/);
assert.ok(
  deployFunction.indexOf("run_migration compose") <
    deployFunction.indexOf('up --no-deps -d --force-recreate api worker web'),
  "migration must finish before application containers are updated",
);
assert.doesNotMatch(deployScript, /docker login ghcr\.io/);
assert.doesNotMatch(deployScript, /docker compose[^\n]*build/);
assert.doesNotMatch(deployScript, /docker build|pnpm (?:build|deploy)/);
assert.doesNotMatch(deployScript, /up[^\n]*force-recreate[^\n]*(?:postgres|redis|storage-init)/);
assert.match(documentation, /ACR is the production source\. GHCR is a backup/);
assert.match(documentation, /deploy-production\.sh deploy <full-40-character-commit-sha>/);

console.log("ACR publication and manual deployment contracts are valid.");
