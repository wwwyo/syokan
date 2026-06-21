import { MarkdownDoc } from "@/catalogs/MarkdownDoc";
import { SidebarToggle } from "@/components/AppSidebar/SidebarToggle";
import { FontSelect } from "@/components/FontSelect";
import { PageLayout } from "@/components/PageLayout";
import { ThemeSelect } from "@/components/ThemeSelect";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const FENCE = "```";

const USAGE_DOC = `## 1. snapshot を作る — \`POST /api/snapshots\`

\`root\` に catalog の type で組んだ tree を渡す。応答に \`id\` が返る。

${FENCE}bash
curl -X POST http://localhost:5173/api/snapshots \\
  -H "content-type: application/json" \\
  -d '{
    "title": "今日のRSS",
    "metadata": { "source": { "label": "rss" } },
    "root": {
      "type": "Stack",
      "children": [
        { "type": "Heading", "props": { "text": "今日のRSS" } },
        { "type": "Text", "props": { "text": "気になった記事をここに並べる" } }
      ]
    }
  }'
${FENCE}

応答:

${FENCE}json
{
  "id": "k3f9q2",
  "url": "/snapshots/k3f9q2",
  "snapshot": { "schemaVersion": 1, "id": "k3f9q2", ... }
}
${FENCE}

## 2. 開く — \`syokan open <id>\`

返ってきた \`id\` を渡すとブラウザで開く（server が無ければ自動起動）。作った
snapshot は左上の **メニュー** からも辿れる。

${FENCE}bash
syokan open k3f9q2
${FENCE}

## 投げられる type

\`Stack\` / \`Card\` / \`Heading\` / \`Text\` / \`Link\` / \`Badge\` / \`Time\` /
\`Code\` / \`Diff\` / \`MarkdownDoc\` / \`PlainText\`。各 type の props は Storybook
で確認できる。schema に合わない tree は 400 で弾かれる。`;

export function Home() {
  return (
    <PageLayout
      header={
        <header className="border-b border-border bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-4xl items-center gap-3 px-6 py-3">
            <SidebarToggle />
          </div>
        </header>
      }
    >
      <h1 className="text-3xl font-semibold tracking-tight">syokan</h1>
      <p className="mt-3 text-muted-foreground">
        分散したデータ（複数リポジトリ・外部 API・ファイル）を、事前定義した
        component で人間が見る形に描画する個人用 view layer。LLM や CLI は catalog
        の type で組んだ JSON tree を投げるだけ。JSX は毎回書かない。
      </p>

      <Tabs defaultValue="settings" className="mt-10 gap-6">
        <TabsList>
          <TabsTrigger value="settings">設定</TabsTrigger>
          <TabsTrigger value="usage">使い方</TabsTrigger>
        </TabsList>

        <TabsContent value="settings">
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">テーマ</p>
                <p className="text-sm text-muted-foreground">
                  システム設定に従うか、ライト / ダークを固定するか選べる。
                </p>
              </div>
              <ThemeSelect />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">フォント</p>
                <p className="text-sm text-muted-foreground">
                  表示フォントを Geist / Moralerspace / システムから選べる。
                </p>
              </div>
              <FontSelect />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="usage">
          <MarkdownDoc body={USAGE_DOC} />
        </TabsContent>
      </Tabs>
    </PageLayout>
  );
}
