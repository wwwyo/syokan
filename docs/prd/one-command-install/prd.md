# PRD: one-command-install

## Problem

syokan のインストール経路は、mise の github backend (`mise use -g github:wwwyo/syokan@latest`) と Releases からの手動ダウンロードの2つしかない。
mise ユーザーは開発者の中でも少数派であり、手動ダウンロードは OS と arch の判別、実行権限の付与、PATH への配置をユーザーに委ねる。
「最も多くの人に使われる」ことを目指す以上、README や X でプロダクトを知った人が最初の1分で試せないことは、機能不足よりも先に解決すべきボトルネックである。

single binary で配布しているため、ランタイムのインストールは不要である。
本 PRD が解く障壁はバイナリの入手経路に限定する。
初回体験に残る他の障壁 (Linux での動作保証、Claude Code 側の skill 導入) は、それぞれ cross-platform-ci PRD と claude-code-plugin PRD が扱う。

## Overview

macOS 向けに Homebrew tap、Linux (と macOS の brew 非利用者) 向けに curl インストーラの2経路を追加する。
どちらも1コマンドでインストールが完了し、直後に `syokan --help` と最初の召喚が動く状態を保証する。

### Goals

- macOS ユーザーが `brew install wwwyo/tap/syokan` の1コマンドでインストールできる
- Linux ユーザーが `curl -fsSL <installer URL> | sh` の1コマンドでインストールできる
- 新しいバージョンを release すると、両経路が人手の追加作業なしにそのバージョンを配布する
- README と LP 相当の場所 (X 投稿等) に掲載できる、コピペ可能なインストールコマンドが確定する

### Non-Goals

- npm / bunx での配布はしない (パッケージ管理の維持コストに対して届く層が重複する)
- Apple Developer ID による署名と notarization はしない (Gatekeeper 対策は docs の案内のみとし、根拠は Constraints に書く)
- Windows 向けのインストール経路は対象外 (Windows バイナリは配布しておらず、cross-platform-ci PRD でも未対応と定義する)
- 自動アップデート機構は作らない (brew upgrade / インストーラ再実行に委ねる)
- 既存の mise github backend 経路は変更しない (併存する)

## User Stories

### US-001: macOS 開発者が brew でインストールする

**説明:** README を見た macOS 開発者が、Homebrew でインストールしたい。なぜなら普段使いのパッケージマネージャに乗ることで、導入と更新と削除を既知の操作で済ませられるからだ。

**受け入れ条件:**
- [ ] `brew install wwwyo/tap/syokan` だけでインストールが完了する
- [ ] インストール直後に `syokan --help` が動く
- [ ] README のサンプル (`echo '...' | syokan`) がそのまま動き、view の URL が返る
- [ ] Gatekeeper の警告や手動の `codesign` 作業が発生しない
- [ ] 新バージョン release 後、`brew upgrade` で新バージョンに更新できる

### US-002: Linux 開発者が curl でインストールする

**説明:** brew を使わない開発者 (主に Linux) が、シェルワンライナーでインストールしたい。なぜなら X や README で見かけた直後に、環境準備なしでその場で試したいからだ。

**受け入れ条件:**
- [ ] `curl -fsSL <installer URL> | sh` だけでインストールが完了する
- [ ] インストーラが OS と arch を判別し、対応するバイナリを Releases から取得する
- [ ] 対応しない OS / arch では、その旨を明示してエラー終了する
- [ ] インストール後、案内された PATH 設定 (必要な場合) を済ませれば `syokan --help` が動く

### US-003: メンテナが release するだけで両経路に反映される

**説明:** メンテナ (wwwyo) が、tag push による release だけで brew と curl の両経路を最新化したい。なぜなら経路ごとの手動更新はいずれ漏れて、経路間でバージョンが割れるからだ。

**受け入れ条件:**
- [ ] tag push 起点の release が完了すると、brew 経由のインストールが新バージョンを取得する
- [ ] 同じく curl インストーラも新バージョンを取得する
- [ ] メンテナが release 後に追加のコマンドを叩く必要がない
- [ ] 経路の更新に失敗した場合 (formula 更新の失敗等)、release の結果から失敗が確認できる

## Constraints

- 配布物は release.yml が tag push 時に cross-compile する `syokan-<os>-<arch>` バイナリであり、これを配布の SSOT とする
- single binary であるため、formula / インストーラに依存パッケージの解決は不要
- brew / curl 経由の取得には quarantine 属性が付かないため、Gatekeeper が問題になるのはブラウザ経由の手動ダウンロードに限られる
- ブラウザ経由でダウンロードした場合の `codesign --sign -` 手順は README の案内として残す
- インストールコマンドは README の Getting started 冒頭に置き、mise 経路より先に提示する
- 「1コマンドでインストール」の範囲はバイナリの配置までとし、PATH 設定が別途必要な環境ではインストーラがその手順を出力する
- darwin 向けバイナリは CI (ubuntu) で cross-compile され build 時に ad-hoc 署名されるため、クリーンな macOS での実行可否を受け入れ確認の対象とする
- curl インストーラは、スクリプトをリポジトリ上の読める場所に置き、sudo を要求せず、取得したバイナリを Releases の公表 checksum と照合することで、利用者が信頼判断できる条件を満たす

## Functional Requirements

1. Homebrew tap (`wwwyo/homebrew-tap`) を用意し、`brew install wwwyo/tap/syokan` で最新 release のバイナリがインストールされる
2. release のたびに formula が新バージョンを指す (人手の追加作業なし)
3. curl で取得して `sh` に渡すインストーラスクリプトを、release と独立に更新できる恒久 URL で公開する
4. インストーラは OS と arch を判別し、最新 release から対応バイナリを取得して実行可能な状態で配置する
5. インストーラは非対応の OS / arch を明示的なエラーメッセージで拒否する
6. README の Getting started を、brew と curl を先頭に、mise と手動ダウンロードを補助経路として再構成する
7. インストーラはダウンロードしたバイナリの checksum を検証し、バージョンを指定したインストールもできる

## Success Metrics

- README 掲載のインストールコマンド2つが、クリーンな macOS / Linux 環境でそれぞれ1コマンドで成功する
- インストール開始から最初の召喚 (view の URL が返る) までが1分以内に収まる
- インストール数の観測手段が確立する (基本は GitHub Releases のダウンロード数とし、brew 経由の取得数は観測可能性を確認のうえ、取れなければダウンロード数で代替する)
