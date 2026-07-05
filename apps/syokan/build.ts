#!/usr/bin/env bun
// Compile the single executable with the frontend embedded.
//   no args   : one host build (dist/syokan) — for local use / smoke testing
//   --release : cross-compile each OS/arch for distribution (dist/syokan-<os>-<arch>)
//               the names are shaped so mise's github backend can detect the OS/arch from the GitHub Release
// The CLI `bun build --compile` cannot take plugins, so wire the tailwind plugin
// explicitly via Bun.build({compile}).
import { fileURLToPath } from "node:url";
import type { Build } from "bun";
import tailwind from "bun-plugin-tailwind";

const entry = fileURLToPath(new URL("./entry.ts", import.meta.url));
const out = (name: string) =>
  fileURLToPath(new URL(`./dist/${name}`, import.meta.url));

const RELEASE_TARGETS: { target: Build.CompileTarget; name: string }[] = [
  { target: "bun-darwin-arm64", name: "syokan-darwin-arm64" },
  { target: "bun-darwin-x64", name: "syokan-darwin-x64" },
  { target: "bun-linux-x64", name: "syokan-linux-x64" },
  { target: "bun-linux-arm64", name: "syokan-linux-arm64" },
];

async function compile(outfile: string, target?: Build.CompileTarget) {
  const result = await Bun.build({
    entrypoints: [entry],
    target: "bun",
    compile: target ? { target, outfile } : { outfile },
    plugins: [tailwind],
    minify: true,
    // Prevent the compile-time ambient NODE_ENV from being baked into the server's development check,
    // pinning the binary to production always (HMR disabled, embedded frontend served).
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
  await adhocSign(outfile, target);
  console.log(`syokan: compiled → ${outfile}`);
}

// Bun 1.3.12's compile output can have a missing/corrupt signature, and on Apple Silicon
// an unsigned binary gets SIGKILL'd. Re-sign darwin outputs ad-hoc
// (run --remove-signature first because a partially broken signature makes --sign fail
// with "invalid or unsupported format").
async function adhocSign(outfile: string, target?: Build.CompileTarget) {
  const forDarwin = target ? target.includes("darwin") : process.platform === "darwin";
  if (!forDarwin) return;
  // codesign only runs on macOS. A darwin build cross-compiled on CI (ubuntu) comes out unsigned.
  // Skipping silently would go unnoticed, so warn (Gatekeeper handling for distributables needs separate notarization)
  if (process.platform !== "darwin") {
    console.warn(`syokan: ${outfile} left unsigned (cross-compiled on ${process.platform}; codesign needs macOS)`);
    return;
  }
  await Bun.$`codesign --remove-signature ${outfile}`.quiet().nothrow();
  const signed = await Bun.$`codesign --sign - --force ${outfile}`.quiet().nothrow();
  if (signed.exitCode !== 0) {
    console.error(`syokan: codesign failed for ${outfile}\n${signed.stderr.toString()}`);
    process.exit(1);
  }
}

if (process.argv.includes("--release")) {
  for (const { target, name } of RELEASE_TARGETS) {
    await compile(out(name), target);
  }
} else {
  await compile(out("syokan"));
}
