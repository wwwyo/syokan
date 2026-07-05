import { useEffect, useState } from "react";

/**
 * The app's dark mode is class-based (`@custom-variant dark (&:is(.dark *))`, `<html>.dark`).
 * @pierre/diffs has its own theme inside a shadow DOM where the app's CSS variables
 * don't reach, so watch documentElement's `.dark` and return the value to pass to `themeType`.
 * pierre's default `themeType:'system'` follows the OS preference and doesn't mesh with the
 * app/storybook class toggle, so it isn't used. Start at `light` for SSR / first render and sync after mount.
 */
export function useColorScheme(): "dark" | "light" {
  // Read the actual .dark on the first client render to prevent a light→dark flash.
  // Fall back to "light" where server / document is absent (SSR-safe).
  const [scheme, setScheme] = useState<"dark" | "light">(() =>
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
      ? "dark"
      : "light",
  );
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
