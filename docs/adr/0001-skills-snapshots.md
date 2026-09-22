# 只使用 Skills.sh 文本快照

题目限制在线技能数据源为 Skills.sh。官方 CLI 还会访问 GitHub 获取目录信息，但本插件不采用该路径。

搜索走 `/api/search`，详情页提供简介，下载走同站的 `/api/download`。新版 `/api/v1` 需要 OIDC，不能假设 DSH 用户具备凭据。

选择文本快照的代价是无法确认二进制附件是否完整，也不能安装未提供公共快照的域名来源。插件明确报告这些边界，不暗中改从其他域名拉取文件。

参考：
- [Skills CLI 搜索实现](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/src/find.ts)
- [Skills CLI 快照实现](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/src/blob.ts)
- [DSH 设置扩展点](https://github.com/deepseek-ai/deepseek-harness/blob/c36a83ff6bb95e3f82cf79f9be7c724270a8aa61/packages/client/ui-settings/src/client/contract/slots.ts)
