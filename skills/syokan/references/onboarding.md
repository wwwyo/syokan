# syokan オンボーディング

新規ユーザーが syokan を install して、最初の snapshot をブラウザで見るまでを Claude が伴走する手順。
`syokan onboarding`・「syokan を入れて / セットアップして」・「初めて使う」と言われたらこの流れを実行する。

進め方:

- 1 ステップずつ実行し、結果を確認してから次へ進む（黙って全部流さない）。
- 既に `syokan --help` が通るなら install を飛ばし、「4. 最初の snapshot」から始める。
- install 方法はユーザーに選んでもらう（既定は mise）。binary はいずれも GitHub Release 由来。

## 1. 既存環境の確認

```bash
syokan --help        # 通れば install 済み → 「4. 最初の snapshot」へ
uname -sm            # 未 install なら OS/arch を控える（例: Darwin arm64）
```

## 2. install 方法を選ぶ

ユーザーに希望を聞く（既定 A）。

### A. mise (ubi backend) ― 推奨

prebuilt binary を取得し version を exact pin する。最新版を確認してから固定する。

```bash
gh release list --repo wwwyo/syokan --limit 1   # 最新タグを確認（gh があれば）
mise use -g ubi:wwwyo/syokan@<version>          # 確認した version で install + pin
```

- private repo は ubi が asset を取るのに `GITHUB_TOKEN` が要る。
- asset を自動選択できないときは `ubi:wwwyo/syokan[matching=<os>-<arch>]` で絞る。

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
syokan --help --json     # 機械可読 manifest（env / exit code 込み）
```

`syokan` は post 時に server を自動で lazy-spawn する（port 5173 / `~/.config/syokan`）。明示起動は不要。

## 4. 最初の snapshot

props は `syokan catalog` で確認してから組む。下は welcome 用の最小 envelope（props は catalog 準拠）。
`welcome.json` を書いて投げる:

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

```bash
syokan welcome.json      # 成功すると view URL が stdout に出る
syokan open              # home を開く（`syokan open <id>` で個別 snapshot）
```

ブラウザに welcome snapshot が出れば完了。

## 5. 次の一歩

- 通常の使い方（envelope の組み立て、catalog、templates）は skill 本体 [SKILL.md](../SKILL.md)。
- 自分のデータを投げてみる。完成形の例は [examples.md](examples.md)。
- 気に入った view は `syokan templates add` で保存して再現する。
- snapshot は ephemeral。残したい情報は [meml](https://github.com/wwwyo/meml) へ昇格する。
