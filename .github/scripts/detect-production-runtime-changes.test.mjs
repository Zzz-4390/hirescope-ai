import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyProductionRuntimeChanges,
  isProductionRuntimePath,
} from "./detect-production-runtime-changes.mjs";

const requiredScenarios = [
  ["README.md", false],
  ["docs/production-deployment.md", false],
  ["start-dev.ps1", false],
  ["apps/web/src/app/page.tsx", true],
  ["apps/api/src/main.ts", true],
  ["prisma/migrations/20260725000100_example/migration.sql", true],
  ["docker/Dockerfile", true],
];

for (const [filePath, expected] of requiredScenarios) {
  test(`${filePath} => runtime_changed=${expected}`, () => {
    assert.equal(isProductionRuntimePath(filePath), expected);
  });
}

test("pure documentation and local development tooling do not require production images", () => {
  assert.deepEqual(
    classifyProductionRuntimeChanges([
      "README.md",
      "docs/smoke-test.md",
      "start-dev.ps1",
      "stop-dev.cmd",
      "docker-compose.yml",
      ".env.example",
    ]),
    {
      changedFiles: [
        "README.md",
        "docs/smoke-test.md",
        "start-dev.ps1",
        "stop-dev.cmd",
        "docker-compose.yml",
        ".env.example",
      ],
      runtimeFiles: [],
      runtimeChanged: false,
    },
  );
});

test("a mixed change fails closed when any production runtime path changes", () => {
  const result = classifyProductionRuntimeChanges([
    "docs/production-deployment.md",
    "packages/shared-types/src/index.ts",
  ]);

  assert.equal(result.runtimeChanged, true);
  assert.deepEqual(result.runtimeFiles, ["packages/shared-types/src/index.ts"]);
});

test("unknown paths default to production runtime changes", () => {
  assert.equal(isProductionRuntimePath("new-root-tool.config.mjs"), true);
  assert.equal(isProductionRuntimePath("../outside-repository.md"), true);
});
