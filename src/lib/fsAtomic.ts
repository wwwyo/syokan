import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

// tmp に書いてから rename して置換する。rename は同一 fs 内で atomic なので、
// 書き込み途中の中身を reader に見せない。
export async function writeJsonAtomic(
  path: string,
  data: unknown,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${crypto.randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await rename(tmp, path);
}
