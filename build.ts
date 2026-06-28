#!/usr/bin/env bun
// frontend を埋め込んだ単体実行ファイルを compile する。
//   引数なし  : host 向け 1 つ (dist/syokan) — ローカル利用・動作確認用
//   --release : 配布用に各 OS/arch を cross-compile (dist/syokan-<os>-<arch>)
//               名前は mise の ubi backend が GitHub Release から OS/arch を判別できる形にする
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
  console.log(`syokan: compiled → ${outfile}`);
}

if (process.argv.includes("--release")) {
  for (const { target, name } of RELEASE_TARGETS) {
    await compile(out(name), target);
  }
} else {
  await compile(out("syokan"));
}
