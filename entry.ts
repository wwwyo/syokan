#!/usr/bin/env bun
// 単体バイナリ用の dual-mode エントリ。compile 後は cli/server/frontend が 1 つの
// バイナリに同居するので、起動時にどちらで振る舞うかをここで分ける。
// lazy-spawn が自分自身を SYOKAN_SERVE=1 付きで起こしたら server、それ以外は CLI。
if (process.env.SYOKAN_SERVE === "1") {
  const { startServer } = await import("./server/index.ts");
  startServer();
} else {
  const { runCli } = await import("./cli/syokan.ts");
  await runCli();
}
