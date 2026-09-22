# 开发记录

## 流程

题目要求全程使用 AI 编程。本项目使用 Codex（GPT-6），包含并行的接口调查、实现和代码审查。

Matt Pocock Skills 安装自 `mattpocock/skills`，提交 `c55ee46073ed923f86ce59a5eb3b6d895095d1b7`。技能保存在本地 `.agents/skills/`，不重复提交第三方指令文件。

仓库建立后首先执行 `setup-matt-pocock-skills`：按题目选择 GitHub Issues，采用单 CONTEXT.md 和 docs/adr/，未安装 triage，因此未配置 triage 标签。随后执行 `ask-matt`，选择 `grill-with-docs → to-spec → to-tickets → implement`，实现阶段使用 `tdd` 和 `code-review`。

需求由原题给定。接口、数据源和安装目录通过阅读当前上游代码确认。测试边界选择插件服务接口和浏览器用户操作，常规实现选择由代理负责。

## 人工判断的边界

用户指定：按原题交付，创建 GitHub 仓库，代码和文档避免模板化 AI 表达。原题指定：Skills.sh 数据源、操作确认、目录限制、Issue/PR 流程和视频演示。具体模块划分、依赖和错误处理策略由实现代理选择，提交前仍可由候选人复核。
