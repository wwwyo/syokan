#!/usr/bin/env bun
// Dual-mode entry for the single binary. After compilation cli/server/frontend live in one
// binary, so decide here at startup which one to behave as.
// If lazy-spawn woke this up with SYOKAN_SERVE=1, act as the server; otherwise the CLI.
if (process.env.SYOKAN_SERVE === "1") {
  const { startServer } = await import("./server/index.ts");
  startServer();
} else {
  const { runCli } = await import("./cli/syokan.ts");
  await runCli();
}
