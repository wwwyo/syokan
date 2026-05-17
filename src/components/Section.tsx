import type { ReactNode } from "react";

export type SectionProps = {
  heading?: string;
  children?: ReactNode;
};

export function Section({ heading, children }: SectionProps) {
  return (
    <section data-slot="section" className="space-y-3">
      {heading ? (
        <h2 className="text-xl font-semibold tracking-tight">{heading}</h2>
      ) : null}
      {children}
    </section>
  );
}
