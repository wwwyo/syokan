import { SidebarToggle } from "@/components/AppSidebar/SidebarToggle";
import { CodeSnippet } from "@/components/CodeSnippet";
import { FontSelect } from "@/components/FontSelect";
import { PageLayout } from "@/components/PageLayout";
import { ThemeSelect } from "@/components/ThemeSelect";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const POST_EXAMPLE = `curl -X POST http://localhost:5173/api/items \\
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
  }'`;

const RESPONSE_EXAMPLE = `{
  "id": "k3f9q2",
  "url": "/views/k3f9q2",
  "snapshot": { "schemaVersion": 1, "id": "k3f9q2", ... }
}`;

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
          <h2 className="font-medium">
            1. snapshot を作る —{" "}
            <code className="font-mono text-sm">POST /api/items</code>
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            <code className="font-mono">root</code> に catalog の type で組んだ tree
            を渡す。応答に <code className="font-mono">id</code> が返る。
          </p>
          <CodeSnippet code={POST_EXAMPLE} />
          <CodeSnippet code={RESPONSE_EXAMPLE} />

          <h2 className="mt-6 font-medium">
            2. 開く — <code className="font-mono text-sm">syokan open &lt;id&gt;</code>
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            返ってきた <code className="font-mono">id</code> を渡すとブラウザで開く
            （server が無ければ自動起動）。作った snapshot は左上の{" "}
            <span className="font-medium text-foreground">メニュー</span>{" "}
            からも辿れる。
          </p>
          <CodeSnippet code="syokan open k3f9q2" />

          <h2 className="mt-6 font-medium">投げられる type</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            <code className="font-mono">Stack</code> /{" "}
            <code className="font-mono">Card</code> /{" "}
            <code className="font-mono">Heading</code> /{" "}
            <code className="font-mono">Text</code> /{" "}
            <code className="font-mono">Link</code> /{" "}
            <code className="font-mono">Badge</code> /{" "}
            <code className="font-mono">Time</code> /{" "}
            <code className="font-mono">Code</code> /{" "}
            <code className="font-mono">Diff</code> /{" "}
            <code className="font-mono">MarkdownDoc</code> /{" "}
            <code className="font-mono">PlainText</code>。各 type の props は Storybook
            で確認できる。schema に合わない tree は 400 で弾かれる。
          </p>
        </TabsContent>
      </Tabs>
    </PageLayout>
  );
}
