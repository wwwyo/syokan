import { z } from "zod";

/**
 * A URL schema that allows only http(s).
 * Because trees from the API / files / LLMs are rendered, a dangerous protocol like
 * javascript:/data:/file: slipping into href could become XSS. Restrict the protocol explicitly.
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
