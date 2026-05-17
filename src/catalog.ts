import type { ComponentType, ReactNode } from "react";
import { z } from "zod";
import { type Catalog, createCatalog, defineComponent } from "@/schema";
import { Page } from "./components/Page";
import { Section } from "./components/Section";

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

export const PageSpec = defineComponent({
  type: "Page",
  propsSchema: pagePropsSchema,
});

export const SectionSpec = defineComponent({
  type: "Section",
  propsSchema: sectionPropsSchema,
});

const catalog: Catalog = createCatalog([PageSpec, SectionSpec]);

export const { itemSchema, registry: schemaRegistry } = catalog;

export type ItemComponent = ComponentType<
  Record<string, unknown> & { children?: ReactNode }
>;

export const components: ReadonlyMap<string, ItemComponent> = new Map([
  ["Page", Page as unknown as ItemComponent],
  ["Section", Section as unknown as ItemComponent],
]);
