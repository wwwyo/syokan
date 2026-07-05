import { MarkdownDoc } from "@/catalogs/MarkdownDoc";
import { SidebarToggle } from "@/components/AppSidebar/SidebarToggle";
import { FontSelect } from "@/components/FontSelect";
import { PageLayout } from "@/components/PageLayout";
import { ThemeSelect } from "@/components/ThemeSelect";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { t } from "@/lib/i18n";

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
      <p className="mt-3 text-muted-foreground">{t.home.intro}</p>

      <Tabs defaultValue="settings" className="mt-10 gap-6">
        <TabsList>
          <TabsTrigger value="settings">{t.home.tabSettings}</TabsTrigger>
          <TabsTrigger value="usage">{t.home.tabUsage}</TabsTrigger>
        </TabsList>

        <TabsContent value="settings">
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">{t.home.theme}</p>
                <p className="text-sm text-muted-foreground">
                  {t.home.themeDescription}
                </p>
              </div>
              <ThemeSelect />
            </div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{t.home.font}</p>
                <p className="text-sm text-muted-foreground">
                  {t.home.fontDescription}
                </p>
              </div>
              <FontSelect />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="usage">
          <MarkdownDoc body={t.home.usageDoc} />
        </TabsContent>
      </Tabs>
    </PageLayout>
  );
}
