import { mkdir, open, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { writeJsonAtomic } from "@/lib/fsAtomic";
import {
  CURRENT_SCHEMA_VERSION,
  type Item,
  type SnapshotEnvelope,
  type SnapshotMetadata,
  type SnapshotSummary,
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

const LOCK_TIMEOUT_MS = 5_000;

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
  // O_EXCL な lock file を mutex に使う。
  //
  // staleness は「経過時間」ではなく「owner プロセスの生存」で判定する。
  // 経過時間で奪うと、遅い writer (大きな書き込み / swap) のロックを critical
  // section 中に奪ってしまい lost update が再発する。owner が生きている間は
  // 絶対に奪わず、crash (pid が存在しない) のときだけ reclaim する。
  // lock file には `pid:token` を書き、release / reclaim は内容一致時のみ rm
  // して、他プロセスのロックを消さない。
  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    await mkdir(dirname(this.file), { recursive: true });
    const content = `${process.pid}:${crypto.randomUUID()}`;
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    for (;;) {
      try {
        const handle = await open(this.lockFile, "wx");
        try {
          await handle.writeFile(content);
        } finally {
          await handle.close();
        }
        break;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
        if (await this.reclaimIfDead()) continue;
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
      await this.releaseLock(content);
    }
  }

  // owner プロセスが死んでいる lock だけを reclaim する。返り値は「取得を
  // 再試行してよいか」(消した / 既に消えていた = true、生存中 = false)。
  private async reclaimIfDead(): Promise<boolean> {
    let raw: string;
    try {
      raw = await readFile(this.lockFile, "utf8");
    } catch {
      return true; // 既に消えた → 取得を再試行
    }
    const pid = Number.parseInt(raw.split(":")[0] ?? "", 10);
    if (Number.isFinite(pid) && pid > 0 && this.isProcessAlive(pid)) {
      return false; // owner 生存 → 奪わず待つ
    }
    // crash した owner (or 不正な内容)。読んだ内容と一致するときだけ消す
    // (その間に生きたプロセスが取り直していたら消さない)。
    try {
      if ((await readFile(this.lockFile, "utf8")) === raw) {
        await rm(this.lockFile, { force: true });
      }
    } catch {
      // 既に消えた
    }
    return true;
  }

  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (err) {
      // EPERM = 存在するが権限なし → alive 扱い (奪わない)
      return (err as NodeJS.ErrnoException).code === "EPERM";
    }
  }

  private async releaseLock(content: string): Promise<void> {
    try {
      if ((await readFile(this.lockFile, "utf8")) === content) {
        await rm(this.lockFile, { force: true });
      }
    } catch {
      // 既に無い / 読めない → 何もしない
    }
  }

  // 都度 disk から読む。in-memory cache を持たないので、別プロセス
  // (lazy-spawn した server / 別の dev server) が書いた変更も常に反映される。
  //
  // map は null-prototype 化する。id は URL パス由来 (attacker-controlled) で、
  // plain object だと `snapshots["constructor"]` 等が Object.prototype の
  // 関数を返して `!env` ガードをすり抜け、`"toString" in snapshots` が true に
  // なる。null-proto にすると lookup / `in` が own key のみを見るので、
  // get / delete / idempotency の全 lookup がまとめて安全になる。
  private async read(): Promise<StoreFile> {
    try {
      const text = await readFile(this.file, "utf8");
      const parsed = JSON.parse(text) as Partial<StoreFile>;
      return {
        snapshots: Object.assign(Object.create(null), parsed.snapshots),
        idempotency: Object.assign(Object.create(null), parsed.idempotency),
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      return {
        snapshots: Object.create(null),
        idempotency: Object.create(null),
      };
    }
  }

  private write(data: StoreFile): Promise<void> {
    return writeJsonAtomic(this.file, data);
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

  async list(): Promise<SnapshotSummary[]> {
    const data = await this.read();
    const items = Object.values(data.snapshots).map((env) => {
      const summary: SnapshotSummary = {
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
