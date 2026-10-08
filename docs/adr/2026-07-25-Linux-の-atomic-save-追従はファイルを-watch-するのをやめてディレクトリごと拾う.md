# Linux の atomic save 追従は「ファイルを watch する」のをやめてディレクトリごと拾う

- Status: Accepted
- Date: 2026-07-25

TreeDoc の live 追従が Linux だけ効かない件で、エディタの atomic save（tmp → rename）に file watch が追従できないことを実測で確定した。素直な修正は「親ディレクトリを watch して basename でフィルタ」だが、これも取りこぼす — Linux の dir watch は burst を間引くことがあり、**temp ファイル名のイベントだけが残るケースがある**ため、basename でフィルタすると本命を落とす。そこで **debounce 前提で「ディレクトリ内の任意イベント」を拾う**設計にした。誤検知（無関係ファイルでの再読み込み）が増えるが、**見逃しの方が高くつく**というトレードオフを取った。この手の platform 差は推測では出てこないので、`cross-platform-ci` で ubuntu / macos 両方に `typecheck + test` を回す構成にし、実測知見は `AGENTS.md` へ残した
