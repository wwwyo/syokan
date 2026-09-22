# public share 実装契約 (agent 間共有)

design.md (v3) を実装に落とすための確定インターフェース。実装 agent はここに従う。差異が必要になったらこのファイルを更新してから実装する。

## ファイル配置

```
apps/share/
├── worker.ts            # Hono app 本体。`export type AppType` 必須
├── types.ts             # ShareRecord / API req・res の共有型 (worker と server 双方が import)
├── viewer/
│   ├── index.html       # viewer + landing の entry
│   └── main.tsx         # ルート判定 (/ → landing, /shares/:id → viewer)
└── wrangler.jsonc
apps/syokan/server/materialize.ts    # FileDoc → 具象ノード変換 (fileSource.ts を使うため server 配置。frontend bundle への混入を防ぐ)
apps/syokan/server/share.ts          # publish/一覧/削除 proxy の実装 + auth token 管理
apps/syokan/cli/ (既存 syokan.ts へ)  # login / logout / publish / shares / unpublish
```

## Worker API (`/api/v1/`)

認証: `Authorization: Bearer <syokan API token>`。token は `token:<sha256hex>` KV エントリで検証。

### POST /api/v1/auth/token
- body: `{ githubAccessToken: string }`
- Worker が `GET https://api.github.com/user` で本人確認 → API token (crypto.randomUUID() を 2 連結等の 256bit random hex) を発行
- KV: `token:<sha256(token)>` → `{ owner: string (github login), ownerId: number, createdAt: string }`
- res 200: `{ token: string, login: string }`
- GitHub token は保存しない。401: GitHub 検証失敗

### POST /api/v1/shares (Bearer)
- body: `{ envelope: <snapshot envelope>, sourceSnapshotId: string, expiresIn?: number (秒, 上限 30d=2592000, 既定 7d=604800) }`
- 検証: envelope の**構造** schema (schemaVersion/id/root/createdAt + 汎用再帰 Item: type/props/children/key)。catalog の props union は検証しない — catalogs/index.ts を import すると React が worker bundle に混入するため。未知 type は viewer の UnknownComponent で劣化表示されるので構造検証で足りる / tree 内に `FileDoc` type があれば 400 / serialize 後 1 MiB 超で 413 / owner の share 数 100 超で 429
- KV: `share:<uuid>` → ShareRecord, `user:<owner>:<uuid>` → "" (両方に同じ expirationTtl)
- res 201: `{ id, url, expiresAt }` (url は `https://<domain>/shares/<id>`; domain は env `SHARE_ORIGIN` から)

### GET /api/v1/shares/:id (public)
- res 200: `{ envelope, publishedBy: string (github login), createdAt, expiresAt }`
- sourceSnapshotId は返さない。miss は 404 `{ error: "not_found" }` (expired/deleted 区別なし)
- `Cache-Control: no-store`, `X-Robots-Tag: noindex`

### GET /api/v1/shares (Bearer)
- query: `?snapshot=<sourceSnapshotId>` (任意 filter)
- own のみ。res 200: `{ shares: [{ id, url, sourceSnapshotId, createdAt, expiresAt }] }` (envelope は含めない)

### DELETE /api/v1/shares/:id (Bearer)
- own のみ (owner 不一致は 404 扱い)。res 200: `{ ok: true }`

### ShareRecord (KV value)
```ts
type ShareRecord = {
  envelope: unknown        // 検証済み snapshot envelope
  owner: string            // github login
  ownerId: number
  sourceSnapshotId: string
  createdAt: string        // ISO
  expiresAt: string        // ISO
}
```

### Worker env bindings
- `SHARES` (KVNamespace)
- `SHARE_ORIGIN` (vars: `https://<domain>`)
- assets binding `ASSETS` (viewer SPA; `/api/*` 以外を fallback)

## local server API (Bun.serve routes に追加)

すべて既存の routes.ts 慣習 (エラー形式・JSON 応答) に従う。Worker 呼び出しは `hc<AppType>` (hono/client)。Worker の origin は env `SYOKAN_SHARE_API` (既定: 本番 domain 定数)。

### POST /api/snapshots/:id/publish
- body: `{ expiresIn?: number }`
- 手順: store から snapshot 取得 (404) → tree を materialize (FileDoc → 具象。ファイル読み失敗はそのノードを PlainText のエラーテキストに畳まず **publish 全体を 422 で失敗**させる: 欠けた公開物を作らない) → auth token 取得 (未 login は 401 `{ error: "not_logged_in" }`) → Worker POST → res をそのまま返す `{ id, url, expiresAt }`

### GET /api/shares?snapshot=<id> / DELETE /api/shares/:id
- Worker への認証つき proxy。未 login: GET は `{ shares: [] }` を返す (UI が静かに劣化するため)、DELETE は 401

### auth token 管理 (server/share.ts)
- 保存先: `<XDG state dir>/auth.json` (0600) `{ token, login }` — paths.ts の既存 state 解決を使う
- `POST /api/auth/login` body `{ githubAccessToken }`: Worker へ交換 → auth.json 保存 → `{ login }`
- `DELETE /api/auth/login`: auth.json 削除 (Worker 側 token 失効は将来枠で可)
- `GET /api/auth/login`: `{ login }` or 401 (UI の login 状態表示用)

## materialize (server/materialize.ts)

- `materializeTree(node): Promise<node>` — tree を再帰し `type === "FileDoc"` を fileFormat.ts の推論に従い `MarkdownDoc` / `Code` / `PlainText` ノードに変換。ファイル読みは server/fileSource.ts の既存読み関数を再利用。元 tree は変更しない (コピー)
- 変換後ノードの props は各 catalog schema に適合させる (title 等 FileDoc props から引き継げるものは引き継ぐ)

## CLI

- `syokan login`: GitHub device flow (client_id は定数 `SYOKAN_GITHUB_CLIENT_ID` — プレースホルダ定数で実装し、OAuth App 作成後に差し替え)。`https://github.com/login/device/code` → user_code 表示 + verification_uri 案内 → polling (`urn:ietf:params:oauth:grant-type:device_code`) → access_token を local server `POST /api/auth/login` へ → "Logged in as <login>"
- `syokan logout`
- `syokan publish <id> [--expires <e.g. 30d>]`: local server publish → URL + 期限を表示
- `syokan shares`: 一覧表示 (id, url, expiresAt)
- `syokan unpublish <shareId>`
- device flow の scope は空 (`scope=""` — public プロフィールの取得だけで足りる)

## UI (ViewPage header)

- 「Share」ボタンを header に flat 配置。click → `POST /api/snapshots/:id/publish` → 成功: URL + 期限 + copy ボタンの dialog。401 (not_logged_in) → `syokan login` を案内する dialog
- 公開中 chip: ViewPage mount 時に `GET /api/shares?snapshot=<id>` → 1 件以上で chip。click → popover (各 share の url copy / unpublish / expiresAt)。publish 成功時はローカル state に追加
- 文言は既存 i18n 方式に従う (en 既定 / ja)

## 依存追加

- `hono` (dependencies, exact pin, `bun add --exact hono`) — cooldown 方針はリポジトリの bunfig 設定に従う
- `wrangler` (devDependencies, exact pin)
- viewer は既存 react / catalogs を使う。新 UI ライブラリは追加しない

## やらないこと (今回)

- 実 deploy / KV namespace 作成 / OAuth App 作成 (client_id はプレースホルダ)
- rate limiting rule / 利用規約ページの本文 (landing に placeholder link のみ)
