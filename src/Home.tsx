export function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">syokan</h1>
        <p className="mt-3 text-muted-foreground">
          抄して観るための view layer。snapshot を{" "}
          <code className="font-mono">POST /api/items</code> で作り、
          <code className="font-mono">/views/:id</code> で見る。
        </p>
      </div>
    </main>
  );
}
