import { z } from "zod";
import { isRecord } from "../lib/json";

export type Item = {
  type: string;
  props: Record<string, unknown>;
  children?: Item[];
  key?: string;
  // cross-cutting mechanism (available on every node, independent of type):
  // id anchors the node for in-view navigation.
  id?: string;
};

export type ComponentSpec<
  TType extends string = string,
  TProps extends Record<string, unknown> = Record<string, unknown>,
> = {
  type: TType;
  propsSchema: z.ZodType<TProps>;
  // when set, children types are restricted to the allowed list; unset means no restriction
  childrenTypes?: readonly string[];
  // usage contract not expressible in the props schema (e.g. children pairing rules);
  // published via the manifest so producers don't rely on hand-copied docs
  notes?: string;
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
        id: z
          .string()
          .min(1)
          .describe(
            "In-view anchor, UI-state identity, and writeback target. A Link with href \"#<id>\" scrolls to the node, temporarily highlighting it and revealing it if inside a closed Collapsible or a checked-folded Checklist item. Interactive nodes (Checklist/Collapsible/Probe) keep their state across reloads only when they carry an id — Checklist checks are written back into the snapshot itself (visible to later reads and publishes); Collapsible/Probe state stays viewer-local. Must be unique across the whole tree — a duplicate id is rejected at ingest.",
          )
          .optional(),
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

/**
 * Depth-first search for the first node satisfying `pred`, or undefined. Stored
 * trees are parsed without revalidation, so the walk tolerates non-record
 * elements and non-array `children` rather than throwing — malformed subtrees
 * are skipped, letting the caller decide how to refuse.
 */
export function findItem(
  root: unknown,
  pred: (item: Item) => boolean,
): Item | undefined {
  const stack: unknown[] = [root];
  while (stack.length > 0) {
    const item = stack.pop();
    if (!isRecord(item)) continue;
    const node = item as Item;
    if (pred(node)) return node;
    if (Array.isArray(node.children)) stack.push(...node.children);
  }
  return undefined;
}

/**
 * The first node id that appears more than once in the tree, or null. A cross-cutting
 * id must be unique tree-wide: anchor lookup takes the first match and UI-state keys on
 * (scope, id), so a duplicate id causes wrong jumps and colliding state. Checked at
 * ingest (envelope POST/PUT), the same way Graph enforces uniqueness within a single graph.
 */
export function findDuplicateId(root: Item): string | null {
  const seen = new Set<string>();
  const dup = findItem(root, (item) => {
    if (item.id === undefined) return false;
    if (seen.has(item.id)) return true;
    seen.add(item.id);
    return false;
  });
  return dup?.id ?? null;
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
