# PRD: cross-platform-ci

## Problem

syokan は macOS と Linux のバイナリを配布しているが、動作の裏付けは macOS の実機に偏っている。
PR ごとの CI は存在せず、typecheck とテストは release の tag push 時に ubuntu で一度走るだけである。
さらに FileDoc の変更監視 (fs.watch) は macOS でしか実機検証されておらず、rename 後の再 arm (監視の張り直し) のテストは darwin 限定にされている。
つまり Linux では、配布している中核機能が動く保証がないまま「インストールできる」状態だけが先行している。

one-command-install PRD と demo-video PRD で新規ユーザーの流入を作る以上、Linux の初回利用で FileDoc が壊れていれば、その一度で信頼を失う。
流入施策と同時に、少なくとも Linux の動作保証を常時の仕組みにする必要がある。

## Overview

Linux をサポート対象として常時検証する。
Windows バイナリは現在配布しておらず、本 PRD でも配布を開始しない。
代わりに、対応 OS が macOS と Linux であることを利用者に明示する。
検証は2層で行う。
PR ごとに ubuntu と macos でテストを回す層と、compile 済みバイナリで召喚から FileDoc の追従までを通す smoke test の層である。
前者はソースレベルの回帰を、後者は「配布物そのものが動く」ことを保証する。

### Goals

- すべての PR で、ubuntu と macos の両方で typecheck とテストが通ることが merge の前提になる
- compile 済みバイナリによる一連の動作 (post、view 取得、FileDoc の変更追従) が CI で常時検証される
- darwin でしか検証されていなかった fs.watch まわりの挙動が、Linux でも仕様として確認される
- 対応 OS が macOS と Linux であり、Windows が未対応であることが利用者に伝わる

### Non-Goals

- Windows 対応 (バイナリ配布の開始、CI matrix への追加) はせず、将来の別判断とする
- ブラウザを介した E2E (画面描画の検証) はしない (smoke test は CLI と HTTP / SSE の層で完結させる)
- 実機での手動検証の運用は定めない (CI による常時検証で代替する)

## User Stories

### US-001: Linux ユーザーの初回利用が壊れていない

**説明:** Linux 開発者が、インストール直後に README の手順 (最初の召喚、`syokan notes.md`) を試したい。なぜなら初回利用で中核機能が動かなければ、その後の機能がどれだけ良くても戻ってこないからだ。

**受け入れ条件:**
- [ ] Linux 向けに配布されたバイナリで、README の Getting started の手順がすべて成功する
- [ ] `syokan <path>` で召喚した markdown が、元ファイルの編集に追従して更新される
- [ ] この一連のうち、変更通知 (SSE) の受信と更新後の内容の再取得までが、release のたびに CI で自動確認されている (ブラウザ描画は含まない)

### US-002: メンテナが PR の時点で OS 差異に気付く

**説明:** メンテナ (wwwyo) が、fs.watch のような OS 依存の挙動差を merge 前に検出したい。なぜなら release 時に初めて ubuntu でテストが走る現状では、壊れた変更が main に居座り、原因の切り分けが遅れるからだ。

**受け入れ条件:**
- [ ] PR を開くと ubuntu と macos の両方で typecheck とテストが走る
- [ ] どちらかの OS で落ちた場合、PR 上で失敗が確認できる
- [ ] darwin 限定にされていた rename 後の再 arm の検証に対応する Linux 側の検証が存在する (挙動が異なる場合は、その差が仕様としてテストに書かれている)

### US-003: Windows ユーザーが対応状況を誤解しない

**説明:** Windows ユーザーが、導入を試みる前に対応状況を知りたい。なぜなら対応していると誤解して導入に時間を使うのと、未対応と知って判断するのでは、プロダクトへの印象が違うからだ。

**受け入れ条件:**
- [ ] README のインストール節に、macOS と Linux が対象で Windows は未対応だと明記されている
- [ ] Windows 対応の要望や不具合報告に対して、未対応であることを根拠に優先度を判断できる

## Constraints

- 既存の release.yml (tag push 起点、ubuntu で typecheck、test、compile:all) は維持し、PR 用の検証はこれと別に追加する
- fs.watch の挙動は OS ごとに異なることが既知である (macOS の Bun では親ディレクトリ監視が発火しない等)
- Linux の fs.watch が macOS と同じ挙動になる保証はなく、検証の結果として仕様差が見つかることを想定する
- smoke test は compile 済みバイナリを対象とする (dev モードのテストでは lazy-spawn や埋め込みフロントエンドの経路を通らないため)
- FileDoc の「view が追従する」はブラウザ描画を含むため、smoke test での保証対象は「変更通知 (SSE) が届き、再取得で更新後の内容が返る」までとする
- one-command-install PRD で Linux ユーザーの流入を作る前に、本 PRD の Linux 検証を先行させる
- macos runner は ubuntu より高コストであるため、PR ごとの実行対象は typecheck とテストに絞る

## Functional Requirements

1. PR ごとに ubuntu と macos で typecheck とテストを実行する CI を追加し、両 OS の成功を merge の必須条件 (required checks) に設定する
2. compile 済みバイナリに対する smoke test を CI に追加し、少なくとも「envelope の post が成功し view が取得できる」「`syokan <path>` で召喚したファイルの編集が、変更通知 (SSE) の受信と内容の再取得で確認できる」を含める
3. smoke test は ubuntu で Linux バイナリを、macos で darwin バイナリを実行する
4. smoke test を release の公開条件に組み込む (落ちた場合は release が公開されない)
5. fs.watch の rename 後の再 arm 挙動について、Linux での期待挙動を確認しテストとして固定する
6. README に OS ごとのサポート状況 (macOS と Linux が対象、Windows は未対応) を明記する

## Success Metrics

- 両 OS の check が merge の必須条件として有効になっている
- OS 依存の不具合が、release 後ではなく PR または release 前の smoke test の時点で検出された事例が観測される
- release 後に Linux 固有の初回利用の不具合 (インストール直後の召喚と FileDoc 追従の失敗) が報告されない
