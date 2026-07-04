import { Link, useParams } from "@tanstack/react-router";
import { X } from "lucide-react";
import { shellRouteApi } from "@/components/AppShell/shellRouteApi";
import { useDeleteSnapshot } from "@/components/AppShell/useDeleteSnapshot";
import {
  SIDEBAR_ID,
  useSidebar,
} from "@/components/PageLayout/sidebarContext";
import { cn } from "@/lib/utils";
import { ViewList } from "./ViewList";

/**
 * 非モーダルの push 型 sidebar。開くと flex の兄弟として幅を持ち main を押し出すので、
 * 開いたまま main を操作できる。閉じているときは幅 0 + inert にして tab フォーカスが
 * 内部リンクに入らないようにする。
 *
 * 常駐 shell (AppShell) の直下にあり遷移で再 mount されない。一覧は shell layout の
 * loader から受け取り、開閉やスクロール位置は再構築されずに残る (自前の scroll 復元は
 * 持たない)。取得中/失敗は route の pending/error に委ねるので、ここでは常に items が揃う。
 */
export function AppSidebar() {
  const sidebar = useSidebar();
  const open = sidebar?.open ?? false;
  const items = shellRouteApi.useLoaderData();
  const params = useParams({ strict: false }) as { id?: string };
  const currentId = params.id ?? null;
  const del = useDeleteSnapshot();

  return (
    <aside
      id={SIDEBAR_ID}
      data-slot="app-sidebar"
      aria-label="ページ一覧"
      inert={!open}
      className={cn(
        "sticky top-0 h-svh shrink-0 self-start overflow-hidden border-border transition-[width] duration-200 ease-in-out motion-reduce:transition-none",
        open ? "w-64 border-r" : "w-0",
      )}
    >
      <div className="flex h-full w-64 flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <Link
            to="/"
            className="text-sm font-semibold tracking-tight text-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            syokan
          </Link>
          {/* ViewHeader が無い状態 (not-found / pending / error) でも閉じられるよう sidebar 内にも閉じる操作を置く */}
          {sidebar ? (
            <button
              type="button"
              aria-label="閉じる"
              onClick={sidebar.toggle}
              className="-mr-1 flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          <ViewList
            items={items}
            currentId={currentId}
            onDelete={(id) => del(id, { isCurrent: id === currentId })}
            renderLink={({ id, active, className, children }) => (
              <Link
                to="/snapshots/$id"
                params={{ id }}
                aria-current={active ? "page" : undefined}
                className={className}
              >
                {children}
              </Link>
            )}
          />
        </nav>
      </div>
    </aside>
  );
}
