import type { ReactNode } from "react";
import { z } from "zod";

export const cardPropsSchema = z.object({}).strict();

// z.infer of the empty schema collapses to never when intersected with children, so type only children.
export type CardProps = {
  children?: ReactNode;
};

/**
 * A generic card that wraps children. Domain-agnostic (not tied to articles etc.);
 * the contents are expressed by composing Heading / Text / Link / Stack and the like.
 */
export function Card({ children }: CardProps) {
  return (
    <div
      data-slot="card"
      className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm transition-shadow hover:shadow"
    >
      {children}
    </div>
  );
}
