---
name: notion-fios-status
description: 当用户想读取或刷新 FIOS「状态档案」时使用——这是 10 份维度行（dimension row）的 markdown 正文，描述贯穿 FIOS Notion 生活管理系统的"用户是谁、当前状态、历史、风险"。包含顶层 第二大脑（相当于 CLAUDE.md）和 9 个 监管 维度页面。触发词包括 读 FIOS 状态, FIOS 全景, 我现在的状态, 读 X 监管状态, 更新 FIOS 状态, 刷新状态, refresh 状态, 同步状态, 按当前数据重写状态。注意区分：读"我的状态/全景/某维度态势"用本技能；查看/查询某个库的业务记录（如目标、任务列表）→ notion-life-system 只读查询。其他 FIOS 技能（cascade / reflection / insights）在开始自己的工作流前应先调用本技能以获取用户上下文。
---

# Notion FIOS 状态（FIOS Status）

## 概述

FIOS 的"状态层" —— 10 个 markdown body 文件，分布在 dimension row 的 page body 里：

- **第二大脑**（顶层 CLAUDE.md）：用户画像 / 能力栈 / 历史轨迹 / 4 大原则 / 六层架构 / 9 维度导航 / 长期红线
- **9 个监管**（每维度状态）：当前态势 / 历史轨迹 / 当前活跃主线 / 用户偏好 / 当前风险 / AI 协作惯例 / 历史更新

任何 AI 助手开始 cascade / reflection / insights 工作流之前，**先调用本 skill 读相关状态文件**，再进入业务流程。

**REQUIRED BACKGROUND（必备前置）：** notion-life-system —— 提供 `scripts/notion_page_io.zsh`（稳健的 get / replace）和 `scripts/notion_query.zsh`。

## 何时使用

**读取（read）触发**：
- 读 FIOS 状态 / FIOS 全景 / 我现在的状态
- 读 时间监管 状态 / 读知识监管 / 等
- 任何其他 skill 启动前的上下文加载

**刷新（refresh）触发**：
- 更新 FIOS 状态 / 刷新状态 / refresh 状态 / 同步状态 / 按当前数据重写
- 月度自动 refresh（建议月复盘后）
- 用户明确说某个维度数据"过期"

**不要用于**：
- 写入业务数据（任务 / 目标 / 项目 / 笔记）—— 那是 cascade / capture
- 写复盘叙述 —— 那是 reflection
- 跨库分析 —— 那是 insights

## 维度行 Page ID 映射表

> ⚠️ 这 10 个页面的 page_id **因人而异**（每个人复制出来的 FIOS 副本 ID 都不同），所以**不在本文件硬编码**。
> 由 `notion-fios-init` 在初始化时按你自己的 FIOS 发现并写入：
> **`~/.claude/skills/notion-life-system/references/fios-dimension-pages.json`**
> （Codex 用户为 `~/.codex/skills/...`）。
> 运行时从该 JSON 按 `dimension` 键取 `page_id`；文件不存在或缺维度 → 提示用户先跑初始化。

| 维度 | dimension 键 | page_id 来源 |
|---|---|---|
| 第二大脑 | `dabrain` | fios-dimension-pages.json |
| 时间监管 | `time` | fios-dimension-pages.json |
| 知识监管 | `knowledge` | fios-dimension-pages.json |
| 人际监管 (社交监管) | `social` | fios-dimension-pages.json |
| 习惯监管 | `habit` | fios-dimension-pages.json |
| 财务监管 | `finance` | fios-dimension-pages.json |
| 旅游监管 | `travel` | fios-dimension-pages.json |
| 家庭监管 | `family` | fios-dimension-pages.json |
| 影视监管 | `media` | fios-dimension-pages.json |
| 复盘监管 | `review` | fios-dimension-pages.json |

## 文件结构约定（7 个章节）

每个状态文件必须有以下 7 个二级标题，顺序固定：

1. `## 当前态势` （自动 —— refresh 重写）
2. `## 历史轨迹` （自动 —— refresh 增量追加新阶段，不重写全部）
3. `## 当前活跃主线` （自动 —— refresh 重写）
4. `## 用户偏好与原则` （手填段 —— **refresh 保留原文**）
5. `## 当前风险` （自动 —— refresh 重写）
6. `## AI 协作惯例` （混合 —— refresh 重写但参考手填惯例）
7. `## 历史更新` （自动 —— refresh 在顶部追加新行）

