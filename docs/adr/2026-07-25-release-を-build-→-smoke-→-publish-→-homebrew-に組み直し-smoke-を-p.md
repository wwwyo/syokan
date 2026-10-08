# release を `build → smoke → publish → homebrew` に組み直し、smoke を publish の前に置く

- Status: Accepted
- Date: 2026-07-25

smoke は「起動する」だけでは配布経路の検証にならないので、`post → view 取得 → TreeDoc 召喚 → atomic save の SSE change 受信 → 再取得 → stop` まで通す内容にした。publish 前に置いたのは**壊れたアセットを公開しないため**。Homebrew は tap 側にロジックを持たせず、release 側で formula を生成して push する一方向構成にした（双方向にすると運用が増える）。`install.sh` は `curl|sh` の利便性だけに寄せず checksum 検証と version 固定を入れ、対応を macOS / Linux に限定して Windows 非対応を明示した（「たぶん動く」を残す方が誤解が大きい）
