---
name: notion-fios-init
description: FIOS 技能套件的「初始化」技能。买家第一次使用 FIOS Notion 技能（notion-life-capture / cascade / insights / reflection / fios-status / notion-life-system）之前，用本技能把这套技能绑定到买家自己那份 FIOS Notion 副本上。触发词：初始化 FIOS、FIOS init、配置 FIOS 技能、连接我的 Notion、绑定 FIOS、第一次用 FIOS 技能、重新初始化、换了 Notion 重新绑定、FIOS 技能没数据/报错说没初始化。也在其他 FIOS 技能因为缺 references（notion-intake-rules.json / notion-system-schema.json / fios-dimension-pages.json）而无法工作时使用。
---

# FIOS 初始化（FIOS Init）

把 FIOS 技能套件绑定到**买家自己那份 FIOS Notion 副本**。FIOS 模板每个人复制出来的库 / 页面 ID 都不同，技能本身**不含**任何人的 ID——靠本技能在初始化时按买家自己的 FIOS 现场发现并生成本地配置。

> 全程**只读**买家的 Notion 结构（导出 hub 页、读 `v1/data_sources/<id>` 与 `v1/databases/<id>`）。不创建、不修改、不删除任何 Notion 数据。

## 何时使用

- 买家**第一次**用 FIOS 技能前。
- 买家换了 Notion 账号 / 重新复制了模板 → 重新绑定。
- 任何 FIOS 技能报「找不到 notion-intake-rules.json / schema / fios-dimension-pages.json」「未初始化」。

## 前置条件（先和买家确认齐全）

1. **已拥有 FIOS 模板**：买家已购买并把 FIOS 模板复制进了自己的 Notion（本技能不发模板，只做绑定）。
2. **装好 `ntn` CLI** 并完成 Notion 授权：
   - 买家在 https://www.notion.so/my-integrations 新建一个 internal integration，拿到 token。
   - 用买家自己的 token 配置 `ntn`（按 ntn 文档：通常是 `ntn` 首次运行引导，或设置其配置文件 / `NOTION_TOKEN`）。
   - 验证：`ntn api v1/users/me` 能返回买家自己的 bot 用户即可。
3. **把 FIOS 分享给 integration**：在 Notion 里打开 FIOS 顶层页（**「数据管理」hub 页**，里面列齐了全部数据库），右上角 `•••` → 「连接」/「Connections」→ 选刚建的 integration。分享顶层即可让其下所有库可读。
4. 本机有 `node`、`jq`、`python3`。

> ⚠️ 只把 **FIOS 这一份**分享给 integration 就够了。本技能以 hub 页为锚、只认 hub 引用的库，买家的其他模板不会被牵连。

## 初始化流程

### 第 1 步：拿到 hub 页 URL
向买家要 **FIOS「数据管理」hub 页**的 URL（就是模板里那个用 callout 列出全部数据库的总览页）。
浏览器地址栏复制即可，形如 `https://www.notion.so/...32位十六进制...`。

### 第 2 步：跑初始化脚本
本技能 `scripts/` 在 `<skills>/notion-fios-init/scripts/`，底座技能在同级 `<skills>/notion-life-system/`。

```bash
<skills>/notion-fios-init/scripts/fios_init.zsh "<hub页URL>"
```

脚本依次完成（每步都有日志）：
1. 导出 hub 页 → `~/.fios/数据管理.page.md`（含全部 `<database>` 引用）。
2. 只读拉取每个库结构 → `~/.fios/notion-system-structure/`。
3. 重建 `notion-life-system/references/notion-system-schema.json`。
4. 重建 `notion-life-system/references/notion-intake-rules.json`（入库路由规则）。
5. 结构自检 + 发现 10 个维度页 → `notion-life-system/references/fios-dimension-pages.json`。

> `<skills>` = 买家装技能的目录。Claude Code 通常是 `~/.claude/skills`，Codex 是 `~/.codex/skills`。脚本用 `${0:A:h}` 自动定位自身，一般无需手填路径。
> 默认连直连 Notion；若买家网络需代理，`export NOTION_CLI_PROXY=http://host:port` 后再跑。
> 数据目录默认 `~/.fios`，可 `export FIOS_DATA_DIR=...` 改。

### 第 3 步：核对自检结果
脚本末尾会打印：
- **结构自检**：`模板期望 53 个库，你的 FIOS 发现 N 个`。
  - 全部命中 → ✓。
  - 提示「缺少 X」→ 多半是该库没分享给 integration，或买家删过这个库。让买家在 Notion 里把缺的库（或 hub 顶层）分享给 integration 后**重跑**。
  - 提示某库「字段差异较大」→ 可能买家改过该库结构，或 hub 误引了同名的别的库。和买家确认，必要时修正 hub 页再重跑。
- **维度页发现**：`10/10`。少于 10 → 对应监管库没分享 / 没有那一行；fios-status 用到该维度时会提示补 `page_id`。

### 第 4 步：冒烟测试
让买家随口说一句记录（如「记一笔 今天买菜花了 20」），或直接只读查询验证绑定：

```bash
<skills>/notion-life-system/scripts/notion_query.zsh 支出事项 3
```

能返回买家自己的数据即绑定成功。然后告诉买家：现在可以正常用 capture / cascade / insights / reflection / fios-status 了。

## 生成物（都在底座技能的 references/ 下，买家本地，不外传）
| 文件 | 作用 |
|---|---|
| `notion-system-schema.json` | 买家 FIOS 的完整结构（含买家自己的库 ID、字段、公式——本就是买家自己的模板） |
| `notion-intake-rules.json` | 入库路由规则（capture / cascade 等据此填字段） |
| `fios-dimension-pages.json` | 10 个维度页的 page_id（fios-status 据此读写状态档案） |

## 失败排查

- **`ntn api v1/users/me` 不通** → token 没配好 / 没授权。先把 ntn + token 弄通再来。
- **hub 页导出 0 个 `<database>`** → 给的不是「数据管理」hub 页，或该页没分享给 integration。
- **写入/查询偶发返回空** → ntn 间歇性失败，原样重跑一次通常即好（脚本内已带重试）。
- **缺库 / 字段对不上** → 见第 3 步；本质都是「分享范围」或「买家改过结构」，不是技能问题。
- **网络/TLS 失败** → 设 `NOTION_CLI_PROXY` 走代理后重试。

## 通用规则

- 只读绑定，绝不改买家 Notion 数据。
- 不臆造 ID：维度页 / 库 ID 一律靠现场发现，发现不到就如实报告、让买家补。
- 重跑安全：本技能可反复运行（幂等），换 Notion 后重绑即可。
