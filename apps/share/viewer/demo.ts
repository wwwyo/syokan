import type { Item } from "@syokan/app/schema";

/**
 * The landing demo: one small envelope shown as the JSON incantation next to what it
 * summons. Kept to a handful of nodes so the JSON stays readable at a glance.
 */
export const DEMO_TREE: Item = {
  type: "Stack",
  props: {},
  children: [
    { type: "Heading", props: { text: "Release readiness", level: 2 } },
    {
      type: "Stack",
      props: { direction: "horizontal" },
      children: [
        {
          type: "Stat",
          props: {
            label: "Coverage",
            value: "94%",
            delta: { text: "+2%", direction: "up" },
          },
        },
        {
          type: "Stat",
          props: {
            label: "Blockers",
            value: 0,
            delta: { text: "-3", direction: "down" },
          },
        },
      ],
    },
    {
      type: "Table",
      props: {
        columns: ["PR", "Status", "Note"],
        rows: [
          [
            "#231 fix flaky retry",
            { type: "Badge", props: { text: "merged" } },
            "ships tonight",
          ],
          [
            "#234 tighten CSP",
            { type: "Badge", props: { text: "in review", variant: "outline" } },
            "one approval left",
          ],
        ],
      },
    },
  ],
};

export const DEMO_JSON = JSON.stringify(DEMO_TREE, null, 2);
