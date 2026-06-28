import { homedir } from "node:os";
import { join } from "node:path";

// 永続先は XDG config 配下 (~/.config/syokan) に集約する。snapshot data は
// ephemeral だが、templates と runtime も含め置き場所を 1 系統に揃えることで
// lazy-spawn した server と CLI がどの起動経路からでも同じ場所を指す。
function configHome(): string {
  return process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
}

function syokanHome(): string {
  return join(configHome(), "syokan");
}

export function dataDir(): string {
  return process.env.SYOKAN_DATA_DIR ?? join(syokanHome(), "data");
}

export function runtimeDir(): string {
  return process.env.SYOKAN_RUNTIME_DIR ?? syokanHome();
}

export function templatesDir(): string {
  return process.env.SYOKAN_TEMPLATES_DIR ?? join(syokanHome(), "templates");
}
