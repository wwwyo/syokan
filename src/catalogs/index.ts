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
  // 内部 Map 格納用に widening 済み。TProps の精度は spec 側で保つ
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

// 各 component を 1 度だけ列挙する。この配列が「LLM が投げられる type」の
// 唯一の公開マニフェストで、itemSchema / specs / components はここから導出する。
const entries: readonly ViewComponentEntry[] = [
  defineViewComponent("Stack", stackPropsSchema, Stack),
  defineViewComponent("Card", cardPropsSchema, Card),
  // leaf component は children を持たない。childrenTypes: [] で children 混入を
  // ingest 時に弾く (未指定だと children が黙って捨てられる)。
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

// itemSchema: validation / specs: type→spec registry (createCatalog が構築済み)
export const { itemSchema, registry: specs } = catalog;

export const components: ReadonlyMap<string, ItemComponent> = new Map(
  entries.map((e) => [e.spec.type, e.component]),
);
