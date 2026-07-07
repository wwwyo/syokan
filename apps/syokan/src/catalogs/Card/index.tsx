import type { ReactNode } from "react";
import { z } from "zod";
import { Card as UICard } from "../../components/ui/card";

export const cardPropsSchema = z.object({}).strict();

// z.infer of the empty schema collapses to never when intersected with children, so type only children.
export type CardProps = {
  children?: ReactNode;
};

/**
 * A generic card that wraps children. Domain-agnostic (not tied to articles etc.);
 * the contents are expressed by composing Heading / Text / Link / Stack and the like.
 * shadcn's Card keeps horizontal padding on its slots (CardContent) rather than the
 * root; since this holds arbitrary catalog nodes with no such slot, add the inline
 * padding here so content isn't flush to the edges (the root already supplies py).
 */
export function Card({ children }: CardProps) {
  return <UICard className="px-(--card-spacing)">{children}</UICard>;
}