**第二大脑独有的额外章节**：
- `## 用户画像` / `## 核心能力栈` / `## FIOS 系统宪法` / `## FIOS 系统六层架构` / `## 9 维度状态导航` —— 半静态，refresh 只在重大变化时改
- `## 长期红线` （手填段 —— **refresh 保留原文**）

## 核心操作

### 读取（READ）

```
notion_fios_status read <dimension>
```

`<dimension>` 取值：`dabrain` / `time` / `knowledge` / `social` / `habit` / `finance` / `travel` / `family` / `media` / `review` / `all`

步骤：
1. 从 page id map 查 page_id
2. `scripts/notion_page_io.zsh get <page_id>` 拿 markdown（包含 frontmatter）
3. 用 awk 剥离 frontmatter（YAML 头）
4. 输出到对话上下文

如果 `<dimension>=all`，依次读 第二大脑 + 9 监管，每个文件之间用 `---` 分隔。

### 刷新（REFRESH）

```
notion_fios_status refresh <dimension>
```

步骤：

1. **拿当前正文**: `scripts/notion_page_io.zsh get <page_id> /tmp/fios-current-<dim>.md` → 稳健，带重试。
2. **剥离 frontmatter**: `awk '/^---$/{c++;next} c==1{next} {print}' /tmp/fios-current-<dim>.md > /tmp/fios-body-<dim>.md`
3. **提取保留章节**（手填段）：
   - `## 用户偏好与原则` 全文（到下一个 `## ` 之前）
   - 第二大脑 额外保留：`## 长期红线` 全文
4. **查底层 db** 拿新数据（见 "各维度数据源" 表）
5. **基于新数据重写自动章节**，用用户的口吻（见 "口吻规则"）。保留段不变。
6. **历史更新** 章节: 在最顶部追加 `- YYYY-MM-DD: refresh (AI, <changes>)`，保留所有旧条目。
7. **拼装**: 按 7 章节顺序拼接（自动段新版 + 手填段原文）
8. **写回**: `scripts/notion_page_io.zsh replace <page_id> /tmp/fios-new-<dim>.md`
9. **汇报**: 哪些章节变化、字节差、保留的手填段未动

**硬性规则**: 第 3 步如果失败（找不到手填段标题），**中止 refresh，报错退出**。绝不在丢失手填段的情况下写回 —— 这会让用户的长期偏好丢失。

### 刷新全部（REFRESH-ALL）

```
notion_fios_status refresh-all
```

按顺序对全部 10 个维度跑 refresh，间隔 1s 防限流。失败的维度记录但不中止整批。

## 各维度数据源

每个维度 refresh 时拉哪些底层 db：

| 维度 | 底层 db | 关键指标 |
|---|---|---|
| 时间监管 | 目标设定 / 项目执行 / 任务执行 | 当前活跃目标、近 30 天完成率 |
| 知识监管 | 知识类型 / 兴趣学习 / 书籍阅读 / 学习笔记 | 活跃课题、读完书、近期笔记数 |
| 人际监管 | 关系分类 / 社交信息 | 最近联系日期分布、活跃关系 |
| 习惯监管 | 习惯分类 / 日常打卡 / 次数打卡 | 当前活跃习惯、完成率 |
| 财务监管 | 收支账户 / 收入事项 / 支出事项 | 账户余额、近月收支 |
| 旅游监管 | 旅游地点 / 旅游计划 | 已覆盖省份、活跃计划 |
| 家庭监管 | 家人亲人 | 最后联系日期、生日 |
| 影视监管 | 影视分类 / 电影视频 | 近期观影数、评分分布 |
| 复盘监管 | 每日复盘 / 每周复盘 / 每月复盘 | 归档率、断档情况 |
| 第二大脑 | 全部 9 监管 dimension row 当前 properties | 总览数字、活跃目标主题 |

## 口吻规则（refresh 时遵循）

