import type { ReactNode } from "react";
import { z } from "zod";
import {
  Card as UICard,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";

export const cardPropsSchema = z
  .object({
    // rendered as the card's heading in the header slot; omit for a plain container
    title: z.string().min(1).optional(),
  })
  .strict();

export type CardProps = z.infer<typeof cardPropsSchema> & {
  children?: ReactNode;
};

/**
 * A generic card. Domain-agnostic (not tied to articles etc.): an optional title fills
 * the header slot and children fill the body. Padding comes from the shadcn header/content
 * slots (the Card root supplies only vertical rhythm), so nothing reaches into its spacing
 * variables. Lay out multiple body elements by composing a Stack.
 */
export function Card({ title, children }: CardProps) {
  return (
    <UICard>
      {title !== undefined && (
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent>{children}</CardContent>
    </UICard>
  );
}
