import {
  Children,
  createContext,
  Fragment,
  isValidElement,
  type ReactNode,
  useContext,
} from "react";
import { z } from "zod";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "../../components/ui/resizable";
import { cn } from "../../lib/utils";

export const stackPropsSchema = z
  .object({
    direction: z.enum(["vertical", "horizontal"]).optional(),
    resizable: z.boolean().optional(),
    // A bounded scale, not a raw number: the producer says how tightly things belong
    // together, the renderer owns the actual spacing.
    gap: z
      .enum(["none", "sm", "md", "lg"])
      .optional()
      .describe(
        "How tightly the children belong together. Omit it — nesting depth then picks the spacing, which is what keeps views consistent. Set it only to override that for one group.",
      ),
  })
  .strict();

export type StackProps = z.infer<typeof stackPropsSchema> & {
  children?: ReactNode;
};

const gapClasses = {
  none: "gap-0",
  sm: "gap-2",
  md: "gap-4",
  lg: "gap-8",
} as const;

/**
 * Spacing shrinks as stacks nest: the outermost stack separates sections, an inner one
 * groups items that already read as one block. Depth past the scale clamps to the tightest.
 */
const gapByDepth = ["lg", "md", "sm"] as const;

/**
 * Counts enclosing Stacks. Deliberately only Stack participates: it is the one container whose
 * whole job is spacing siblings, so an intervening Card / Collapsible / Checklist must not reset
 * the scale — nesting a Card is a grouping decision, not a reason to start spacing out again.
 * Those containers keep owning their own internal spacing. If a second container ever needs the
 * same idea, promote this to a shared layout module rather than importing it from Stack.
 */
const StackDepthContext = createContext(0);

/**
 * General-purpose layout catalog that arranges children vertically (default) or horizontally.
 * Since a snapshot has a single root, this is meant to be used as the root that bundles multiple elements.
 * The default is a plain flex stack. With resizable=true it becomes a ResizablePanelGroup whose
 * boundaries can be dragged, and the handle appears only on hover.
 */
export function Stack({
  direction = "vertical",
  resizable = false,
  gap,
  children,
}: StackProps) {
  const depth = useContext(StackDepthContext);
  const depthGap = gapByDepth[Math.min(depth, gapByDepth.length - 1)] ?? "sm";
  const childDepth = depth + 1;

  if (resizable) {
    const panels = Children.toArray(children);
    return (
      <ResizablePanelGroup
        orientation={direction}
        // vertical splits collapse if the panel group has no height. Horizontal follows its content, so give a min height only to vertical.
        className={cn(direction === "vertical" && "min-h-[16rem]")}
      >
        {panels.map((panel, index) => (
          <Fragment key={isValidElement(panel) ? (panel.key ?? index) : index}>
            {/* the line (bg-border) is always shown. The grip appears only when hovering near the boundary (ui/resizable.tsx) */}
            {index > 0 ? <ResizableHandle withHandle /> : null}
            <ResizablePanel className="p-4">
              {/* panels are separated by the handle, so gap does not apply — but the depth still has to advance */}
              <StackDepthContext.Provider value={childDepth}>
                {panel}
              </StackDepthContext.Provider>
            </ResizablePanel>
          </Fragment>
        ))}
      </ResizablePanelGroup>
    );
  }
  return (
    <div
      data-slot="stack"
      className={cn(
        "flex min-w-0",
        gapClasses[gap ?? depthGap],
        // A row whose children cannot shrink any further (Stat's min-w, a Card's min-content)
        // used to paint outside the page column. Scroll inside the stack instead of bursting.
        // CSS gives no way to scroll one axis and overflow the other, so this also clips a few
        // px of ring/shadow on a child stretched to the full row height. Accepted: menus and
        // tooltips are portaled out, and the alternative (padding the scroll box) would eat
        // into the gap scale above.
        direction === "horizontal" ? "flex-row overflow-x-auto" : "flex-col",
      )}
    >
      <StackDepthContext.Provider value={childDepth}>
        {children}
      </StackDepthContext.Provider>
    </div>
  );
}
