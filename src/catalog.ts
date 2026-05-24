import type { ComponentType, ReactNode } from "react";
import { z } from "zod";
import { type ComponentSpec, createCatalog, defineComponent } from "@/schema";
import { ArticleCard } from "./components/ArticleCard";
import { ArticleList } from "./components/ArticleList";
import { MarkdownDoc } from "./components/MarkdownDoc";
import { Page } from "./components/Page";
import { Section } from "./components/Section";

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

const pagePropsSchema = z
  .object({
    title: z.string().min(1).optional(),
  })
  .strict();

const sectionPropsSchema = z
  .object({
    heading: z.string().min(1).optional(),
  })
  .strict();

const markdownDocPropsSchema = z
  .object({
    body: z.string(),
  })
  .strict();

const articleCardPropsSchema = z
  .object({
    title: z.string().min(1),
    url: z.url(),
    summary: z.string().optional(),
    publishedAt: z.iso.datetime().optional(),
  })
  .strict();

const articleListPropsSchema = z.object({}).strict();

const PageEntry = defineViewComponent("Page", pagePropsSchema, Page);
const SectionEntry = defineViewComponent(
  "Section",
  sectionPropsSchema,
  Section,
);
const MarkdownDocEntry = defineViewComponent(
  "MarkdownDoc",
  markdownDocPropsSchema,
  MarkdownDoc,
);
const ArticleCardEntry = defineViewComponent(
  "ArticleCard",
  articleCardPropsSchema,
  ArticleCard,
);
const ArticleListEntry = defineViewComponent(
  "ArticleList",
  articleListPropsSchema,
  ArticleList,
  { childrenTypes: ["ArticleCard"] },
);

const entries: readonly ViewComponentEntry[] = [
  PageEntry,
  SectionEntry,
  MarkdownDocEntry,
  ArticleCardEntry,
  ArticleListEntry,
];

export const PageSpec = PageEntry.spec;
export const SectionSpec = SectionEntry.spec;
export const MarkdownDocSpec = MarkdownDocEntry.spec;
export const ArticleCardSpec = ArticleCardEntry.spec;
export const ArticleListSpec = ArticleListEntry.spec;

export const { itemSchema } = createCatalog(entries.map((e) => e.spec));

export const components: ReadonlyMap<string, ItemComponent> = new Map(
  entries.map((e) => [e.spec.type, e.component]),
);
