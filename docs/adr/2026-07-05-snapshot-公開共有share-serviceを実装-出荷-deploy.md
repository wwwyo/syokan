# snapshot 公開共有（share service）を実装・出荷・deploy

- Status: Accepted
- Date: 2026-07-05

[#23](https://github.com/wwwyo/syokan/pull/23) merged。monorepo 再編（`apps/syokan` + `apps/share`）、Cloudflare Workers + KV、`syokan.dev` apex に landing/viewer/API を同居。認証は匿名 delete token を却下し GitHub account を identity に採用
