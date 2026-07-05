// A declarative, minimal CLI router. No getopt; it just looks up the first arg (argv[0])
// as a "command name or its alias" and branches. Shorthands (e.g. `-v`) and flag forms
// (`--version`) are declared as aliases. Ctx (deps) / Res (return value) are generic, decided by the caller.
// Non-obvious point: a `-`-prefixed token that matches no known command is routed to
// onUnknownOption, not fallback (=file), so an unknown flag isn't mistakenly read as a filename.

export type Command<Ctx, Res> = {
  /** Canonical name (the command itself; also used in help) */
  name: string;
  /** Aliases. Shorthands and flag forms (e.g. `["--version", "-v"]`) */
  aliases?: readonly string[];
  /** One-line description for help (optional) */
  summary?: string;
  /** Usage string for help (optional; derived from name + aliases when unset) */
  usage?: string;
  /** Subcommand list for help (optional; kept structured to stay machine-readable) */
  subcommands?: readonly { usage: string; summary: string }[];
  /** Receives the args after the command token */
  run: (rest: readonly string[], ctx: Ctx) => Res;
};

export type RouterConfig<Ctx, Res> = {
  commands: readonly Command<Ctx, Res>[];
  /** When argv is empty (`syokan` run bare) */
  noArgs: (ctx: Ctx) => Res;
  /** First arg matching neither a reserved word nor a flag (positional). `first` is that arg itself */
  fallback: (first: string, rest: readonly string[], ctx: Ctx) => Res;
  /** A `-`-prefixed but unknown token */
  onUnknownOption: (token: string, ctx: Ctx) => Res;
};

export function createRouter<Ctx, Res>(
  config: RouterConfig<Ctx, Res>,
): (argv: readonly string[], ctx: Ctx) => Res {
  const table = new Map<string, Command<Ctx, Res>>();
  for (const command of config.commands) {
    for (const token of [command.name, ...(command.aliases ?? [])]) {
      if (table.has(token)) {
        throw new Error(`createRouter: duplicate command token "${token}"`);
      }
      table.set(token, command);
    }
  }

  return (argv, ctx) => {
    const first = argv[0];
    if (first === undefined) return config.noArgs(ctx);
    const command = table.get(first);
    if (command) return command.run(argv.slice(1), ctx);
    if (first.startsWith("-")) return config.onUnknownOption(first, ctx);
    return config.fallback(first, argv.slice(1), ctx);
  };
}
