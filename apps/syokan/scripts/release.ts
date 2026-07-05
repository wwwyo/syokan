#!/usr/bin/env bun
// bun run release — interactively pick the bump kind, then version bump + tag + push.
// .github/workflows/release.yml picks up the pushed tag and releases (publishes) the binary.
import { $ } from "bun";

type Bump = "patch" | "minor" | "major";

const choices: { key: Bump; desc: string }[] = [
  { key: "patch", desc: "bug fix" },
  { key: "minor", desc: "feature" },
  { key: "major", desc: "breaking change" },
];

const pkg = (await Bun.file(
  new URL("../package.json", import.meta.url),
).json()) as { version: string };

function bumped(version: string, type: Bump): string {
  const [maj = 0, min = 0, pat = 0] = version.split(".").map(Number);
  if (type === "major") return `${maj + 1}.0.0`;
  if (type === "minor") return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

console.log(`current: v${pkg.version}\n`);
for (const [i, c] of choices.entries()) {
  console.log(
    `  ${i + 1}) ${c.key.padEnd(5)} v${pkg.version} → v${bumped(pkg.version, c.key)}  (${c.desc})`,
  );
}

const choice = choices[Number(prompt("\nselect bump [1-3]:")) - 1];
if (!choice) {
  console.error("aborted: invalid selection");
  process.exit(1);
}

const nextVersion = bumped(pkg.version, choice.key);
if (prompt(`\nbump v${pkg.version} → v${nextVersion} and push? [y/N]:`)?.trim().toLowerCase() !== "y") {
  console.log("aborted");
  process.exit(0);
}

// package.json lives in apps/syokan, not the git root, so bun pm / npm version's built-in
// git commit/tag silently no-op. Do the bump with --no-git-tag-version and
// make the commit and tag explicitly from the root. That also loses the built-in dirty-tree guard, so check it ourselves.
const dirty = (await $`git status --porcelain`.text()).trim();
if (dirty) {
  console.error("aborted: working tree is dirty");
  process.exit(1);
}
const tag = `v${nextVersion}`;
await $`bun pm version --no-git-tag-version ${choice.key}`;
await $`git commit -am ${tag}`;
await $`git tag ${tag}`;
await $`git push --follow-tags`;
console.log(`\n✓ pushed ${tag}. CI will publish the release.`);
