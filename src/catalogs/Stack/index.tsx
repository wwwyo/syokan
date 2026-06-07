import { Children, Fragment, isValidElement, type ReactNode } from "react";
import { z } from "zod";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { cn } from "@/lib/utils";

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
 * 子要素を縦 (既定) または横に並べる汎用レイアウト catalog。
 * snapshot は single root のため、複数要素を束ねる root として使うことを想定する。
 * 既定は素の flex stack。resizable=true で境界をドラッグできる ResizablePanelGroup になり、
 * ハンドルは hover 時のみ表示される。
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
        // 縦分割は panel group に高さが無いと潰れる。横は中身追従で足りるため縦のみ最小高さを与える。
        className={cn(direction === "vertical" && "min-h-[16rem]")}
      >
        {panels.map((panel, index) => (
          <Fragment key={isValidElement(panel) ? (panel.key ?? index) : index}>
            {/* 線 (bg-border) は常時表示。グリップは境界付近を hover した時だけ出る (ui/resizable.tsx) */}
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
