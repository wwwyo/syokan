import { z } from "zod";

/**
 * A URL schema that allows only http(s).
 * Because trees from the API / files / LLMs are rendered, a dangerous protocol like
 * javascript:/data:/file: slipping into href could become XSS. Restrict the protocol explicitly.
 */
export const httpUrl = z
  .url()
  .refine(
    (value) => {
      try {
        const { protocol } = new URL(value);
        return protocol === "http:" || protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "Only http(s) URLs are allowed" },
  )
  // the protocol restriction is a .refine, so it cannot survive into `format: "uri"`;
  // state it here or a producer only learns of it from a 400
  .describe(
    "An absolute http(s) URL. Other schemes (javascript:, data:, file:, mailto:) are rejected at ingest.",
  );
