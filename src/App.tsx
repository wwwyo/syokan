import { Button } from "@/components/ui/button";

export function App() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">syokan</h1>
        <p className="mt-3 text-muted-foreground">
          抄して観るための view layer。setup placeholder.
        </p>
        <div className="mt-6 flex gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
        </div>
      </div>
    </main>
  );
}
