import { z } from "zod";

/**
 * An absolute local path (POSIX `/…` or Windows `X:\…`), used by every catalog node
 * whose prop the server turns into a filesystem read (Probe checks) so the
 * "server only reads absolute local paths" contract lives in exactly one place. A regex
 * (not `.refine`) so the constraint survives into the JSON Schema manifest.
 */
export const absoluteLocalPath = z
  .string()
  .regex(/^(\/|[A-Za-z]:[\\/])/, "must be an absolute local path");
