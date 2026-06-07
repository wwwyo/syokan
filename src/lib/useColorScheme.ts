import { useEffect, useState } from "react";

/**
 * app の dark mode は class ベース (`@custom-variant dark (&:is(.dark *))`、`<html>.dark`)。
 * @pierre/diffs は shadow DOM 内で独自テーマを持ち app の CSS 変数が届かないため、
 * documentElement の `.dark` を監視して `themeType` に渡す値を返す。
 * pierre 既定の `themeType:'system'` は OS preference 追従で app/storybook の class トグルと
 * 噛み合わないため使わない。SSR / 初回は `light` で開始し、mount 後に同期する。
 */
export function useColorScheme(): "dark" | "light" {
  const [scheme, setScheme] = useState<"dark" | "light">("light");
  useEffect(() => {
    const root = document.documentElement;
    const sync = () =>
      setScheme(root.classList.contains("dark") ? "dark" : "light");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return scheme;
}
