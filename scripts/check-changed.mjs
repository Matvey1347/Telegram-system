import { execSync } from "node:child_process";

function run(command, options = {}) {
  return execSync(command, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function tryRun(command, options = {}) {
  try {
    return run(command, options);
  } catch {
    return "";
  }
}

function getBaseRef() {
  const envBase = process.env.GITHUB_BASE_REF;
  if (envBase) {
    const remoteBase = `origin/${envBase}`;
    const exists = tryRun(`git rev-parse --verify ${remoteBase}`);
    if (exists) return remoteBase;
  }

  for (const candidate of ["origin/main", "origin/master", "main", "master"]) {
    const exists = tryRun(`git rev-parse --verify ${candidate}`);
    if (exists) return candidate;
  }

  const previous = tryRun("git rev-parse --verify HEAD~1");
  return previous || "";
}

function changedFiles() {
  const base = getBaseRef();
  const diffAgainstBase = base
    ? tryRun(`git diff --name-only ${base}...HEAD -- .`)
    : "";
  const staged = tryRun("git diff --name-only --cached -- .");
  const unstaged = tryRun("git diff --name-only -- .");

  return [
    ...new Set(
      [diffAgainstBase, staged, unstaged]
        .flatMap((value) => value.split("\n"))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}

function touchesAny(paths, prefixes) {
  return paths.some((path) => prefixes.some((prefix) => path.startsWith(prefix)));
}

function main() {
  const files = changedFiles();
  if (!files.length) {
    console.log("No changed files detected. Running full check.");
    execSync("pnpm check", { stdio: "inherit" });
    return;
  }

  const touchesRootConfig = touchesAny(files, [
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    ".github/",
    "scripts/",
  ]);
  if (touchesRootConfig) {
    console.log("Root or CI files changed. Running full check.");
    execSync("pnpm check", { stdio: "inherit" });
    return;
  }

  const commands = [];

  if (touchesAny(files, ["packages/shared/"])) {
    commands.push("pnpm --filter @telegram-system/shared lint");
    commands.push("pnpm --filter @telegram-system/shared typecheck");
    commands.push("pnpm --filter @telegram-system/shared build");
  }

  if (touchesAny(files, ["apps/api/"])) {
    commands.push("pnpm db:generate");
    commands.push("pnpm --filter api lint");
    commands.push("pnpm --filter api typecheck");
    commands.push("pnpm --filter api test -- --runInBand");
    commands.push("pnpm --filter api build");
  }

  if (touchesAny(files, ["apps/web/"])) {
    commands.push("pnpm --filter web lint");
    commands.push("pnpm --filter web typecheck");
    commands.push("pnpm --filter web test -- --run");
    commands.push("pnpm --filter web build");
  }

  if (!commands.length) {
    console.log("Only docs or non-runtime files changed. No targeted checks needed.");
    return;
  }

  for (const command of commands) {
    console.log(`\n$ ${command}`);
    execSync(command, { stdio: "inherit" });
  }
}

main();
