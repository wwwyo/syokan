# `brew tap` の失敗は global `core.hookspath` による hook 強制が原因だった

- Status: Accepted
- Date: 2026-07-26

brew は subprocess の PATH をサニタイズするので、brew 経由で入れた `git-lfs` でも global hook からは見えない。`.gitconfig` の `hooksPath` を外して解決した（LFS を使う repo では個別に `git lfs install` すればよい）。**症状から最も近い依存に飛びつくと、原因が設定側にある場合に外す**
