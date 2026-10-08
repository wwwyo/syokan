# `Text` の改行は `whitespace-pre-line` でなくパース層でセマンティクスを持たせる

- Status: Accepted
- Date: 2026-07-22

[#36](https://github.com/wwwyo/syokan/pull/36) merged。`\n` = `<br>`（soft 改行）、`\n\n` = 別 `<p>`（段落区切り）と規定し、CRLF は最上流で LF へ正規化（しないと境界値で `\r` が残る）。`whitespace-pre-line` 一発で済ませなかったのは、**soft 改行と段落区切りは見た目が似ていても意味が違う**ため。一方で Markdown の lexer を `Text` に持ち込む案は却下した — 短文用 node に対して依存が重く、[#34](https://github.com/wwwyo/syokan/pull/34) で定めた線引き（プロースの流れは `Markdown` node の領分）を侵す。Copilot の指摘（`Button` 等の inline 文脈で `<p>` を出すと `<button>` 内 invalid HTML）を受けて `inline` 経路を追加し、`<span>` + `<br>` へ縮退させた（inline 文脈に paragraph という概念自体がないので、`\n\n` を特別扱いで捨てるより縮退させる方が破綻しにくい）。**`inline` は public schema に出さず内部レンダリング判断に閉じた** — LLM-facing な契約を増やすと node の責務がぼやけるため。1段落のときは従来どおり `<p data-slot="text">` のままにして既存 DOM への影響をゼロに保った
