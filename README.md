# FIOS 技能套件（FIOS Skills）

> 🆓 **本仓库的技能以 [MIT 协议](./LICENSE) 开源**——可自由使用、修改、二次分发。
> ⚠️ **但技能需搭配 FIOS 使用：单独装上无法运行**，必须配合 **FIOS 旗舰版** Notion 模板。
> 🔒 **FIOS 模板本身不开源**（付费产品，不随本仓库提供）→ 获取 / 咨询微信：`uumenhaol`

把你的 **FIOS Notion 生活系统** 接上 AI——用大白话记录、拆解目标、跨库分析、写复盘、读状态全景。配合你已购买的 **FIOS 旗舰版**使用。

> 这套技能本身**不含任何人的隐私数据、库 ID、公式**。它通过一次「初始化」绑定到**你自己那份 FIOS 副本**，所有结构（含公式）都是在你本机、从你自己的 Notion 现读现生成的。

## 包含 7 个技能

| 技能 | 作用 |
|---|---|
| **notion-fios-init** | ★ 初始化：第一次使用前，把技能绑定到你自己的 FIOS（只读发现你的库 / 维度页） |
| notion-life-system | 底座：只读查询入口 + ntn CLI / schema / 路由表（其他技能复用它） |
| notion-life-capture | 随手记录：一句话入库（记一笔支出 / 任务 / 读书 / 美食…） |
| notion-life-cascade | 自上而下拆解：目标 → 规划 → 项目 → 任务 / 习惯 / 学习链路 |
| notion-life-insights | 跨库分析：时间 / 金钱 / 注意力花在哪、对比趋势、看监管看板 |
| notion-life-reflection | 复盘叙述：把日 / 周 / 月 rollup 数字写成中文复盘 |
| notion-fios-status | 状态全景：读 / 刷新 第二大脑 + 9 维度监管的状态档案 |

## 前置条件

1. 已购买并在自己的 Notion 里复制好 **FIOS 模板**。
2. 安装 **`ntn` CLI**，并用**你自己的 Notion integration token** 完成授权
   （https://www.notion.so/my-integrations 新建 internal integration → 拿 token → 配置 ntn → `ntn api v1/users/me` 能通）。
3. 把 FIOS 的「数据管理」hub 页（右上 `•••` → 连接 / Connections）分享给该 integration。
4. 本机有 `node`、`jq`、`python3`、`zsh`。

## 安装

把 `skills/` 下的 7 个目录放进你的技能目录（保持同级、不要拆散）：

- **Claude Code**：复制到 `~/.claude/skills/`
- **OpenAI Codex**：复制到 `~/.codex/skills/`

```bash
# 例（Claude Code）
cp -R skills/* ~/.claude/skills/
```

> 7 个技能必须装在**同一个 skills 目录**下——`notion-fios-init` 和其他技能靠相对位置互相找。

## 初始化（只做一次）

安装后，在 Claude Code / Codex 里说一句「**初始化 FIOS**」，或直接让它跑：

```bash
~/.claude/skills/notion-fios-init/scripts/fios_init.zsh "<你的「数据管理」hub页URL>"
```

它会只读地发现你的 53 个库 + 10 个维度页，在本机生成 `notion-life-system/references/` 下的三个配置文件。看到「✅ 初始化完成」即可。

换了 Notion / 重新复制了模板 → 再说一次「初始化 FIOS」重绑即可（可反复运行）。

## 用起来

初始化后，直接用自然语言，例如：

- 「记一笔 今天买菜花了 23」 → capture 入「支出事项」
- 「帮我把这季度目标拆成规划和项目」 → cascade
- 「这个月时间都花哪了」 → insights
- 「写今天的复盘」 → reflection
- 「读一下我的 FIOS 状态全景」 → fios-status

## 隐私与边界

- 技能包里**零**个人数据、零库 ID、零公式表达式、零关联架构。
- 初始化与日常使用**只读**你的 Notion 结构；写入仅在你明确要求记录 / 更新时发生。
- 你的结构（含公式）只在你**自己机器**上、从你**自己的 Notion** 生成，不回传、不外发。

## 协议（License）

- **技能代码**：[MIT](./LICENSE) 开源——随便用 / 改 / 二次分发，欢迎 PR。
- **FIOS 模板**：闭源付费产品，**不开源**、也不随本仓库提供。技能只是连接它的「胶水」，没有模板跑不起来。
- 想要 FIOS 旗舰版模板 → 微信 `uumenhaol`。

遇到问题看 `skills/notion-fios-init/SKILL.md` 的「失败排查」。
