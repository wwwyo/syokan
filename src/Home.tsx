import { SidebarToggle } from "@/components/AppSidebar/SidebarToggle";
import { PageLayout } from "@/components/PageLayout";

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
        抄して観るための view layer。snapshot を{" "}
        <code className="font-mono">POST /api/items</code> で作り、
        <code className="font-mono">/views/:id</code> で見る。
      </p>
    </PageLayout>
  );
}
