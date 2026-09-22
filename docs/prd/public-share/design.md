# public share (公開共有) 設計

status: implemented (2026-07-15) — Phase 1 は #23/#24/#27、Phase 2 (利用規約 /terms・report 導線・rate limit binding・landing デモ・README 告知) も実装済み。rate limit は zone WAF rule ではなく Workers の `ratelimits` binding (wrangler.jsonc) で repo 内に閉じた。デプロイは `bun run deploy:share`

## 狙い — distribution 戦略

単なる個人用 publish ではなく、**syokan の全ユーザーが使える共有サービス**として運営する。配布ループ:

```
user が syokan → publish → URL を共有 → viewer が見る
   ↑                                        │
   └── install ←── "Summoned with syokan" ──┘
```

重要な帰結: **配布が起きるのは viewer 側**。publish する人は既に syokan を install 済みなので、publisher 側の多少の摩擦 (login 1 回) はループを壊さない。逆に viewer 体験と domain の評判が配布資産そのもの — domain が Safe Browsing 等に flag されたら戦略ごと死ぬので、abuse 対策は「あとで」ではなく必須要件。

## 要件

- syokan した snapshot を URL 1 つで公開できる。閲覧は認証なし (unlisted URL)
- **複数人が publish できる** (syokan を install した誰でも)
- 入口は CLI (`syokan publish <id>`) と snapshot UI の 3点リーダー内「公開」ボタン
- 公開対象は既存 snapshot のみ (file.json 直 publish はなし)
- hosting は Cloudflare (domain も Cloudflare で取得)

## アーキテクチャ

```
[CLI] syokan publish <id> ──┐
[UI]  3点リーダー > 公開 ────┼─→ local server                Cloudflare Worker (Hono)
                            │    POST /api/snapshots/:id/publish   ├ POST   /api/v1/shares      (user token)
                            │      ├ envelope を store から取得 ──→ ├ GET    /api/v1/shares/:id  (public)
                            │      ├ FileDoc を materialize (凍結)  ├ DELETE /api/v1/shares/:id  (user token, own のみ)
                            │      └ Worker へ POST (Hono RPC)      ├ GET    /api/v1/shares      (user token, own のみ)
                            └── 共有 URL を表示                      ├ POST   /api/v1/auth/token  (GitHub token 交換)
                                                                    ├ KV: share / token / user index
[CLI] syokan login ────────→ GitHub device flow ──────────────────→ └ static assets: viewer SPA + landing
```

- publish の実体はローカル server の `POST /api/snapshots/:id/publish` に一本化。CLI / UI ともこれを叩く。materialize ロジックと user token の保持を server プロセス 1 箇所に集める
- repo は同居 (同一 repo から binary と Worker の 2 成果物)、deploy は分離。viewer は `src/catalogs` + `Render.tsx` を直接 import

### 却下した対案

- **静的 HTML prerender** — renderer 二重化 / SSR 新設。pierre の async highlight は SSR 前提でない
- **cloudflared tunnel** — `/api/files` が任意パス読み出しで無認証。論外
- **匿名 publish (アカウントなし + 削除 token 方式)** — 摩擦ゼロだが却下。(1) abuse 時に「この user を ban」ができず、domain 評判を守る手段が rate limit しかない。(2) 「自分の share 一覧」を server 側で出せず、公開状態の記録をローカル永続する羽目になり ephemeral 原則と衝突。(3) 対象 audience は developer で、GitHub device flow の摩擦は実質ゼロ。あとから匿名 tier を足すのは容易 (逆は所有権 migration が必要) なので、認証ありから始める

## 識別モデル — GitHub アカウント

**publisher の identity は GitHub アカウント。** 「誰が作ったか」= share record の owner (GitHub user id / login)。

### 認証フロー

