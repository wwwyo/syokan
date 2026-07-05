import type { ReactNode } from "react";
import { z } from "zod";

export const cardPropsSchema = z.object({}).strict();

// 空スキーマの z.infer は children と交差すると never に潰れるため children だけを型にする。
export type CardProps = {
  children?: ReactNode;
};

/**
 * children を囲む汎用カード。article 等のドメインに依存せず、
 * 中身は Heading / Text / Link / Stack 等の組み合わせで表現する。
 */
export function Card({ children }: CardProps) {
  return (
    <div
      data-slot="card"
      className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm transition-shadow hover:shadow"
    >
      {children}
    </div>
  );
}
