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
  // 指定すると id/url とは別に key→id を登録し、以後の update の的にする。
  // 既に登録済みの key を渡した場合は新規作成せず既存をそのまま返す (dedup) —
  // CLI の PUT→404→POST フォールバックが並行実行されても、この dedup が
  // read-modify-write を直列化する enqueue+withLock の中で効くので孤児
  // snapshot が増えない。
  idempotencyKey?: string;
};

export type UpdateInput = {
  title?: string;
  root: Item;
  metadata?: SnapshotMetadata;
  idempotencyKey: string;
};

export type UpdateResult =
  | { ok: true; envelope: SnapshotEnvelope }
  | { ok: false; error: "not_found" };

export type SnapshotStore = {
  // 新規作成する。idempotencyKey が既に登録済みなら新規作成せず既存を返す (dedup)。
  create: (input: CreateInput) => Promise<SnapshotEnvelope>;
  // idempotencyKey で特定した既存 snapshot を置き換える (id/url/createdAt は保つ)。
  // 一致が無ければ not_found (AIP-134 の Update の既定。allow_missing は持たない —
  // 新規作成したいときは create を使う。狙い撃ちを外して黙って作ってしまう
  // ことがないよう、update は常に「既にある前提」を崩さない)。
  update: (input: UpdateInput) => Promise<UpdateResult>;
  get: (id: string) => Promise<SnapshotEnvelope | undefined>;
  list: () => Promise<SnapshotSummary[]>;
  delete: (id: string) => Promise<boolean>;
};

const LOCK_TIMEOUT_MS = 5_000;

export function createSnapshotStore(dataDir: string): SnapshotStore {
  const file = join(dataDir, "snapshots.json");
  const lockFile = `${file}.lock`;
  // 書き込み (create/delete) を 1 プロセス内で直列化する (in-process mutex)。
  // read-modify-write の interleave による idempotency 違反 / lost update を防ぐ。
  let writeChain: Promise<unknown> = Promise.resolve();

  function isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (err) {
      // EPERM = 存在するが権限なし → alive 扱い (奪わない)
      return (err as NodeJS.ErrnoException).code === "EPERM";
    }
  }

  // owner プロセスが死んでいる lock だけを reclaim する。返り値は「取得を
  // 再試行してよいか」(消した / 既に消えていた = true、生存中 = false)。
  async function reclaimIfDead(): Promise<boolean> {
    let raw: string;
    try {
      raw = await readFile(lockFile, "utf8");
    } catch {
      return true; // 既に消えた → 取得を再試行
    }
    const pid = Number.parseInt(raw.split(":")[0] ?? "", 10);
    if (Number.isFinite(pid) && pid > 0 && isProcessAlive(pid)) {
      return false; // owner 生存 → 奪わず待つ
    }
    // crash した owner (or 不正な内容)。読んだ内容と一致するときだけ消す
    // (その間に生きたプロセスが取り直していたら消さない)。
    try {
      if ((await readFile(lockFile, "utf8")) === raw) {
        await rm(lockFile, { force: true });
      }
    } catch {
      // 既に消えた
    }
    return true;
  }

  async function releaseLock(content: string): Promise<void> {
    try {
      if ((await readFile(lockFile, "utf8")) === content) {
        await rm(lockFile, { force: true });
      }
    } catch {
      // 既に無い / 読めない → 何もしない
    }
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
  async function withLock<T>(fn: () => Promise<T>): Promise<T> {
    await mkdir(dirname(file), { recursive: true });
    const content = `${process.pid}:${crypto.randomUUID()}`;
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    for (;;) {
      try {
        const handle = await open(lockFile, "wx");
        try {
          await handle.writeFile(content);
        } finally {
          await handle.close();
        }
        break;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
        if (await reclaimIfDead()) continue;
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
      await releaseLock(content);
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
  async function read(): Promise<StoreFile> {
    try {
      const text = await readFile(file, "utf8");
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

  function write(data: StoreFile): Promise<void> {
    return writeJsonAtomic(file, data);
  }

  // 直前の書き込み完了を待ってから fn を実行する (in-process mutex)。
  function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = writeChain.then(fn, fn);
    // chain には成否を伝播させない (1 件の失敗で後続を止めない)
    writeChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  // id/createdAt/title/metadata から envelope を組み立てる (create/update 共通)。
  // title/metadata は base (create では undefined、update では既存の値) を
  // fallback にすることで、update が省略されたフィールドを消さずに保つ。
  function buildEnvelope(
    id: string,
    createdAt: string,
    root: Item,
    title: string | undefined,
    metadata: SnapshotMetadata | undefined,
  ): SnapshotEnvelope {
    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id,
      root,
      createdAt,
      ...(title !== undefined ? { title } : {}),
      ...(metadata !== undefined ? { metadata } : {}),
    };
  }

  function create(input: CreateInput): Promise<SnapshotEnvelope> {
    return enqueue(() =>
      withLock(async () => {
        const data = await read();
        if (input.idempotencyKey) {
          const existingId = data.idempotency[input.idempotencyKey];
          const existing = existingId ? data.snapshots[existingId] : undefined;
          if (existing) return existing;
        }
        const id = crypto.randomUUID();
        const envelope = buildEnvelope(
          id,
          new Date().toISOString(),
          input.root,
          input.title,
          input.metadata,
        );
        data.snapshots[id] = envelope;
        if (input.idempotencyKey) {
          data.idempotency[input.idempotencyKey] = id;
        }
        await write(data);
        return envelope;
      }),
    );
  }

  function update(input: UpdateInput): Promise<UpdateResult> {
    return enqueue(() =>
      withLock(async () => {
        const data = await read();
        const existingId = data.idempotency[input.idempotencyKey];
        const existing = existingId ? data.snapshots[existingId] : undefined;
        if (!existing) return { ok: false, error: "not_found" };
        // 同じ id/url/createdAt を保ったまま置き換える。title/metadata は
        // 省略されたら既存の値を保つ (PUT で root だけ更新しても消えない)。
        const envelope = buildEnvelope(
          existing.id,
          existing.createdAt,
          input.root,
          input.title ?? existing.title,
          input.metadata ?? existing.metadata,
        );
        data.snapshots[envelope.id] = envelope;
        await write(data);
        return { ok: true, envelope };
      }),
    );
  }

  async function get(id: string): Promise<SnapshotEnvelope | undefined> {
    const data = await read();
    return data.snapshots[id];
  }

  async function list(): Promise<SnapshotSummary[]> {
    const data = await read();
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

  function remove(id: string): Promise<boolean> {
    return enqueue(() =>
      withLock(async () => {
        const data = await read();
        if (!(id in data.snapshots)) return false;
        delete data.snapshots[id];
        for (const key of Object.keys(data.idempotency)) {
          if (data.idempotency[key] === id) delete data.idempotency[key];
        }
        await write(data);
        return true;
      }),
    );
  }

  return { create, update, get, list, delete: remove };
}
