# catalog の循環 import は「registry を lazy 化する」ではなく「schema を cycle 外の leaf へ出す」で切った

- Status: Accepted
- Date: 2026-08-17

（[#65](https://github.com/wwwyo/syokan/pull/65) merged）— `catalogs/index.ts → <Component> → Render.tsx → catalogs/index.ts` の循環が、`TreeDoc` のように subtree を描画する catalog コンポーネントで `Cannot access 'X' before initialization` を起こしていた。原因は **registry の top-level `entries` 配列が全コンポーネントの `const ...propsSchema` を eager に読む一方、`function` 宣言は hoisting されるが `const` は TDZ に入る**という非対称性。⇒ 修正は schema を cycle 外の leaf module へ切り出すだけで済み、レビューが提案した「registry の lazy 化」は**代替案（TreeDoc を const 化しても回帰テストが検知するか）を実験で確かめた上で、diff の外へ波及する**ことを理由に見送った。この制約（component は function 宣言のまま維持する）は**フレッシュな subprocess での回帰テストでしか検証できない**ので、判断基準をコードコメントに残した。⇒ **Codex CLI の「循環は直っていない、テストも fail する」という Critical 指摘は、13 pass / 0 fail の実測と import 順序の直接 repro で反証し、codex 側が実行 cwd の誤りを認めて撤回した** — 外部レビューを鵜呑みにせず自分で裏取りする手順が実際に効いた例（→ [verify-agent-report の運用](../tech/artifact-vs-delivery-fidelity.md) と同系統）。⇒ 併せて `viewState.tsx` の identity 比較にリテラル NUL バイト（`\u0000`）が区切り文字として使われており、**そのせいでファイルがバイナリ判定され `git diff` が #29 以降ずっと読めなくなっていた**ことを発見・除去した（syokan 自身の `search_count` / `TreeDoc` の参照対象にもできない状態だった）。
