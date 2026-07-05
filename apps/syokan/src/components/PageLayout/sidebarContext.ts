import { createContext, useContext } from "react";

export type SidebarContextValue = {
  open: boolean;
  toggle: () => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

export const SidebarProvider = SidebarContext.Provider;

// The shared id that links the toggle (ViewHeader) and the aside (AppSidebar) via aria-controls.
export const SIDEBAR_ID = "app-sidebar";

// Returns null outside the provider (e.g. a standalone ViewHeader render). The consumer can
// null-check and render as a "header without a sidebar".
export function useSidebar(): SidebarContextValue | null {
  return useContext(SidebarContext);
}
