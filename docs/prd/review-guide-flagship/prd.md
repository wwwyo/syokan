# PRD: review-guide-flagship

## Problem

syokan の現在の訴求「散らばったデータを、必要なときだけ構造化 UI で見る」は抽象的で、初見の開発者は自分が使う場面を想像できない。
汎用性を語るより、具体的な用途を1つ前面に出すほうが初見の開発者に伝わる。

候補は review-guide skill である。
この skill は「AI が書いた大量 diff を人間がレビューするためのリスクパネル」を syokan 上に構築するもので、AI コーディングの普及で誰もが直面し始めた課題 (読み切れない PR をどう見るか) への具体的な答えになっている。
しかしこの skill は個人の dotfiles に置かれ、README からは存在すら分からない。
最も訴求力のあるユースケースが、外からは見えない場所に埋まっている。

## Overview

review-guide を syokan の旗艦ユースケースとして README とデモ素材の前面に据える。
あわせて skill 本体を、個人環境の前提を除いた誰でも動かせる内容に磨き込む。
skill の配布経路の整備 (syokan への同梱や plugin 化) は本 PRD では行わず、「何ができるか」を見せることに徹する。
skill の実体は公開リポジトリ (wwwyo/dotfiles) にあり、README からその場所へリンクすることで、試したい第三者の入手手段は確保する。

### Goals

- README のユースケース筆頭が「AI が書いた大量 diff のレビューパネル」になり、実画面で示される
- review-guide skill が、特定個人の環境 (dotfiles のパス、個人リポジトリの前提) に依存せず、gh CLI で認証済みの GitHub リポジトリの PR で動く
- syokan を「AI コードレビュー時代の view layer」として一言で説明できる立ち位置を得る

### Non-Goals

- review-guide skill の syokan リポジトリへの同梱はしない (現時点の目的は訴求であり、配布は将来の別タスクとする)
- review-guide 専用の catalog type は追加しない (既存 catalog で構成できる範囲に収め、不足が観測されたら catalog-expansion の枠組みで別途判断する)
- レビューコメントの投稿や PR 操作など、view の外での作用は review-guide の責務としない

## User Stories

### US-001: README 訪問者が旗艦ユースケースで価値を掴む

**説明:** README に来た開発者が、syokan で何ができるかを具体的な1画面で理解したい。なぜなら「何でも表示できる」という説明からは、自分が使う場面を想像できないからだ。

**受け入れ条件:**
- [ ] README のユースケース紹介の先頭に、AI 生成 PR のリスクパネルが実画面のスクリーンショットつきで載っている
- [ ] スクリーンショットから、リスクの所在 (影響、アーキテクチャ、データモデル、権限) とレビュアーが見るべき箇所が読み取れる
- [ ] 「大量の diff を読み切れない」という課題の記述から始まり、syokan がその解であることが1段落で伝わる

### US-002: 第三者が自分のリポジトリで review-guide を動かせる

**説明:** review-guide に興味を持った開発者が、skill を入手して自分のリポジトリの PR で試したい。なぜならデモ画面が自分の環境で再現できなければ、旗艦ユースケースとしての説得力を持たないからだ。

**受け入れ条件:**
- [ ] skill が wwwyo 個人の環境 (パス、リポジトリ名、個人設定) を前提とせずに動く
- [ ] 公開されている skill を参照した第三者が、skill の説明だけを頼りに、gh CLI 認証済みの GitHub リポジトリの PR に対してリスクパネルを召喚できる
- [ ] 前提条件 (syokan バイナリ、gh CLI 等) が skill 内に明記されている

### US-003: メンテナがデモ素材として使い回せる

**説明:** メンテナ (wwwyo) が、demo-video PRD や X 投稿の題材として review-guide の画面を使いたい。なぜなら旗艦ユースケースと拡散素材が同じ画面であるほど、訴求が一点に集中するからだ。

**受け入れ条件:**
- [ ] 公開できる題材 (公開リポジトリの実在 PR) でリスクパネルを再現できる
- [ ] その画面が README 掲載のスクリーンショットと同じ構成である

## Constraints

- review-guide skill の SSOT は当面 dotfiles (`wwwyo/dotfiles` の `.agents/skills/review-guide/`) に置いたままとする
- リスクパネルは既存の catalog type のみで構成する
- 現行の review-guide は Markdown を FileDoc で表示する構成であり、これも既存 catalog の範囲に収まる
- ただし旗艦として見せる画面が「構造化 UI の召喚」を体現するよう、磨き込みの中で catalog ノードによる構成へ寄せる場合があり、catalog-expansion PRD の Table / Stat への依存が生じたら同 PRD を先行させる
- README は英語既定であり、ユースケース紹介も英語で書く (日本語版は README.ja.md に追従させる)
- demo-video PRD の題材は「Claude Code からの召喚」であり、本 PRD のスクリーンショットとは素材を分けて管理する (動画側で review-guide を使う判断は demo-video 側で行う)

## Functional Requirements

1. README のユースケース紹介を再構成し、AI 生成 PR のリスクパネルを筆頭に置く
2. リスクパネルの実画面スクリーンショットを README に掲載する
3. review-guide skill から個人環境への依存を除去し、任意のリポジトリと PR で動くようにする
4. skill に前提条件と使い方を、第三者が読む前提で記述する
5. 公開リポジトリの PR を題材にした再現手順を用意し、スクリーンショットを撮り直せるようにする
6. README では旗艦ユースケースの節と汎用 view layer の説明を分け、syokan がレビュー専用ツールだと誤認されない構成にする
7. README から review-guide skill の公開場所へリンクする

## Success Metrics

- 第三者 (wwwyo 以外) が skill の記述のみで自分の PR にリスクパネルを召喚できる (実地で1名以上確認する)
- README 更新から30日以内の X と GitHub (issue, discussion) での syokan への言及のうち、レビュー用途に触れるものが1件以上ある
- review-guide を入口として syokan 本体に到達した事例 (レビュー用途の言及とともに star またはインストールに触れたもの) が30日以内に1件以上観測できる
