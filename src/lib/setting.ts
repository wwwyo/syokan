import type { Setting, SettingPatch } from "@/schema";

// useFont と useTheme が同時 mount して各々取得すると同一 GET が二重に飛ぶ。in-flight の
// promise を共有して重複を 1 本に畳む (解決後に捨てるので、再訪時の取り直しは従来どおり走る)。
let inflight: Promise<Setting | null> | null = null;

// サーバー (正本) に永続化された設定を取得する。失敗 (storybook 等 API 不在含む) は
// null を返して呼び出し側の localStorage 既定に委ねる。
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

// 設定の部分更新をサーバーへ送る。localStorage が当 session の即時反映を担保するので、
// 送信失敗は握る (次回起動時の同期で回復する)。
export async function putSetting(patch: SettingPatch): Promise<void> {
  try {
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
  } catch {
    // 握る (上記コメントの理由)
  }
}
