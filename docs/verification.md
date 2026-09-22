# 验收记录

环境：2026-09-22，macOS arm64，Node.js 25.9.0，DSH 0.1.7-alpha.1。CI 使用 Node.js 22，覆盖 Ubuntu 和 macOS。

## 自动化测试

`npm run check`：类型检查、50 项测试、构建全部通过。运行记录见 [GitHub Actions](https://github.com/Zh0uHX/dsh-skills/actions)。

| 范围 | 验证内容 |
| --- | --- |
| Skills.sh | 真实公共接口格式、简介、关联文本文件、失败和重定向、大小限制、DSH frontmatter 兼容性 |
| 安装与更新 | 持久化、内容摘要、过期文件移除、本地修改提示、元数据提交失败回滚 |
| 删除与恢复 | 确认卸载、所有权检查、缺失目录的记录清理、其他技能保留 |
| 文件边界 | 穿越路径、大小写/Unicode 别名、符号链接、硬链接、被替换的根目录、并发互斥、记录容量 |
| DSH Host | 401/403 请求拦截、方法和内容类型、请求大小、目录解析 |
| DSH 原生发现器 | 安装后 list/get 可用，更新后简介和正文刷新，卸载后消失 |

发现器测试使用已发布的 `@deepseek-ai/dsh-skill`、`dsh-skill-filesystem` 和真实本地文件系统。测试关闭 watcher，使用与生产相同的 `fs/observed` 通知，避免把“文件存在”当作宿主发现成功。

## 实际联网与浏览器

使用独立 DSH_HOME，完成搜索 `find-skills`、安装、检查更新、取消更新、确认更新、取消卸载、确认卸载。浏览器未报告 JavaScript 异常，操作完成后已安装列表为空。公开 GitHub 安装命令已在新建 profile 中实际执行，未使用本地链接。

另行验证 `anthropics/skills/docx`：Skills.sh 返回 61 个文本文件，包含脚本、模板和 XSD。没有运行其中的脚本。演示中的实时上游快照没有变化，因此检查结果是“已是最新内容”；上游内容变化及更新失败由自动化测试覆盖。

演示为 4 分 18 秒、1440 × 1000 的 WebM 视频。

[演示与安装包](https://github.com/Zh0uHX/dsh-skills/releases/tag/v0.1.0)。演示使用程序驱动真实浏览器操作并录屏，字幕说明步骤；不是静态界面样片。模型调用不属于这次验收，也未填写 API Key。

## 重跑浏览器检查

在专用 DSH_HOME 中安装并启动插件，确保“已安装”为空。不要用日常技能目录运行这个脚本。

```sh
npx playwright install chromium
DSH_URL='http://127.0.0.1:3080/?token=启动时给出的值' npm run test:smoke
```

脚本访问真实 Skills.sh，安装并最终卸载 `find-skills`。已有 Chrome 时可设 `PW_CHANNEL=chrome`，免装 Chromium。URL 中的 token 只用于本机登录，不应提交到仓库。