- **第一人称视角不可用**：状态文件是 AI 写给 AI 读的"用户档案"，用第三人称（"用户已经..." / "他/她当前..."）
- **解读，不复述数字**：数字在 properties / rollup 已经有了；正文给"这个数字意味着什么"
- **紧凑工程化**：避免 emoji 堆砌、装饰性 callout、过度 markdown
- **引用 page_id**：提到具体目标 / 项目时给 page_id，方便跳转
- **诚实标记不确定**：推断的内容用"推断 / 可能 / 待用户确认"；不知道的留 placeholder

## 章节解析配方

提取保留段（用户偏好与原则）的 awk 模板：

```bash
awk '
  /^## 用户偏好与原则/ { capture=1; print; next }
  /^## / && capture { capture=0 }
  capture { print }
' /tmp/fios-body-<dim>.md > /tmp/fios-preserved-<dim>.md
```

提取第二大脑额外的"长期红线"段同理，把标题改成 `## 长期红线`。

## 与其他 FIOS 技能的协作

推荐惯例：其他 skill 启动前调用本 skill 加载上下文。

| 触发场景 | 应先读 |
|---|---|
| cascade L1 目标设定 | 第二大脑 + 时间监管 |
| cascade L2-L4 规划/项目/任务 | 时间监管 |
| cascade 学习链路 | 知识监管 |
| cascade 创作链路 | 第二大脑 |
| cascade 习惯设置 | 习惯监管 |
| reflection 每日 | 复盘监管 + 时间监管（轻量）|
| reflection 每周/每月 | 复盘监管 + 全部相关维度 |
| insights 单维度 | 第二大脑 + 该维度监管 |
| insights 跨维度 | 第二大脑 + 涉及的 N 个维度 |

实际由 AI 在调用 cascade 之前自行 read，本 skill 不强制其他 skill 调用。

## 通用规则

- **Read 永不改 Notion**：只读 + 输出到对话
- **Refresh 必须保留手填段**：丢失则中止
- **Refresh 必须备份**（`notion_page_io.zsh replace` 自带备份，路径在 `~/.fios/notion-page-backups/`，可用环境变量 `NOTION_PAGE_BACKUP_DIR` 覆盖）
- **历史更新追加，不替换**：保留 changelog
- **不擅自扩 7 章节结构**：用户审核后才加 / 减章节
- **第二大脑额外章节半静态**：refresh 不动 `## 用户画像` / `## 核心能力栈` / `## FIOS 系统宪法` / `## 六层架构` / `## 9 维度状态导航`，除非用户明示"重写画像"

## 常见错误

- **覆盖手填段** → 用户的长期偏好丢失。修复: 严格按 awk 章节提取，失败则中止。
- **历史更新只留新行** → 时间线断了。修复: 在顶部追加新行，原有内容保留。
- **改第二大脑画像内容** → 用户身份信息是基于简历 + 长期沉淀，不应在月度 refresh 时动。修复: 第二大脑 refresh 默认只动 `## 9 维度状态导航` 末尾的数字标注 + `## 历史更新` 追加。
- **用第一人称写状态文件** → "我今天 ..." 让其他 AI 助手以为在跟用户对话。修复: 第三人称"用户已经 ..."。
- **复述 properties 已有数字** → 浪费空间，没增量信息。修复: 解读、对比、风险提示。
- **refresh 时不查底层 db** → 凭印象写。修复: 必须 query 该维度的底层 db 当前数据，基于现实写。

## 完整示例："更新时间监管状态"

1. `scripts/notion_page_io.zsh get <time-page-id，取自 fios-dimension-pages.json> /tmp/fios-current-time.md`
2. 剥离 frontmatter → /tmp/fios-body-time.md
3. awk 提取 `## 用户偏好与原则` → /tmp/fios-preserved-time.md
4. `scripts/notion_query.zsh 目标设定` + `项目执行` + `任务执行` → 拿当前数字
5. AI 重写：当前态势 / 历史轨迹（增量）/ 当前活跃主线 / 当前风险 / AI 协作惯例
6. 历史更新追加 `- 2026-MM-DD: refresh (AI, 更新活跃主线 + 风险)`
7. 拼接 → /tmp/fios-new-time.md（7 章节按序）
8. `scripts/notion_page_io.zsh replace <time-page-id，取自 fios-dimension-pages.json> /tmp/fios-new-time.md`
9. 报告: "更新章节: 1,3,5,6,7；保留: 4；字节 4167 → 4521"
