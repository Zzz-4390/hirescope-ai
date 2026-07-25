import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const LOCAL_DEVELOPMENT_ONLY_PATHS = new Set([
  ".env.example",
  "docker-compose.yml",
  "start-dev.cmd",
  "start-dev.ps1",
  "stop-dev.cmd",
  "stop-dev.ps1",
]);

function normalizeRepositoryPath(filePath) {
  return filePath.replaceAll("\\", "/").replace(/^\.\/+/, "");
}

export function isProductionRuntimePath(filePath) {
  const normalizedPath = normalizeRepositoryPath(filePath);
  const lowerPath = normalizedPath.toLowerCase();

  if (
    normalizedPath.length === 0 ||
    normalizedPath.startsWith("/") ||
    normalizedPath.split("/").includes("..")
  ) {
    return true;
  }

  if (
    lowerPath.endsWith(".md") ||
    lowerPath.startsWith("docs/") ||
    LOCAL_DEVELOPMENT_ONLY_PATHS.has(lowerPath)
  ) {
    return false;
  }

  // Fail closed: an unclassified path may affect a production build or deploy.
  return true;
}

export function classifyProductionRuntimeChanges(filePaths) {
  const changedFiles = [...new Set(filePaths.map(normalizeRepositoryPath))].filter(Boolean);
  const runtimeFiles = changedFiles.filter(isProductionRuntimePath);

  return {
    changedFiles,
    runtimeFiles,
    runtimeChanged: runtimeFiles.length > 0,
  };
}

function readChangedPaths() {
  const input = readFileSync(0);
  const separator = input.includes(0) ? "\0" : /\r?\n/;

  return input
    .toString("utf8")
    .split(separator)
    .filter(Boolean);
}

function run() {
  const result = classifyProductionRuntimeChanges(readChangedPaths());
  const runtimeChanged = String(result.runtimeChanged);

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `runtime_changed=${runtimeChanged}\n`, "utf8");
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      [
        "### Production runtime change detection",
        "",
        `- Changed paths: ${result.changedFiles.length}`,
        `- Production runtime paths: ${result.runtimeFiles.length}`,
        `- Build and deploy production images: \`${runtimeChanged}\``,
        "",
      ].join("\n"),
      "utf8",
    );
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const invokedPath = process.argv[1];
if (invokedPath && pathToFileURL(resolve(invokedPath)).href === import.meta.url) {
  run();
}
