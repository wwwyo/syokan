import {
  codeLangForPath,
  fileBasename,
  inferFileFormat,
} from "@/lib/fileFormat";
import type { Item } from "@/schema";
import { type ReadFileFailure, readTextFile } from "./fileSource";

export type MaterializeResult =
  | { ok: true; root: Item }
  | { ok: false; path: string; reason: ReadFileFailure };

// FileDoc を publish 時点の内容で具象ノードに畳む。推論規則 (fileFormat.ts) と
// props の対応は FileDocBody の描画分岐と揃える。
function concreteNode(path: string, content: string): Item {
  const format = inferFileFormat(path);
  if (format === "markdown") {
    return { type: "MarkdownDoc", props: { body: content } };
  }
  if (format === "code") {
    return {
      type: "Code",
      props: {
        code: content,
        lang: codeLangForPath(path),
        filename: fileBasename(path),
      },
    };
  }
  return { type: "PlainText", props: { body: content } };
}

/**
 * tree をコピーしつつ FileDoc をファイル内容ごと具象ノードへ凍結する。
 * 読み失敗は 1 件でも全体を fail にする (欠けた公開物を作らない)。元 tree は変更しない。
 */
export async function materializeTree(item: Item): Promise<MaterializeResult> {
  if (item.type === "FileDoc") {
    const path = typeof item.props.path === "string" ? item.props.path : "";
    const result = await readTextFile(path);
    if (!result.ok) return { ok: false, path, reason: result.reason };
    const node = concreteNode(path, result.content);
    if (item.key !== undefined) node.key = item.key;
    return { ok: true, root: node };
  }
  let children: Item[] | undefined;
  if (item.children) {
    children = [];
    for (const child of item.children) {
      const result = await materializeTree(child);
      if (!result.ok) return result;
      children.push(result.root);
    }
  }
  const copy: Item = { type: item.type, props: { ...item.props } };
  if (children) copy.children = children;
  if (item.key !== undefined) copy.key = item.key;
  return { ok: true, root: copy };
}
