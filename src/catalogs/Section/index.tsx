import type { ReactNode } from "react";
import { z } from "zod";

export const sectionPropsSchema = z
  .object({
    heading: z.string().min(1).optional(),
  })
  .strict();

export type SectionProps = z.infer<typeof sectionPropsSchema> & {
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
