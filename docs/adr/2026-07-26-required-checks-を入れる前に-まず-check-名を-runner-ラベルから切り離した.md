# required checks を入れる前に、まず check 名を runner ラベルから切り離した

- Status: Accepted
- Date: 2026-07-26

[#42](https://github.com/wwwyo/syokan/pull/42) を先に出してから ruleset を作った。`test (ubuntu-latest)` のように runner 名へ直結させると、**将来 runner を替えたとき ruleset 側の必須 check 名が存在しなくなり、自分で merge をロックする**。`test (linux)` / `test (macos)` の安定名にしてから ruleset を設定する順序にした
