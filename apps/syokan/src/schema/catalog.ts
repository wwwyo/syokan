import { z } from "zod";

export type Item = {
  type: string;
  props: Record<string, unknown>;
  children?: Item[];
  key?: string;
  // cross-cutting mechanisms (available on every node, independent of type):
  // id anchors the node for in-view navigation; tags opt the node into TagFilter narrowing.
  id?: string;
  tags?: string[];
};

export type ComponentSpec<
  TType extends string = string,
  TProps extends Record<string, unknown> = Record<string, unknown>,
> = {
  type: TType;
  propsSchema: z.ZodType<TProps>;
  // when set, children types are restricted to the allowed list; unset means no restriction
  childrenTypes?: readonly string[];
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
  const knownTypes = new Set(specs.map((s) => s.type));
  for (const spec of specs) {
    if (!spec.childrenTypes) continue;
    for (const t of spec.childrenTypes) {
      if (!knownTypes.has(t)) {
        throw new Error(
          `createCatalog: ${spec.type}.childrenTypes references unknown type "${t}"`,
        );
      }
    }
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
  const variants = specs.map((spec) => {
    const allowed = spec.childrenTypes;
    const childrenBase = z.array(itemSchema);
    const childrenSchema = allowed
      ? childrenBase.superRefine((arr, ctx) => {
          arr.forEach((item, i) => {
            if (!allowed.includes(item.type)) {
              ctx.addIssue({
                code: "custom",
                path: [i, "type"],
                message: `expected one of [${allowed.join(", ")}], got "${item.type}"`,
              });
            }
          });
        }).optional()
      : childrenBase.optional();
    return z
      .object({
        type: z.literal(spec.type),
        props: spec.propsSchema,
        children: childrenSchema,
        key: z.string().min(1).optional(),
        id: z.string().min(1).optional(),
        tags: z.array(z.string().min(1)).optional(),
      })
      .strict();
  });
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
