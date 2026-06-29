import { describe, expect, test } from "bun:test";
import {
  codeLangForPath,
  fileBasename,
  inferFileFormat,
} from "./fileFormat";

describe("inferFileFormat", () => {
  test("markdown 拡張子", () => {
    expect(inferFileFormat("/a/b/notes.md")).toBe("markdown");
    expect(inferFileFormat("README.markdown")).toBe("markdown");
    expect(inferFileFormat("/x/NOTES.MD")).toBe("markdown");
  });

  test(".json は code", () => {
    expect(inferFileFormat("/etc/config.json")).toBe("code");
  });

  test("txt / log / 未知 / 拡張子なし は text", () => {
    expect(inferFileFormat("/var/log/app.log")).toBe("text");
    expect(inferFileFormat("/a/memo.txt")).toBe("text");
    expect(inferFileFormat("/a/COMMIT_EDITMSG")).toBe("text");
    expect(inferFileFormat("/a/script.ts")).toBe("text");
    expect(inferFileFormat("/a/.gitignore")).toBe("text");
  });
});

describe("codeLangForPath", () => {
  test("拡張子を lang 候補にする", () => {
    expect(codeLangForPath("/a/config.json")).toBe("json");
    expect(codeLangForPath("/a/noext")).toBe("text");
  });
});

describe("fileBasename", () => {
  test("posix / windows 区切りと末尾区切りを処理する", () => {
    expect(fileBasename("/a/b/c.md")).toBe("c.md");
    expect(fileBasename("c.md")).toBe("c.md");
    expect(fileBasename("/a/b/")).toBe("b");
    expect(fileBasename("C:\\x\\y.json")).toBe("y.json");
  });
});
