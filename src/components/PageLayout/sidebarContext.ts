import { createContext, useContext } from "react";

export type SidebarContextValue = {
  open: boolean;
  toggle: () => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

export const SidebarProvider = SidebarContext.Provider;

// provider 外 (ViewHeader 単体描画など) では null を返す。consumer 側で
// null チェックして「sidebar 無しの header」として描画できるようにする。
export function useSidebar(): SidebarContextValue | null {
  return useContext(SidebarContext);
}
