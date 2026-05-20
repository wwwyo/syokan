export type UnknownComponentProps = {
  type: string;
};

export function UnknownComponent({ type }: UnknownComponentProps) {
  return (
    <div
      role="alert"
      data-slot="unknown-component"
      className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      Unknown component type: <code className="font-mono">{type}</code>
    </div>
  );
}
