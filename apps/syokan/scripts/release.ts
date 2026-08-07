#!/usr/bin/env bun
// bun run release — tag the version already on main and push the tag.
// .github/workflows/release.yml picks up the pushed tag and releases (publishes) the binary.
//
// Why this script does not bump the version: main is guarded by the `main-required-checks`
// ruleset (required status checks, no bypass actors), so pushing a bump commit straight to main
// is rejected with GH013 and leaves the bump stranded locally. The bump therefore rides an
// ordinary PR like any other change; this script owns only the step a ruleset cannot block —
// pushing an annotated `v*` tag at the merged commit.
import { $ } from "bun";

function fail(message: string): never {
  console.error(`aborted: ${message}`);
  process.exit(1);
}

const pkg = (await Bun.file(
  new URL("../package.json", import.meta.url),
).json()) as { version: string };
const tag = `v${pkg.version}`;

// --tags so the "already released" check below sees tags created on another machine.
await $`git fetch --tags origin main`.quiet();

const branch = (await $`git rev-parse --abbrev-ref HEAD`.text()).trim();
if (branch !== "main") fail(`on branch ${branch}, not main`);
if ((await $`git status --porcelain`.text()).trim())
  fail("working tree is dirty");

const head = (await $`git rev-parse HEAD`.text()).trim();
const upstream = (await $`git rev-parse origin/main`.text()).trim();
if (head !== upstream)
  fail("main is not in sync with origin/main — pull the merged bump first");

const bumpFirst = "bump the version in apps/syokan/package.json via a PR first";
if ((await $`git tag --list ${tag}`.text()).trim())
  fail(`${tag} already exists locally — ${bumpFirst}`);
if ((await $`git ls-remote --tags origin ${tag}`.text()).trim())
  fail(`${tag} is already released — ${bumpFirst}`);

const subject = (await $`git log -1 --format=%s`.text()).trim();
console.log(`version: ${pkg.version} (apps/syokan/package.json)`);
console.log(`tagging: ${head.slice(0, 7)} ${subject}\n`);
if (prompt(`push ${tag}? [y/N]:`)?.trim().toLowerCase() !== "y") {
  console.log("aborted");
  process.exit(0);
}

// annotated tag (-a): release.yml is triggered by the tag, and an annotated tag records who
// cut the release and when, which a lightweight tag does not.
await $`git tag -a ${tag} -m ${tag}`;
// Push the tag ref alone. The bump commit is already on main via its PR, and a plain
// `git push` from here would be rejected by the ruleset anyway.
await $`git push origin refs/tags/${tag}`;
console.log(`\n✓ pushed ${tag}. CI will publish the release.`);
