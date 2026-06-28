import { readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { writeJsonAtomic } from "@/lib/fsAtomic";

// テンプレは「LLM が組んだ envelope を保存し、後で土台に使う」ための保管庫。
// syokan は中身 (json) を解釈しない。snapshot (ephemeral) と違い残す前提。
export type Template = {
  id: string;
  title: string;
  description?: string;
  // 保存された任意の JSON (通常は snapshot envelope か root)。解釈しない。
  json: unknown;
  createdAt: string;
};

export type TemplateInput = {
  title: string;
  description?: string;
  json: unknown;
};

// json を落とした一覧用サマリ。CLI / sidebar が title・description だけ見たいとき用。
export type TemplateSummary = Omit<Template, "json">;

// ファイル名 = id。id を path に結合する前に UUID 形式だけに制限し、
// `..` や `/` による traversal を構造的に排除する。
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class TemplateStore {
  private readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  private file(id: string): string {
    return join(this.dir, `${id}.json`);
  }

  async add(input: TemplateInput): Promise<Template> {
    const template: Template = {
      id: crypto.randomUUID(),
      title: input.title,
      createdAt: new Date().toISOString(),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      json: input.json,
    };
    await writeJsonAtomic(this.file(template.id), template);
    return template;
  }

  async get(id: string): Promise<Template | undefined> {
    if (!ID_RE.test(id)) return undefined;
    try {
      const text = await readFile(this.file(id), "utf8");
      return JSON.parse(text) as Template;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw err;
    }
  }

  async list(): Promise<TemplateSummary[]> {
    let names: string[];
    try {
      names = await readdir(this.dir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
    const summaries: TemplateSummary[] = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      try {
        const text = await readFile(join(this.dir, name), "utf8");
        const parsed = JSON.parse(text) as Partial<Template>;
        // 手置きの foreign file 等、shape が崩れたものは sort で落ちる前に除外する
        // (壊れた JSON と同じ扱い)。id/title/createdAt が string でなければ skip。
        if (
          typeof parsed.id !== "string" ||
          typeof parsed.title !== "string" ||
          typeof parsed.createdAt !== "string"
        ) {
          continue;
        }
        const { json: _json, ...summary } = parsed as Template;
        summaries.push(summary);
      } catch {
        // 壊れた / 書き込み途中の tmp は一覧から黙って除外する
      }
    }
    // title 昇順で決定的に。同名は createdAt → id で全順序に固定する。
    summaries.sort(
      (a, b) =>
        a.title.localeCompare(b.title) ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    );
    return summaries;
  }

  async remove(id: string): Promise<boolean> {
    if (!ID_RE.test(id)) return false;
    try {
      await rm(this.file(id));
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw err;
    }
  }
}
