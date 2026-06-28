#!/usr/bin/env bun
// bun run release — 対話的に bump 種別を選び、version bump + tag + push する。
// 押した tag を .github/workflows/release.yml が拾って binary を draft release する。
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
  console.error("aborted: 無効な選択");
  process.exit(1);
}

const nextVersion = bumped(pkg.version, choice.key);
if (prompt(`\nv${pkg.version} → v${nextVersion} で bump して push? [y/N]:`)?.trim().toLowerCase() !== "y") {
  console.log("aborted");
  process.exit(0);
}

// dirty な working tree だと bun pm version 自身が止める (release 前のガードとして妥当)。
await $`bun pm version ${choice.key}`;
await $`git push --follow-tags`;
console.log(`\n✓ v${nextVersion} を push。CI が draft release を作成します。`);
