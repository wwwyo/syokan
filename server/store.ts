import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  CURRENT_SCHEMA_VERSION,
  type Item,
  type SnapshotEnvelope,
  type SnapshotMetadata,
} from "@/schema";

type StoreFile = {
  snapshots: Record<string, SnapshotEnvelope>;
  idempotency: Record<string, string>;
};

export type CreateInput = {
  title?: string;
  root: Item;
  metadata?: SnapshotMetadata;
  idempotencyKey?: string;
};

export type ViewSummary = {
  id: string;
  title?: string;
  createdAt: string;
  source?: { label: string };
};

const LOCK_TIMEOUT_MS = 5_000;
const LOCK_STALE_MS = 10_000;

export class SnapshotStore {
  private readonly file: string;
  private readonly lockFile: string;
  // 書き込み (create/delete) を 1 プロセス内で直列化する (in-process mutex)。
  // read-modify-write の interleave による idempotency 違反 / lost update を防ぐ。
  private writeChain: Promise<unknown> = Promise.resolve();

  constructor(dataDir: string) {
    this.file = join(dataDir, "snapshots.json");
    this.lockFile = `${this.file}.lock`;
  }

  // クロスプロセス排他。lazy-spawn は同じ data dir を指す別 server プロセスを
  // 起こしうるので、in-process mutex だけだと別プロセス間で lost update する。
  // O_EXCL な lock file を mutex に使い、stale (>10s) は奪う。
  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    await mkdir(dirname(this.file), { recursive: true });
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    for (;;) {
      try {
        const handle = await open(this.lockFile, "wx");
        await handle.close();
        break;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
        try {
          const st = await stat(this.lockFile);
          if (Date.now() - st.mtimeMs > LOCK_STALE_MS) {
            await rm(this.lockFile, { force: true });
            continue;
          }
        } catch {
          // lock が消えた → 取得を再試行
          continue;
        }
        if (Date.now() > deadline) {
          throw new Error("SnapshotStore: lock acquisition timed out");
        }
        await new Promise((resolve) =>
          setTimeout(resolve, 20 + Math.random() * 30),
        );
      }
    }
    try {
      return await fn();
    } finally {
      await rm(this.lockFile, { force: true });
    }
  }

  // 都度 disk から読む。in-memory cache を持たないので、別プロセス
  // (lazy-spawn した server / 別の dev server) が書いた変更も常に反映される。
  private async read(): Promise<StoreFile> {
    try {
      const text = await readFile(this.file, "utf8");
      return JSON.parse(text) as StoreFile;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      return { snapshots: {}, idempotency: {} };
    }
  }

  private async write(data: StoreFile): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${crypto.randomUUID()}.tmp`;
    await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
    await rename(tmp, this.file);
  }

  // 直前の書き込み完了を待ってから fn を実行する (in-process mutex)。
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.writeChain.then(fn, fn);
    // chain には成否を伝播させない (1 件の失敗で後続を止めない)
    this.writeChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  create(input: CreateInput): Promise<SnapshotEnvelope> {
    return this.enqueue(() =>
      this.withLock(async () => {
        const data = await this.read();
        if (input.idempotencyKey) {
          const existingId = data.idempotency[input.idempotencyKey];
          if (existingId) {
            const existing = data.snapshots[existingId];
            if (existing) return existing;
          }
        }
        const id = crypto.randomUUID();
        const envelope: SnapshotEnvelope = {
          schemaVersion: CURRENT_SCHEMA_VERSION,
          id,
          root: input.root,
          createdAt: new Date().toISOString(),
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.metadata !== undefined
            ? { metadata: input.metadata }
            : {}),
        };
        data.snapshots[id] = envelope;
        if (input.idempotencyKey) {
          data.idempotency[input.idempotencyKey] = id;
        }
        await this.write(data);
        return envelope;
      }),
    );
  }

  async get(id: string): Promise<SnapshotEnvelope | undefined> {
    const data = await this.read();
    return data.snapshots[id];
  }

  async list(): Promise<ViewSummary[]> {
    const data = await this.read();
    const items = Object.values(data.snapshots).map((env) => {
      const summary: ViewSummary = {
        id: env.id,
        createdAt: env.createdAt,
      };
      if (env.title !== undefined) summary.title = env.title;
      const label = env.metadata?.source?.label;
      if (label) summary.source = { label };
      return summary;
    });
    // newest first。同値は 0 を返す全順序比較 (localeCompare) で安定させる。
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return items;
  }

  delete(id: string): Promise<boolean> {
    return this.enqueue(() =>
      this.withLock(async () => {
        const data = await this.read();
        if (!(id in data.snapshots)) return false;
        delete data.snapshots[id];
        for (const key of Object.keys(data.idempotency)) {
          if (data.idempotency[key] === id) delete data.idempotency[key];
        }
        await this.write(data);
        return true;
      }),
    );
  }
}
