import { SidebarToggle } from "./components/AppSidebar/SidebarToggle";
import { CodeSnippet } from "./components/CodeSnippet";
import { FontSelect } from "./components/FontSelect";
import { LogoLockup } from "./components/Logo/LogoLockup";
import { PageLayout } from "./components/PageLayout";
import { ThemeSelect } from "./components/ThemeSelect";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { t } from "./lib/i18n";

function UsageSection({
  title,
  body,
  code,
}: {
  title: string;
  body: string;
  code: string;
}) {
  return (
    <section>
      <h2 className="mb-3 mt-6 text-2xl font-semibold tracking-tight">{title}</h2>
      <p className="my-3 leading-7">{body}</p>
      <CodeSnippet code={code} />
    </section>
  );
}

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
      <h1>
        <LogoLockup className="text-4xl" />
      </h1>
      <p className="mt-4 text-lg font-medium tracking-tight">{t.home.introLead}</p>
      <p className="mt-2 text-muted-foreground">{t.home.introBody}</p>

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
            <div className="flex flex-wrap items-center justify-between gap-3">
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
          <UsageSection
            title={t.home.usage.step1Title}
            body={t.home.usage.step1Body}
            code={t.home.usage.step1Code}
          />
          <p className="my-3 leading-7">{t.home.usage.responseLabel}</p>
          <CodeSnippet code={t.home.usage.responseCode} />
          <UsageSection
            title={t.home.usage.step2Title}
            body={t.home.usage.step2Body}
            code={t.home.usage.step2Code}
          />
          <UsageSection
            title={t.home.usage.step3Title}
            body={t.home.usage.step3Body}
            code={t.home.usage.step3Code}
          />
          <section>
            <h2 className="mb-3 mt-6 text-2xl font-semibold tracking-tight">
              {t.home.usage.typesTitle}
            </h2>
            <p className="my-3 leading-7">{t.home.usage.typesBody}</p>
          </section>
        </TabsContent>
      </Tabs>
    </PageLayout>
  );
}
