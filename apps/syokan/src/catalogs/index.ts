import type { ComponentType, ReactNode } from "react";
import type { z } from "zod";
import { type ComponentSpec, createCatalog, defineComponent } from "@/schema";
import { Badge, badgePropsSchema } from "./Badge";
import { Card, cardPropsSchema } from "./Card";
import { Code, codePropsSchema } from "./Code";
import { Diff, diffPropsSchema } from "./Diff";
import { FileDoc, fileDocPropsSchema } from "./FileDoc";
import { Heading, headingPropsSchema } from "./Heading";
import { Link, linkPropsSchema } from "./Link";
import { MarkdownDoc, markdownDocPropsSchema } from "./MarkdownDoc";
import { PlainText, plainTextPropsSchema } from "./PlainText";
import { Stack, stackPropsSchema } from "./Stack";
import { Text, textPropsSchema } from "./Text";
import { Time, timePropsSchema } from "./Time";

export type ItemComponent = ComponentType<
  Record<string, unknown> & { children?: ReactNode }
>;

type ViewComponentEntry<
  TType extends string = string,
  TProps extends Record<string, unknown> = Record<string, unknown>,
> = {
  spec: ComponentSpec<TType, TProps>;
  // widened for internal Map storage. TProps precision is kept on the spec side
  component: ItemComponent;
};

function defineViewComponent<
  TType extends string,
  TProps extends Record<string, unknown>,
>(
  type: TType,
  propsSchema: z.ZodType<TProps>,
  component: ComponentType<TProps & { children?: ReactNode }>,
  options?: { childrenTypes?: readonly string[] },
): ViewComponentEntry<TType, TProps> {
  return {
    spec: defineComponent({
      type,
      propsSchema,
      ...(options?.childrenTypes ? { childrenTypes: options.childrenTypes } : {}),
    }),
    component: component as unknown as ItemComponent,
  };
}

// enumerate each component exactly once. This array is the single public manifest of "types the LLM
// can post", and itemSchema / specs / components are derived from it.
const entries: readonly ViewComponentEntry[] = [
  defineViewComponent("Stack", stackPropsSchema, Stack),
  defineViewComponent("Card", cardPropsSchema, Card),
  // leaf components have no children. childrenTypes: [] rejects stray children at
  // ingest time (when unspecified, children are silently dropped).
  defineViewComponent("Heading", headingPropsSchema, Heading, {
    childrenTypes: [],
  }),
  defineViewComponent("Link", linkPropsSchema, Link, { childrenTypes: [] }),
  defineViewComponent("Text", textPropsSchema, Text, { childrenTypes: [] }),
  defineViewComponent("Time", timePropsSchema, Time, { childrenTypes: [] }),
  defineViewComponent("MarkdownDoc", markdownDocPropsSchema, MarkdownDoc, {
    childrenTypes: [],
  }),
  defineViewComponent("PlainText", plainTextPropsSchema, PlainText, {
    childrenTypes: [],
  }),
  defineViewComponent("Diff", diffPropsSchema, Diff, { childrenTypes: [] }),
  defineViewComponent("Code", codePropsSchema, Code, { childrenTypes: [] }),
  defineViewComponent("Badge", badgePropsSchema, Badge, { childrenTypes: [] }),
  defineViewComponent("FileDoc", fileDocPropsSchema, FileDoc, {
    childrenTypes: [],
  }),
];

const catalog = createCatalog(entries.map((e) => e.spec));

// itemSchema: validation / specs: type→spec registry (built by createCatalog)
export const { itemSchema, registry: specs } = catalog;

export const components: ReadonlyMap<string, ItemComponent> = new Map(
  entries.map((e) => [e.spec.type, e.component]),
);
