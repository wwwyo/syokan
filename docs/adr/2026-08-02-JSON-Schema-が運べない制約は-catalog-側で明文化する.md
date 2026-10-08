# JSON Schema が運べない制約は、catalog 側で明文化する

- Status: Accepted
- Date: 2026-08-02

（[#51](https://github.com/wwwyo/syokan/pull/51) merged、積み残しは [#52](https://github.com/wwwyo/syokan/pull/52) / [#53](https://github.com/wwwyo/syokan/pull/53)） — `superRefine` / `.refine` の制約は `z.toJSONSchema` に落ちないので `GET /api/catalog` の manifest からは**不可視**になり、producer 側（rss skill 等）が古い制約を写し続ける事故が実際に起きた。**`.describe()` は 1 つしか持てない**ので、prop 側に足すと共有定義（`httpUrl` の scheme 制約）の説明を静かに上書きする。**テストは「notes にその文言があるか」では弱く、`safeParse` が実際に reject することまで縛らないと実装と説明がドリフトする**。`format: "uri"` の prop は個別でなく manifest 全走査で検証する形にした（将来 prop が増えても効く）
