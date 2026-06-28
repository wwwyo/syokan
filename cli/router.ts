// 宣言的な極小 CLI ルータ。getopt は使わず、第一引数 (argv[0]) を「コマンド名 or
// その別名」で引いて分岐するだけ。短縮形 (`-v` 等) やフラグ形 (`--version`) は alias
// として宣言する。Ctx (依存) / Res (戻り値) は呼び出し側で決める汎用。
//
// 評価順:
//   1. argv 空            → noArgs
//   2. 既知トークン一致    → その command.run(残りの引数)
//   3. 未知の `-` 始まり   → onUnknownOption (flag をファイル扱いしない)
//   4. それ以外           → fallback (positional。例: ファイルパス)

export type Command<Ctx, Res> = {
  /** 正準名 (コマンド本体・help 表示用) */
  name: string;
  /** 別名。短縮形やフラグ形 (例: `["--version", "-v"]`) */
  aliases?: readonly string[];
  /** help 用の一行説明 (任意) */
  summary?: string;
  /** help 用の usage 文字列 (任意。未指定なら name + aliases から導出する) */
  usage?: string;
  /** help 用の補足行 (任意。subcommand の列挙など) */
  details?: readonly string[];
  /** command トークンより後ろの引数を受け取る */
  run: (rest: readonly string[], ctx: Ctx) => Res;
};

export type RouterConfig<Ctx, Res> = {
  commands: readonly Command<Ctx, Res>[];
  /** argv が空 (`syokan` を裸で実行) のとき */
  noArgs: (ctx: Ctx) => Res;
  /** 予約語にも flag にも一致しない第一引数 (positional)。first はその引数自身 */
  fallback: (first: string, rest: readonly string[], ctx: Ctx) => Res;
  /** `-` 始まりだが未知のトークン */
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
