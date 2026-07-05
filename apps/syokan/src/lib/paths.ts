import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

// The XDG base directory spec states "these variables must be absolute paths; relative
// values are invalid and ignored". Accepting an empty or relative value risks writing
// under CWD, so adopt only absolute paths and otherwise fall back to the spec's default.
function absEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && isAbsolute(v) ? v : undefined;
}

// Persistence locations are split by lifecycle per the XDG base directory spec.
// Consolidating everything into config would mix snapshots / logs into the
// dotfiles-tracked tree (~/.config) and risk accidentally committing them to git.
// Separate keep (config/data) from machine-local (state). Location overrides are
// consolidated on XDG_*_HOME alone rather than adding bespoke SYOKAN_* envs (dev is
// isolated the same way).
function configHome(): string {
  return absEnv("XDG_CONFIG_HOME") ?? join(homedir(), ".config");
}

function dataHome(): string {
  return absEnv("XDG_DATA_HOME") ?? join(homedir(), ".local", "share");
}

function stateHome(): string {
  return absEnv("XDG_STATE_HOME") ?? join(homedir(), ".local", "state");
}

// Snapshots go in state, not cache. Cache's contract is "a third party may purge
// without notice", but syokan does not regenerate snapshots automatically (the
// producer must re-post) and they should survive restarts. This "persist but no
// backup needed" is state's domain.
export function dataDir(): string {
  return join(stateHome(), "syokan");
}

// pid/port and logs are also machine-local state. They live in the same state dir as snapshots.
export function runtimeDir(): string {
  return join(stateHome(), "syokan");
}

// Templates are not settings but "keep" user data, so they go in data home.
export function templatesDir(): string {
  return join(dataHome(), "syokan", "templates");
}

// The templates location under the old layout (all categories consolidated in config).
// Used only for the one-time migration to data home, to keep upgrades from losing keep data.
export function legacyTemplatesDir(): string {
  return join(configHome(), "syokan", "templates");
}

// Settings are a singleton, so a single file rather than a dir. Placed in config home
// (only this one file remains under ~/.config/syokan and can be safely versioned in dotfiles).
export function settingFile(): string {
  return join(configHome(), "syokan", "settings.json");
}

// The share API token is a machine-local secret. Kept in state rather than mixed into
// the dotfiles-tracked config (saving it with 0600 is the writer's responsibility).
export function authFile(): string {
  return join(stateHome(), "syokan", "auth.json");
}
