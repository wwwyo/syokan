import { z } from "zod";

export type Item = {
  type: string;
  props: Record<string, unknown>;
  children?: Item[];
  key?: string;
};

export type ComponentSpec<
  TType extends string = string,
  TProps extends Record<string, unknown> = Record<string, unknown>,
> = {
  type: TType;
  propsSchema: z.ZodType<TProps>;
};

export function defineComponent<
  TType extends string,
  TProps extends Record<string, unknown>,
>(spec: ComponentSpec<TType, TProps>): ComponentSpec<TType, TProps> {
  return spec;
}

export type Catalog = {
  itemSchema: z.ZodType<Item>;
  registry: ReadonlyMap<string, ComponentSpec>;
};

export function createCatalog(specs: readonly ComponentSpec[]): Catalog {
  if (specs.length === 0) {
    throw new Error("createCatalog: at least one component spec is required");
  }
  const duplicates = findDuplicateTypes(specs);
  if (duplicates.length > 0) {
    throw new Error(
      `createCatalog: duplicate component types: ${duplicates.join(", ")}`,
    );
  }

  const itemSchema: z.ZodType<Item> = z.lazy(() => buildUnion(specs, itemSchema));

  const registry = new Map<string, ComponentSpec>(
    specs.map((spec) => [spec.type, spec] as const),
  );
  return { itemSchema, registry };
}

function buildUnion(
  specs: readonly ComponentSpec[],
  itemSchema: z.ZodType<Item>,
): z.ZodType<Item> {
  const variants = specs.map((spec) =>
    z
      .object({
        type: z.literal(spec.type),
        props: spec.propsSchema,
        children: z.array(itemSchema).optional(),
        key: z.string().min(1).optional(),
      })
      .strict(),
  );
  if (variants.length === 1) {
    return variants[0] as unknown as z.ZodType<Item>;
  }
  return z.discriminatedUnion(
    "type",
    variants as unknown as [(typeof variants)[number], ...(typeof variants)[number][]],
  ) as unknown as z.ZodType<Item>;
}

function findDuplicateTypes(specs: readonly ComponentSpec[]): string[] {
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const spec of specs) {
    if (seen.has(spec.type)) dups.add(spec.type);
    seen.add(spec.type);
  }
  return [...dups];
}
