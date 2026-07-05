import type { Setting, SettingPatch } from "@/schema";

// If useFont and useTheme mount at the same time and each fetch, the same GET fires
// twice. Share the in-flight promise to collapse the duplicate into one (it is discarded
// after resolving, so re-fetching on revisit still runs as before).
let inflight: Promise<Setting | null> | null = null;

// Fetch the settings persisted on the server (source of truth). On failure (including
// no API, e.g. storybook), return null and defer to the caller's localStorage default.
export function fetchSetting(): Promise<Setting | null> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) return null;
      return (await res.json()) as Setting;
    } catch {
      return null;
    }
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

// Send a partial settings update to the server. localStorage guarantees the immediate
// effect for this session, so swallow send failures (recovered by the sync on next startup).
export async function putSetting(patch: SettingPatch): Promise<void> {
  try {
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
  } catch {
    // swallow (per the comment above)
  }
}
