import { matchViewId } from "@/lib/route";
import { Home } from "./Home";
import { ViewPageContainer } from "./ViewPageContainer";

export function App() {
  const pathname =
    typeof window === "undefined" ? "/" : window.location.pathname;
  const viewId = matchViewId(pathname);
  if (viewId !== null) {
    return <ViewPageContainer id={viewId} />;
  }
  return <Home />;
}
