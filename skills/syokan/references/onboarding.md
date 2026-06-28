# syokan オンボーディング

新規ユーザーが syokan を install して、最初の snapshot をブラウザで見るまでを Claude が伴走する手順。
`syokan onboarding`・「syokan を入れて / セットアップして」・「初めて使う」と言われたらこの流れを実行する。

進め方（対話で進める。勝手に install しない）:

- **read-only な確認は黙って実行してよい**：install 済みか（`syokan --help`）・OS/arch（`uname -sm`）の確認はそのまま走らせる。
- **system を変える操作は実行前に必ずユーザーに確認する**：install / binary download / source build / `codesign` など環境を変更するコマンドは、実行するコマンドを提示して「これを実行していいか」承認を取ってから動かす。承認なしに流さない。
- 1 ステップずつ実行し、結果を確認してから次へ進む（黙って全部流さない）。
- 既に `syokan --help` が通るなら install を飛ばし、「4. 最初の snapshot」から始める。
- install 方法はユーザーに選んでもらう（既定は mise）。binary はいずれも GitHub Release 由来。

## 1. 既存環境の確認

```bash
syokan --help        # 通れば install 済み → 「4. 最初の snapshot」へ
uname -sm            # 未 install なら OS/arch を控える（例: Darwin arm64）
```

`syokan --help` が通らなければ「未 install」とユーザーに伝え、install を進めてよいか確認してから「2. install 方法を選ぶ」へ進む。ユーザーが望まなければここで止める。

## 2. install 方法を選ぶ

ユーザーに希望を聞く（既定 A）。選んだら、下のコマンドをそのまま流さず、**実行するコマンドを提示して承認を取ってから**動かす。

### A. mise (github backend) ― 推奨

GitHub Release の prebuilt binary を取得する。OS/arch は自動判別。

```bash
mise use -g github:wwwyo/syokan@latest   # 最新の prebuilt binary を install
```

- asset を自動選択できないときは `github:wwwyo/syokan[matching=<os>-<arch>]` で絞る。

### B. binary を直接 download

Releases から `syokan-<os>-<arch>` を落として PATH に置く。

```bash
curl -L -o ~/.local/bin/syokan \
  https://github.com/wwwyo/syokan/releases/download/<version>/syokan-<os>-<arch>
chmod +x ~/.local/bin/syokan
```

macOS で Gatekeeper に弾かれたら一度だけ:

```bash
codesign --sign - ~/.local/bin/syokan   # または xattr -dr com.apple.quarantine ~/.local/bin/syokan
```

### C. source から build（Bun が要る / 開発もしたい人向け）

```bash
git clone https://github.com/wwwyo/syokan && cd syokan
mise install && bun install
bun run compile
cp dist/syokan ~/.local/bin/
```

## 3. install を確認

```bash
syokan --help            # コマンド一覧
```

`syokan` は post 時に server を自動で lazy-spawn する（port 5173 / `~/.config/syokan`）。明示起動は不要。

## 4. 最初の snapshot

最初の 1 枚として、下の welcome envelope をユーザーに提示し、ガイド口調で誘う。例:

> syokan では JSON を React tree として表示できます。例えばこの JSON を syokan で表示してみましょう。実行していいですか？

承認を得てから `welcome.json` に書いて投げる（props は `syokan catalog` 準拠）。

```json
{
  "title": "syokan へようこそ",
  "metadata": { "source": { "label": "onboarding" } },
  "root": {
    "type": "Stack",
    "props": { "direction": "vertical" },
    "children": [
      { "type": "Heading", "props": { "text": "🎉 syokan のセットアップ完了", "level": 1 } },
      { "type": "Text", "props": { "body": "これが最初の snapshot です。LLM が JSON tree を投げると、syokan が catalog component で描画します。" } },
      {
        "type": "Card",
        "props": {},
        "children": [
          { "type": "Heading", "props": { "text": "次にできること", "level": 3 } },
          { "type": "Text", "props": { "body": "今日の RSS、進行中の PR review、議事録、TODO などを投げて、1 つの URL で構造化 UI として見られます。" } },
          { "type": "Badge", "props": { "text": "ephemeral", "variant": "secondary" } }
        ]
      },
      { "type": "Link", "props": { "href": "https://github.com/wwwyo/syokan", "text": "syokan のドキュメント" } }
    ]
  }
}
```

承認されたら投げる:

```bash
syokan welcome.json      # 成功すると view URL が stdout に出る
syokan open              # home を開く（`syokan open <id>` で個別 snapshot）
```

ブラウザに welcome snapshot が出れば完了。
