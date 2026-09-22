# PRD: catalog-expansion

## Problem

catalog は現在12種 (Badge, Card, Code, Diff, FileDoc, Heading, Link, MarkdownDoc, PlainText, Stack, Text, Time) で、文書と diff の表示には足りるが、「LLM が構造化したデータを見る」ときの頻出形が欠けている。
集計結果や一覧を出すには Stack と Text を組み合わせた擬似的な表になり、TODO やレビュー観点の列挙にはチェック状態を表す手段がなく、ダッシュボード的な数値の提示には数値を際立たせる部品がない。

擬似表現には2つのコストがある。
第一に、skill が組む envelope のノード数が膨らみ、LLM のトークンと生成の安定性を損なう。
第二に、同じ「表」が召喚のたびに違う組み方になり、catalog が本来保証するはずの design 一貫性が崩れる。
これは「レンダリングは一度設計して再利用する」という syokan の中核の分業が、頻出形に対して機能していないことを意味する。

欠落は代表ユースケースで具体化している。
review-guide のリスクパネルとダッシュボード的な view には Table と Stat が、TODO とレビュー観点の列挙には Checklist が繰り返し必要になる。

## Overview

catalog に **Table** (表)、**Checklist** (チェック状態つきの列挙)、**Stat** (ラベルつきの数値) の3 type を追加する。
いずれも表示専用であり、view 上の操作は提供せず、状態も保持しない。

### Goals

- 表形式のデータを、Stack と Text の組み合わせではなく単一の Table ノードで表現できる
- 完了状態を持つ列挙 (TODO、レビュー観点、手順) を Checklist ノードで表現できる
- 数値の要約 (件数、増減、達成率) を、本文より際立つ Stat ノードで表現できる
- 3 type が既存 catalog と同じ扱い (JSON Schema 公開、Storybook、skill からの参照) に組み込まれる

### Non-Goals

- Chart (折れ線、棒) は追加しない (props 設計と表現の統制コストが大きく、頻出形の欠落を埋める本 PRD の範囲を超える)
- Checklist のチェック操作は実装しない (チェック状態はデータ側が持ち、view から状態を書き戻すことは ephemeral 原則に反する)
- 今後の catalog 追加の一般基準の策定はしない (本 PRD は3 type の追加のみを扱う)
- 既存12 type の props 変更はしない

## Glossary

- **inline 系ノード**：Text, Link, Badge, Time のように、行内に並べて配置できる既存の catalog type

## User Stories

### US-001: LLM が集計結果を表で召喚する

**説明:** Claude Code (skill) が、集計や一覧 (例: PR ごとのレビュー状況、フィードの記事一覧) を表として召喚したい。なぜなら現状の Stack と Text による擬似表はノード数が多く、列の揃えも保証されないからだ。

**受け入れ条件:**
- [ ] ヘッダ行と複数のデータ行を持つ表が、単一の Table ノードで表示される
- [ ] セルにはテキストに加え、既存 catalog の inline 系ノード (Link, Badge, Time 等) を置ける
- [ ] 列数と行数がデータに応じて可変である
- [ ] ダークとライトの両テーマで既存 catalog と調和した見た目になる

### US-002: LLM が完了状態つきの列挙を召喚する

**説明:** skill が、今日の TODO やレビュー観点のような「済 / 未済」を持つ列挙を召喚したい。なぜなら Text の先頭に記号を付ける現状の表現では、状態が一目で判別できないからだ。

**受け入れ条件:**
- [ ] 各項目がチェック済みか未チェックかを視覚的に区別して表示される
- [ ] チェック状態は envelope のデータとして与えられ、view 上から変更できない
- [ ] 項目のラベルにはテキストに加え inline 系ノードを置ける

### US-003: LLM が数値の要約を召喚する

**説明:** skill が、ダッシュボード的な view の冒頭に件数や増減 (例: 未読 12件、前日比 +3) を置きたい。なぜなら本文と同じ Text では数値が埋もれ、view を開いた瞬間の要約として機能しないからだ。

**受け入れ条件:**
- [ ] 数値とラベルの組が、本文より視覚的に際立つカードとして表示される
- [ ] 増減や傾向 (正負の方向) を任意で添えられる
- [ ] 複数の Stat を横に並べたダッシュボード的な配置が既存の Stack で組める

### US-004: skill が新 type を props 契約つきで利用できる

**説明:** syokan skill (および任意の LLM クライアント) が、新 type の props 契約を取得して envelope を組みたい。なぜなら catalog の SSOT は `src/catalogs` にあり、契約が API から取れなければ skill は推測で JSON を書くことになるからだ。

**受け入れ条件:**
- [ ] `GET /api/catalog` に3 type の JSON Schema が含まれる
- [ ] 不正な props を持つ envelope は既存 type と同様に validation エラーで拒否される
- [ ] syokan skill の説明に3 type が反映され、使いどころが示されている

## Constraints

- type と props の定義は `src/catalogs` を SSOT とし、manifest 経由で `GET /api/catalog` に公開する既存の仕組みに乗せる
- 各 type は component collocation 規約 (実装、テスト、story を同一ディレクトリに置く) に従い、Storybook でダークとライトの両テーマを確認できる状態にする
- 表示専用とし、view 内の状態を永続化しない ephemeral 原則を守る
- Checklist が view 上で操作できるという誤解を与えない表示にする
- 進行中の共有機能 (share) の viewer は catalog の Render を共用しているため、新 type が共有 view でも表示されることを確認の対象に含める
- 見た目は既存の shadcn ベースのデザインシステムに揃える

## Functional Requirements

1. Table type を追加し、ヘッダと行を props で受け取り、セルに children として inline 系ノードを置けるようにする
2. Checklist type を追加し、checked を持つ項目の配列を受け取り、状態を視覚的に区別して表示する
3. Stat type を追加し、数値とラベルと任意の増減表示を受け取る
4. 3 type を catalog registry に登録し、`GET /api/catalog` の JSON Schema に含める
5. 3 type それぞれの表示を、prop の変化形とエッジケース (長文セル、空行、ゼロ件) を含めて視覚確認できるようにする
6. syokan skill の記述を更新し、3 type の使いどころを示す
7. Table のセルと Checklist の項目ラベルに置ける type の集合を、props 契約 (JSON Schema) 上で明示する

## Success Metrics

- 表、チェックリスト、数値要約を含む view が、擬似表現なしに3 type で召喚できる (代表的な envelope で確認する)
- 同じ用途の view で、envelope のノード数が擬似表現時代より減る (代表例での比較)
- 固定した依頼文のセット (表、TODO、数値要約を求めるもの) に対して、skill が期待どおり3 type を選ぶ (Stack と Text の擬似表を組まない)
