# 画像対応（`Image` catalog node）の PRD を確定 — 保存先は `data:` 埋め込みでなく R2

- Status: Accepted
- Date: 2026-07-19

RSS のサムネイルや図を snapshot に載せたい需要から着手。`data:` URI で envelope に埋める案を強く検討したが、share の envelope は **KV 保存で 1 MiB 上限**があり、base64 化した画像はこの上限とすぐ衝突する。加えてキャッシュが効かず、将来の動画対応にも伸びない。そこで **publish 時に `materialize` で share 側へアセットを送って R2 に保存し、share からは asset URL で参照する**設計に転換した。ローカル表示は参照ノード扱いで、ファイル内容を store/envelope に持ち込まない。`src` はローカル絶対パスか HTTPS URL に限定。**R2 を採ったことで画像圧縮を MVP の必須要件から外せた**のが実質的に一番大きい（Worker の CPU 制約下でバイナリ処理を抱え込まずに済む）。動画・音声は `media-src` と Range 対応が要るのでスコープ外に置き、実需が出たら別フェーズ。quota は「生存中 share の asset 合計」で計上し、削除や TTL 失効で回復する。進め方としては **`grill-me` でヒアリング → codex で文章レビューと red team レビューを別々に回す**のが効いた（AC に実装詳細が混ざる・Overview に設計詳細が残る等を検出でき、PRD を全面改稿した）