1. `syokan login` — GitHub **device flow** (client_id のみで動く、secret 不要の public client)。CLI がコードを表示 → ユーザーが github.com/login/device で承認
2. CLI が得た GitHub access token を Worker の `POST /api/v1/auth/token` へ → Worker が `GET /user` で本人確認 → **syokan 独自の API token を発行** (random、KV には hash + owner を保存)。GitHub token はその場で捨てる (保存しない)
3. API token はローカルの state dir (`~/.local/state/syokan/auth.json`, 0600) に保存。**bws は前提にしない** — 他のユーザーは bws を持っていない。gh CLI と同じ自己完結方式
4. `syokan logout` で失効 (Worker 側 token 削除 + ローカル削除)

wrangler secret の単一 token 方式 (v2) は廃止。ban は「その user の token 群を失効 + denylist」で実現できる。

### 権限

- publish / 自分の share の一覧・削除: 本人 token
- 閲覧: 認証なし (unguessable URL)。絞りたい用途は将来 Cloudflare Access ではなく share 単位の設定になるが、MVP 外
- admin (任意 share の削除・user ban): wrangler 直 or admin token。MVP は手動運用で良い

### share ページでの作成者表示

viewer に **"published by @<github-login>"** を表示する。provenance が見えることが phishing 抑止と信頼になり、publisher にとっても署名になる。匿名化オプションは将来枠。

## Worker — Hono + Hono RPC

- Worker は **Hono**。AGENTS.md の「no Hono」はローカル server (Bun.serve 集約) の方針で、workerd 上に Bun.serve は無いので矛盾しない。routing / @hono/zod-validator / 型付きクライアントが一体で手に入る
- **Hono RPC**: ローカル server → Worker のクライアントに `hc<AppType>`。同一 repo なので型を直接 import
- **`/api/v1/` prefix**: 配布済み binary と deploy 済み Worker はバージョンが独立に進む。この境界を跨ぐ API に versioning が要る。multi-tenant 化で「他人の古い binary」が恒常的に存在するため、v1 の理由はさらに強まる
- 検証: envelope schema で再検証 (**`FileDoc` type は 400 で拒否**) + サイズ cap (~1 MiB) + user あたり share 数 quota (例: 100)
- KV 設計: `share:<uuid>` → {envelope, owner, **sourceSnapshotId**, createdAt, expiresAt} / `token:<hash>` → {owner} / `user:<owner>:<uuid>` → "" (一覧用 index、prefix list)。quota・abuse 集計が複雑化したら D1 へ移行
- `GET /api/v1/shares?snapshot=<id>` (own のみ): sourceSnapshotId での filter。ローカル UI の「公開済み」表示用。sourceSnapshotId は owner 向け一覧にのみ返し、public な `GET /shares/:id` の応答には含めない (露出する理由がない)

## catalog は公開 API 契約になる (この戦略のコスト)

配布を始めた瞬間、**古い binary が post する envelope を最新 viewer が render できる**ことが恒常的な要件になる。

- catalog の props 変更は additive (backward compatible) が原則になる。破壊的変更は `schemaVersion` bump + viewer 側で旧版 handling
- 未知 type は既存 `UnknownComponent` フォールバックで劣化表示 (新 binary → まだ deploy されてない viewer、の逆方向は起きない: viewer は常に最新)
- これは「catalog を自由にリファクタできる」という現在の身軽さを一部手放すトレードオフ。distribution をやるなら不可避

## Publish flow

### FileDoc materialization (凍結)

publish 時に server が tree を走査し、`FileDoc` をファイル読み (`readTextFile` の既存制約) + `fileFormat.ts` の推論で `MarkdownDoc` / `Code` / `PlainText` に畳む。公開物は **公開時点で凍結**、ローカル編集に追従しない (後日の編集が公開 URL に漏れ続けるほうが危険)。ローカル store の envelope は書き換えない。

### 再 publish

毎回新 ID (immutable)。差し替えは将来枠。

## URL / ID / 期限

