import { Home } from "./Home";
import { ViewPageContainer } from "./ViewPageContainer";

const VIEW_PATH = /^\/views\/([^/]+)\/?$/;

export function matchViewId(pathname: string): string | null {
  const match = VIEW_PATH.exec(pathname);
  if (!match?.[1]) return null;
  return decodeURIComponent(match[1]);
}

export function App() {
  const pathname =
    typeof window === "undefined" ? "/" : window.location.pathname;
  const viewId = matchViewId(pathname);
  if (viewId !== null) {
    return <ViewPageContainer id={viewId} />;
  }
  return <Home />;
}
