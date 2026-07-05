import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

// Write to a tmp file, then rename to replace. rename is atomic within the same fs,
// so readers never see a mid-write state.
export async function writeJsonAtomic(
  path: string,
  data: unknown,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${crypto.randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await rename(tmp, path);
}
