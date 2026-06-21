import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { router } from "./router";

declare global {
  interface Window {
    __roRafPatched?: boolean;
  }
}

// RO callback を rAF に逃がして同一フレーム内の再入を切る。これで無害だが
// Bun dev の error overlay を毎回出していた "ResizeObserver loop ..." 警告
// 自体が発生しなくなる (1 フレーム遅延は体感なし)。HMR で二重 wrap しないよう印を付ける。
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

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root container #root not found");
}

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
