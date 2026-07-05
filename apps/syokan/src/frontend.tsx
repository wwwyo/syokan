import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { lang } from "@/lib/i18n";
import { router } from "./router";

declare global {
  interface Window {
    __roRafPatched?: boolean;
  }
}

// Defer the RO callback to rAF to break re-entry within the same frame. This stops the harmless
// but always-fired "ResizeObserver loop ..." warning that popped Bun dev's error overlay every
// time (the one-frame delay is imperceptible). Mark it so HMR doesn't double-wrap.
if (typeof window !== "undefined" && window.ResizeObserver && !window.__roRafPatched) {
  window.__roRafPatched = true;
  const NativeResizeObserver = window.ResizeObserver;
  window.ResizeObserver = class extends NativeResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      super((entries, observer) => {
        window.requestAnimationFrame(() => callback(entries, observer));
      });
    }
  };
}

// align the html's static lang with the display language resolved from the browser language
document.documentElement.lang = lang;

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root container #root not found");
}

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
