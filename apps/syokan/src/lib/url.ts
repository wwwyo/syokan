import { z } from "zod";

/**
 * http(s) のみ許可する URL schema。
 * API / ファイル / LLM 由来の tree を描画するため、href に javascript:/data:/file:
 * 等の危険な protocol が混入すると XSS になりうる。protocol を明示的に絞る。
 */
export const httpUrl = z.url().refine(
  (value) => {
    try {
      const { protocol } = new URL(value);
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  },
  { message: "http(s) の URL のみ許可されます" },
);
