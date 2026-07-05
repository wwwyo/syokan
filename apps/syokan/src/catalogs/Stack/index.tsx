import { Children, Fragment, isValidElement, type ReactNode } from "react";
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
  })
  .strict();

export type StackProps = z.infer<typeof stackPropsSchema> & {
  children?: ReactNode;
};

/**
 * General-purpose layout catalog that arranges children vertically (default) or horizontally.
 * Since a snapshot has a single root, this is meant to be used as the root that bundles multiple elements.
 * The default is a plain flex stack. With resizable=true it becomes a ResizablePanelGroup whose
 * boundaries can be dragged, and the handle appears only on hover.
 */
export function Stack({
  direction = "vertical",
  resizable = false,
  children,
}: StackProps) {
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
            <ResizablePanel className="p-4">{panel}</ResizablePanel>
          </Fragment>
        ))}
      </ResizablePanelGroup>
    );
  }
  return (
    <div
      data-slot="stack"
      className={cn(
        "flex gap-8",
        direction === "horizontal" ? "flex-row" : "flex-col",
      )}
    >
      {children}
    </div>
  );
}
