import {
  codeLangForPath,
  fileBasename,
  inferFileFormat,
} from "../src/lib/fileFormat";
import type { Item } from "../src/schema";
import { type ReadFileFailure, readTextFile } from "./fileSource";

export type MaterializeResult =
  | { ok: true; root: Item }
  | { ok: false; path: string; reason: ReadFileFailure };

// Fold a FileDoc into a concrete node using its content at publish time. The inference rules
// (fileFormat.ts) and props mapping mirror FileDocBody's render branching.
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
 * Copy the tree while freezing each FileDoc into a concrete node with its file content.
 * A single read failure fails the whole thing (don't produce an incomplete publication). The original tree is not mutated.
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
    const results = await Promise.all(item.children.map(materializeTree));
    children = [];
    for (const result of results) {
      if (!result.ok) return result;
      children.push(result.root);
    }
  }
  const copy: Item = { type: item.type, props: { ...item.props } };
  if (children) copy.children = children;
  if (item.key !== undefined) copy.key = item.key;
  return { ok: true, root: copy };
}
