import type { ComponentType, ReactNode } from "react";
import type { z } from "zod";
import { type ComponentSpec, createCatalog, defineComponent } from "@/schema";
import { ArticleCard, articleCardPropsSchema } from "./ArticleCard";
import { ArticleList, articleListPropsSchema } from "./ArticleList";
import { MarkdownDoc, markdownDocPropsSchema } from "./MarkdownDoc";
import { Page, pagePropsSchema } from "./Page";
import { PlainText, plainTextPropsSchema } from "./PlainText";
import { Section, sectionPropsSchema } from "./Section";

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
  defineViewComponent("Page", pagePropsSchema, Page),
  defineViewComponent("Section", sectionPropsSchema, Section),
  defineViewComponent("MarkdownDoc", markdownDocPropsSchema, MarkdownDoc),
  defineViewComponent("PlainText", plainTextPropsSchema, PlainText),
  defineViewComponent("ArticleCard", articleCardPropsSchema, ArticleCard),
  defineViewComponent("ArticleList", articleListPropsSchema, ArticleList, {
    childrenTypes: ["ArticleCard"],
  }),
];

const catalog = createCatalog(entries.map((e) => e.spec));

// itemSchema: validation / specs: type→spec registry (createCatalog が構築済み)
export const { itemSchema, registry: specs } = catalog;

export const components: ReadonlyMap<string, ItemComponent> = new Map(
  entries.map((e) => [e.spec.type, e.component]),
);
