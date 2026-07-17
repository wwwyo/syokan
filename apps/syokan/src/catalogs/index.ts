import type { ComponentType, ReactNode } from "react";
import type { z } from "zod";
import { type ComponentSpec, createCatalog, defineComponent } from "../schema";
import { Badge, badgePropsSchema } from "./Badge";
import { Card, cardPropsSchema } from "./Card";
import { Checklist, checklistPropsSchema } from "./Checklist";
import { Code, codePropsSchema } from "./Code";
import { Collapsible, collapsiblePropsSchema } from "./Collapsible";
import { Diff, diffPropsSchema } from "./Diff";
import { Graph, graphPropsSchema } from "./Graph";
import { Heading, headingPropsSchema } from "./Heading";
import { Link, linkPropsSchema } from "./Link";
import { Markdown, markdownPropsSchema } from "./Markdown";
import { Mermaid, mermaidPropsSchema } from "./Mermaid";
import { Probe, probePropsSchema } from "./Probe";
import { Stack, stackPropsSchema } from "./Stack";
import { Stat, statPropsSchema } from "./Stat";
import { Table, tablePropsSchema } from "./Table";
import { TagFilter, tagFilterPropsSchema } from "./TagFilter";
import { Text, textPropsSchema } from "./Text";
import { Time, timePropsSchema } from "./Time";
import { TreeDoc, treeDocPropsSchema } from "./TreeDoc";

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
  options?: { childrenTypes?: readonly string[]; notes?: string },
): ViewComponentEntry<TType, TProps> {
  return {
    spec: defineComponent({
      type,
      propsSchema,
      ...(options?.childrenTypes ? { childrenTypes: options.childrenTypes } : {}),
      ...(options?.notes ? { notes: options.notes } : {}),
    }),
    component: component as unknown as ItemComponent,
  };
}

// enumerate each component exactly once. This array is the single public manifest of "types the LLM
// can post", and itemSchema / specs / components are derived from it.
const entries: readonly ViewComponentEntry[] = [
  defineViewComponent("Stack", stackPropsSchema, Stack),
  defineViewComponent("Card", cardPropsSchema, Card, {
    notes:
      "Optional title fills the header slot; children fill the body. Wrap multiple body elements in a Stack for spacing (the body is a single padded slot with no inter-child gap of its own).",
  }),
  // leaf components have no children. childrenTypes: [] rejects stray children at
  // ingest time (when unspecified, children are silently dropped).
  defineViewComponent("Heading", headingPropsSchema, Heading, {
    childrenTypes: [],
  }),
  defineViewComponent("Link", linkPropsSchema, Link, { childrenTypes: [] }),
  defineViewComponent("Text", textPropsSchema, Text, { childrenTypes: [] }),
  defineViewComponent("Time", timePropsSchema, Time, { childrenTypes: [] }),
  defineViewComponent("Diff", diffPropsSchema, Diff, { childrenTypes: [] }),
  defineViewComponent("Code", codePropsSchema, Code, { childrenTypes: [] }),
  defineViewComponent("Badge", badgePropsSchema, Badge, { childrenTypes: [] }),
  defineViewComponent("Mermaid", mermaidPropsSchema, Mermaid, {
    childrenTypes: [],
  }),
  defineViewComponent("Markdown", markdownPropsSchema, Markdown, {
    childrenTypes: [],
    notes:
      "Prose flow only. Block structure/data belongs to catalog nodes: headings, GFM tables, task-list items, raw HTML, images, and non-http(s) links are rejected — use Heading/Table/Checklist instead, or Link for a single external link.",
  }),
  defineViewComponent("TreeDoc", treeDocPropsSchema, TreeDoc, {
    childrenTypes: [],
  }),
  // composite leaves: cells / labels embed the inline subset via props (see inline.tsx)
  defineViewComponent("Table", tablePropsSchema, Table, {
    childrenTypes: [],
    notes:
      "Display-only. Cells accept a string, one inline node (Text/Link/Badge/Time), or an array of them. Row narrowing is not a Table feature — tag the rows' surrounding nodes and use TagFilter.",
  }),
  defineViewComponent("Stat", statPropsSchema, Stat, {
    childrenTypes: [],
    notes:
      'Display-only labelled figure. Put several in a Stack direction="horizontal" for a dashboard row.',
  }),
  defineViewComponent("Checklist", checklistPropsSchema, Checklist, {
    notes:
      "children[i] is the expanded body of items[i] (optional). Checking folds the body to the label line; checks are viewer-local UI state, never written back. Give the node an id to persist progress across reloads.",
  }),
  defineViewComponent("Collapsible", collapsiblePropsSchema, Collapsible, {
    notes:
      "children are the folded body. Open/closed is viewer-local UI state; give the node an id to persist it. Anchor navigation opens closed ancestors automatically. Fold data drill-downs (per-item detail, long payloads), never prose — prose belongs in a visible Markdown node, not behind a fold.",
  }),
  defineViewComponent("TagFilter", tagFilterPropsSchema, TagFilter, {
    notes:
      "Narrows descendants: when chips are selected, only nodes whose cross-cutting `tags` intersect the selection stay visible; untagged nodes always show. Give the node an id to persist the selection.",
  }),
  defineViewComponent("Graph", graphPropsSchema, Graph, {
    childrenTypes: [],
    notes:
      "Static directed graph. role→color/stroke is fixed by the renderer (added=green, removed=red+dashed, hotspot=amber+bold, neutral=muted). Put two side by side for a before/after contrast.",
  }),
  defineViewComponent("Probe", probePropsSchema, Probe, {
    childrenTypes: [],
    notes:
      "check must be one of the predefined read-only kinds (see mechanisms.probe.kinds); include the generation-time run as `result`. Viewers re-run it via the local server; reruns land in viewer-local UI state. On shared views rerun is disabled and args/results are hidden unless shareVisible.",
  }),
];

const catalog = createCatalog(entries.map((e) => e.spec));

// itemSchema: validation / specs: type→spec registry (built by createCatalog)
export const { itemSchema, registry: specs } = catalog;

export const components: ReadonlyMap<string, ItemComponent> = new Map(
  entries.map((e) => [e.spec.type, e.component]),
);
