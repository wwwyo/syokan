import { Menu } from "lucide-react";
import {
  SIDEBAR_ID,
  useSidebar,
} from "@/components/PageLayout/sidebarContext";

// AppSidebar を開閉するハンバーガー。provider 外 (単体描画) では何も出さない。
export function SidebarToggle() {
  const sidebar = useSidebar();
  if (!sidebar) return null;
  return (
    <button
      type="button"
      data-slot="view-sidebar-toggle"
      aria-label="ページ一覧"
      aria-controls={SIDEBAR_ID}
      aria-expanded={sidebar.open}
      onClick={sidebar.toggle}
      className="-ml-1 flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Menu className="size-4" />
    </button>
  );
}
