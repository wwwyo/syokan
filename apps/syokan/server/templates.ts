import { readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { writeJsonAtomic } from "../src/lib/fsAtomic";

// A template is a vault for "saving an envelope the LLM assembled and reusing it as a base later".
// syokan does not interpret the contents (json). Unlike a snapshot (ephemeral), it's meant to be kept.
export type Template = {
  id: string;
  title: string;
  description?: string;
  // Arbitrary saved JSON (usually a snapshot envelope or root). Not interpreted.
  json: unknown;
  createdAt: string;
};

export type TemplateInput = {
  title: string;
  description?: string;
  json: unknown;
};

// A list summary with json dropped. For when the CLI / sidebar only want title and description.
export type TemplateSummary = Omit<Template, "json">;

export type TemplateStore = {
  add: (input: TemplateInput) => Promise<Template>;
  get: (id: string) => Promise<Template | undefined>;
  list: () => Promise<TemplateSummary[]>;
  remove: (id: string) => Promise<boolean>;
};

// Filename = id. Restrict id to UUID form before joining it into a path,
// structurally ruling out traversal via `..` or `/`.
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function createTemplateStore(dir: string): TemplateStore {
  function file(id: string): string {
    return join(dir, `${id}.json`);
  }

  async function add(input: TemplateInput): Promise<Template> {
    const template: Template = {
      id: crypto.randomUUID(),
      title: input.title,
      createdAt: new Date().toISOString(),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      json: input.json,
    };
    await writeJsonAtomic(file(template.id), template);
    return template;
  }

  async function get(id: string): Promise<Template | undefined> {
    if (!ID_RE.test(id)) return undefined;
    try {
      const text = await readFile(file(id), "utf8");
      return JSON.parse(text) as Template;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw err;
    }
  }

  async function list(): Promise<TemplateSummary[]> {
    let names: string[];
    try {
      names = await readdir(dir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
    const summaries: TemplateSummary[] = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      try {
        const text = await readFile(join(dir, name), "utf8");
        const parsed = JSON.parse(text) as Partial<Template>;
        // Exclude anything with a broken shape (e.g. a hand-placed foreign file) before it trips up
        // the sort (treated like corrupt JSON). Skip if id/title/createdAt aren't strings.
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
        // Silently exclude corrupt / mid-write tmp files from the list
      }
    }
    // Deterministic by ascending title. Fix ties to a total order by createdAt → id.
    summaries.sort(
      (a, b) =>
        a.title.localeCompare(b.title) ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    );
    return summaries;
  }

  async function remove(id: string): Promise<boolean> {
    if (!ID_RE.test(id)) return false;
    try {
      await rm(file(id));
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw err;
    }
  }

  return { add, get, list, remove };
}
