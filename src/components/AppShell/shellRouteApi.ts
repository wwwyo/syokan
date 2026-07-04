import { getRouteApi } from "@tanstack/react-router";

// pathless layout route "_shell" (router.tsx) の loader が返す snapshot 一覧を読む。
// route オブジェクトを import せず id 参照するので、router.tsx との循環 import を避けられる。
export const shellRouteApi = getRouteApi("/_shell");
