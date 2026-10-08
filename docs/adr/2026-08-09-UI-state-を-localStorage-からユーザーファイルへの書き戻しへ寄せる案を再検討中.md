# UI state を localStorage から「ユーザーファイルへの書き戻し」へ寄せる案を再検討中

- Status: Accepted
- Date: 2026-08-09

08-02 に「read-only 原則違反・ephemeral 原則に反する」として却下したが、書き戻し先はユーザーのファイル（syokan 管理外）なので原則違反ではなく**信頼境界をどこまで広げるかの設計問題**だった、と見直した。ハッシュ対象がノード全体（props + children）である以上、LLM が書き換えるたびに配下の state が失効するのは identity の自動化では解けず、**失効粒度の細分化（Checklist は項目ごと・Collapsible は summary のみ）**か書き戻しのどちらかが要る。未決の設計判断は3つ（書き戻し範囲: TreeDoc のみか snapshot もか / 粒度: checked のみか開閉も含むか / localStorage との役割分担）。PRD の red team 指摘4点も未解決（→ 09-27 に Checklist 操作の writeback 実装として着地 [#97]）