- 閲覧 URL: `https://<domain>/shares/<share_id>`。share_id は **UUIDv4** (`crypto.randomUUID()`)
- `X-Robots-Tag: noindex` + robots.txt
- TTL: 既定 **7d**、`--expires` で最大 **30d**。**無期限はなし** — 他人のデータを無期限に預かるのは運用リスクで、「溜め込まない」哲学とも一致。恒久共有の需要が見えたら別 tier として検討

## Abuse 対策 (必須要件)

domain 評判 = 配布資産、を守る:

- 認証必須 publish + user ban (denylist + token 失効)
- catalog の構造的な安全性が効く: form 入力・script が存在しないので credential phishing が成立しにくい。`Link` の href が唯一の外部導線 → viewer で外部 link に `rel="noopener nofollow ugc"` を付け、遷移前 domain 表示は将来枠
- react-markdown は rehype-raw 不使用 (raw HTML render なし) + viewer に CSP (`script-src 'self'`)
- サイズ cap / quota / Cloudflare の rate limiting rule (POST /api/v1/*)
- 各 share ページに report 導線 (GitHub issue へ) + 利用規約ページ (launch checklist)
- TTL 上限 30d 自体が abuse content の自然消滅装置になる

## Viewer + landing = 配布面

- `share/viewer/`: `GET /api/v1/shares/:id` → `Render`。theme は `prefers-color-scheme` 追従
- 各 share の footer に **"Summoned with syokan" badge** → landing へ link。これが配布ループの要
- domain root (`/`) は landing: syokan の説明 + install コマンド (`mise use -g github:wwwyo/syokan@latest`) + サンプル share
- 404 (expired / deleted) も landing への導線を持つ

## UI (ローカル app 側)

- **「公開 (Share)」ボタンは ViewPage の header に flat 配置** (3点リーダー内だと発見されない)。未 login なら `syokan login` を促すメッセージ。成功で URL + 期限 + copy ボタンのダイアログ
- **公開済み状態は header に表示する。ただしローカルには永続しない** — SSOT は KV のまま、表示は毎回 KV から導出する:
  - share record の sourceSnapshotId を使い、ViewPage 表示時に local server 経由で `GET /api/v1/shares?snapshot=<id>` を引いて「公開中」chip を出す (token 未設定 / offline / 失敗時は chip なしに静かに劣化)
  - chip クリックで既存 share の一覧 popover (URL copy / unpublish / 期限表示)。同一 snapshot の再 publish は新 ID なので複数並びうる
  - publish 直後は API 応答でその場更新 (再 fetch 不要)

## Repo / deploy 構成

```
share/
├── worker.ts        # Hono app。AppType を export
├── viewer/          # viewer SPA + landing (index.html, main.tsx)
└── wrangler.jsonc   # kv_namespaces, custom domain, assets
```

- `bun run deploy:share`: Bun.build で viewer bundle → `wrangler deploy`
- コスト: Workers/KV free tier で当面十分。伸びたら Workers Paid ($5/mo)

## スコープ外

- live sync / share の差し替え更新
- 匿名 publish tier・share 単位の閲覧制限・コメント
- publisher プロフィールページ・公開 share の発見面 (探索/一覧)
- 無期限保存

## 未決事項

1. domain 名 (landing を兼ねるのでプロダクト名がそのまま良い: e.g. `syokan.dev`? — apex に landing、`/shares/:id` に share)
2. GitHub OAuth App をどの org/account に作るか (wwwyo 個人で開始)
3. quota の初期値 (share 100/user、1 MiB/share から開始して調整)

## 段階分け

- **Phase 1 (自分だけ)**: Worker + KV + viewer + `syokan publish/shares/unpublish`。auth は GitHub device flow まで作るが使うのは自分のみ。landing は最小
- **Phase 2 (公開)**: 利用規約 / report 導線 / rate limit / quota / badge・landing 磨き込み → README で告知
