#!/usr/bin/env bun
// 単体実行ファイルをコンパイルする。entry.ts を起点に cli + server + frontend
// (server が import する index.html) を 1 つのバイナリに同梱する。
// CLI の `bun build --compile` は plugin を受け取れないため、tailwind plugin を
// 明示配線した Bun.build({ compile }) で行う (これで CSS も compile 時に展開される)。
import { fileURLToPath } from "node:url";
import tailwind from "bun-plugin-tailwind";

const outfile = fileURLToPath(new URL("./dist/syokan", import.meta.url));

const result = await Bun.build({
  entrypoints: [fileURLToPath(new URL("./entry.ts", import.meta.url))],
  target: "bun",
  compile: { outfile },
  plugins: [tailwind],
  minify: true,
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

console.log(`syokan: compiled → ${outfile}`);
