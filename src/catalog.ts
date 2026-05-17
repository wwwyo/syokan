import type { ComponentType, ReactNode } from "react";
import { z } from "zod";
import { type ComponentSpec, createCatalog, defineComponent } from "@/schema";
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
  component: ComponentType<TProps & { children?: ReactNode }>;
};

function defineViewComponent<
  TType extends string,
  TProps extends Record<string, unknown>,
>(
  type: TType,
  propsSchema: z.ZodType<TProps>,
  component: ComponentType<TProps & { children?: ReactNode }>,
): ViewComponentEntry<TType, TProps> {
  return {
    spec: defineComponent({ type, propsSchema }),
    component,
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

const PageEntry = defineViewComponent("Page", pagePropsSchema, Page);
const SectionEntry = defineViewComponent("Section", sectionPropsSchema, Section);

const entries: readonly ViewComponentEntry[] = [PageEntry, SectionEntry];

export const PageSpec = PageEntry.spec;
export const SectionSpec = SectionEntry.spec;

export const { itemSchema } = createCatalog(entries.map((e) => e.spec));

export const components: ReadonlyMap<string, ItemComponent> = new Map(
  entries.map((e) => [e.spec.type, e.component]),
);
