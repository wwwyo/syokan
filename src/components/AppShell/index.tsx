import { Outlet } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/PageLayout/sidebarContext";
import { SnapshotListProvider } from "./snapshotList";

// client 遷移中はメモリ (常駐 shell) で開閉を保つ。hard reload をまたぐぶんだけ
// localStorage に逃がす (storage 無効環境では throw しうるので握る)。
const SIDEBAR_STORAGE_KEY = "syokan:sidebar-open";

// 未設定 (初回訪問) は開いた状態を既定にする。明示的に閉じた選択だけ "0" として記憶する。
function readPersistedOpen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

/**
 * client routing 全体の常駐 shell。sidebar と本文カラムを 1 度だけ mount し、route 遷移
 * では <Outlet /> の中身だけ差し替える。これで sidebar の開閉・スクロール・取得済み一覧が
 * 遷移をまたいでメモリに残る。
 *
 * 本文は document(window) スクロールに委ね、sidebar は sticky で viewport に固定する。
 * 本文の読書位置復元は router の scrollRestoration が担う (自前の補助コードは持たない)。
 */
export function AppShell() {
  const [open, setOpen] = useState(readPersistedOpen);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, open ? "1" : "0");
    } catch {
      // storage 不可環境では永続化を諦める (機能本体には影響しない)
    }
  }, [open]);

  const sidebar = useMemo(
    () => ({ open, toggle: () => setOpen((v) => !v) }),
    [open],
  );

  return (
    <SidebarProvider value={sidebar}>
      <SnapshotListProvider>
        <div
          data-slot="app-shell"
          className="flex min-h-svh w-full bg-background text-foreground"
        >
          <AppSidebar />
          <div data-slot="page-column" className="flex min-w-0 flex-1 flex-col">
            <Outlet />
          </div>
        </div>
      </SnapshotListProvider>
    </SidebarProvider>
  );
}
