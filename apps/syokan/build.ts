#!/usr/bin/env bun
// frontend を埋め込んだ単体実行ファイルを compile する。
//   引数なし  : host 向け 1 つ (dist/syokan) — ローカル利用・動作確認用
//   --release : 配布用に各 OS/arch を cross-compile (dist/syokan-<os>-<arch>)
//               名前は mise の github backend が GitHub Release から OS/arch を判別できる形にする
// CLI の `bun build --compile` は plugin を渡せないため、Bun.build({compile}) で
// tailwind plugin を明示配線する。
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
    // compile 時の ambient NODE_ENV が server の development 判定に焼き込まれるのを防ぎ、
    // バイナリを常に production (HMR 無効・埋め込み frontend を配信) に固定する。
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
  await adhocSign(outfile, target);
  console.log(`syokan: compiled → ${outfile}`);
}

// Bun 1.3.12 の compile 出力は署名が欠落/破損することがあり、Apple Silicon では
// 未署名バイナリが SIGKILL される。darwin 向け出力は ad-hoc 署名し直す
// (--remove-signature を先に通すのは、部分的に壊れた署名があると --sign が
// "invalid or unsupported format" で失敗するため)。
async function adhocSign(outfile: string, target?: Build.CompileTarget) {
  const forDarwin = target ? target.includes("darwin") : process.platform === "darwin";
  if (!forDarwin || process.platform !== "darwin") return;
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
