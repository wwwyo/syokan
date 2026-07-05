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
 */
export function Card({ children }: CardProps) {
  return <UICard>{children}</UICard>;
}
