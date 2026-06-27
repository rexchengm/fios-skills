---
name: notion-life-system
description: 用户个人 Notion 生活管理系统的总入口，也是「只读查询」的默认入口。凡是"查看/查询/看一下/查一下/列出 + 某个库的记录"这类只读意图都用本技能——如 查看目标、看看我的任务、查一下这个月支出、列出项目、看看笔记/习惯/账户。也用于：写入或更新指定 Notion 页面、检查数据库结构、跨多个数据库做关联推理，以及作为其它 notion 技能复用的底层（ntn CLI / schema / 路由表）。动词边界：纯查看/查询/列出记录→本技能；随手记录/录入一条信息（记一笔/记个/收藏）→notion-life-capture；设定/拆解目标→notion-life-cascade；分析/对比/趋势/"做得怎么样"→notion-life-insights；写日/周/月复盘→notion-life-reflection；读 FIOS 状态全景→notion-fios-status。
---

# Notion 生活系统（Life System）

## 核心规则

把 Notion 当作一个活的个人操作系统。默认只读检查，除非用户明确要求创建、更新、移动、归档、删除或以其他方式修改 Notion 数据。

绝不从本 skill 修改数据库 schema。结构探查类任务期间绝不修改 Notion 页面。

当用户说要写入某个具体 Notion 页面，或提供了目标 Notion 页面 URL 加内容时，把这视为只对该页面的明确修改授权。除非用户明确要求替换，否则保留页面已有内容。

## 必备参考文件

按需加载，不一次全读：

- `references/notion-intake-rules.md`: 处理随手输入的主路由规则，含每个数据库的场景、写入策略、可填字段、关联字段、禁填字段，以及 `queryDefaults`（排序字段 + 展示字段）。
- `references/notion-intake-rules.json`: 入库规则的机器可读版本。创建页面、查询记录或运行数据库查询前先用它。
- `references/notion-system-schema.md`: 人类可读总览、路由表、数据库 ID、关联图、rollup 图、属性表。
- `references/notion-system-schema.json`: 精确的机器可读 schema，含所有 data source ID、数据库 page ID、属性 ID、关联目标、select/status 选项、rollup 配置和完整公式表达式。

当前快照由 `数据管理` 页面用 `ntn` CLI 生成。若用户说 Notion 结构变了，刷新它。

## CLI 模式

Notion 操作用 `ntn`，不用浏览器自动化。

默认直连。打包脚本不再强制走代理。仅当 Notion API 调用因 TLS 或连接错误失败时，
才通过导出 `NOTION_CLI_PROXY` 选择走代理
（如 `export NOTION_CLI_PROXY=http://127.0.0.1:1082`）—— 脚本会自动识别。

```bash
ntn api v1/data_sources/<data_source_id>
```

数据库行查询用 data source ID：

```bash
ntn api v1/data_sources/<data_source_id>/query -d '{"page_size":10}'
```

页面读取或更新用 page ID：

```bash
ntn pages get <page_id>
```

指定页面的读写工作流，优先用打包的 helper：

```bash
~/.claude/skills/notion-life-system/scripts/notion_page_io.zsh id <page-url-or-id>
~/.claude/skills/notion-life-system/scripts/notion_page_io.zsh get <page-url-or-id> [output.md]
~/.claude/skills/notion-life-system/scripts/notion_page_io.zsh append <page-url-or-id> [content.md]
~/.claude/skills/notion-life-system/scripts/notion_page_io.zsh replace <page-url-or-id> [content.md]
```

`append` 和 `replace` 在调用 `ntn pages update` 之前，会先在 `~/.fios/notion-page-backups` 下创建本地 Markdown 备份。

## ntn 操作实战要点（踩过的坑，务必遵守）

- **创建页面（写记录）**：`ntn api v1/pages -X POST -d '{"parent":{"type":"data_source_id","data_source_id":"<id>"},"properties":{...}}'`。parent 用 `data_source_id`（当前 API 版本 2026-03-11）；relation 填 `{"relation":[{"id":"<page_id>"}]}`、日期带时段用 `{"date":{"start":"2026-06-03T14:00:00.000+08:00"}}`。
- **删除/归档页面**：用 `ntn api v1/pages/<id> -X PATCH -d '{"in_trash":true}'`。**不要用 `ntn pages trash`**——非交互环境会因确认提示失败（要 `--yes`）。
- **写入/PATCH 偶发失败要重试**：ntn 偶有间歇失败（返回空/非 page，伴随 "stale cached OpenAPI spec" warning），原样重试 1–4 次通常即成功。**批量写入/迁移/删除要逐项 GET 验证、失败重试**——实测一批十个 PATCH 可能大半首发失败、静默漏掉。
- **解析响应前先清控制字符**：ntn 返回的 JSON 常含未转义控制字符（formula 字段里的裸换行等），直接 jq/python 解析会报 "control characters must be escaped"。先 `tr -d '\000-\037\177'`（或 python `re.sub(r'[\x00-\x1f\x7f]','',raw)`）再解析；查询本身也偶发返回空，要重试。
- **jq 后处理两个易错点**：① 对象构造里中文 key 必须加引号（`{"事项":...}` 而非 `{事项:...}`）；② jq 顶层不能用分号连两个表达式（会编译错）。
- **select/status/multi_select 绝不臆造值**：select/multi_select 塞 options 里没有的值，Notion **不报错、自动新建脏选项**（污染选项库，比报错更隐蔽）；status 塞越界值则 **400**。一律匹配 options，匹配不到留空。
- **字段名以 `intake-rules.json` 为准，可能含尾随空格**：例如「日常打卡」指向习惯分类的 relation 字段名是 `习惯分类 `（末尾带一个空格），写错会 400「property does not exist」。

## 快速查询

只读数据库查询，**默认用** `scripts/notion_query.zsh` 而非裸 `ntn api .../query`。它从 `references/notion-intake-rules.json` 读取每个数据库的 `queryDefaults`，返回一个小而有序、字段已裁剪的结果，省得你每次都去查 schema 或 jq 过滤。

```bash
~/.claude/skills/notion-life-system/scripts/notion_query.zsh 目标设定
~/.claude/skills/notion-life-system/scripts/notion_query.zsh 任务执行 20
~/.claude/skills/notion-life-system/scripts/notion_query.zsh 支出事项 5 --format md
~/.claude/skills/notion-life-system/scripts/notion_query.zsh 助手管理 --full
~/.claude/skills/notion-life-system/scripts/notion_query.zsh --list
```

默认值：

- `pageSize`: 10（用数字型第二个参数覆盖）。
- 排序: 按以下优先级里第一个可用的日期字段 —— 截止日期, 目标开始日期, 开始日期, 事项日期, 结束日期, 旅行日期, 备注日期, 日期, 时间。没有日期字段的数据库回退到 `last_edited_time`。
- 方向: 降序（最新在前）。
- 展示字段: 标题 + 状态 + 排序日期 + 另一个日期 + 至多两个 select/multi_select（类型/分类/标签/分组/类别/来源）+ 一个财务数字。末尾再加 `page_id`，让 helper 输出可直接下钻。
- 输出格式: `tsv`（默认）、`md` 或 `json`。用 `--full` 跳过裁剪、返回原始 Notion API 响应。

永远优先用这个 helper，而非裸 `ntn api v1/data_sources/<id>/query`，除非：

- 你需要 `queryDefaults.displayFields` 之外的字段（那就用 `--full` 后处理，或在 `build_intake_rules.js` 里扩展 `queryDefaults`）。
- 你需要超过 100 条的分页。
- 你需要过滤器或非日期排序。helper 目前还没实现这些。

如果某数据库返回了错误的排序字段或展示字段，那是 `queryDefaults` 推导的 bug —— 在 `scripts/build_intake_rules.js` 里修好并重建，不要在 helper 或这里打补丁糊弄。

## 指定页面写入

当用户说"写到这个页面""追加到这个 Notion 页面""把这段内容放进 <url>""更新页面 <id>"之类时，用此工作流。

1. 提取 page ID。
   用 helper 的 `id` 模式。`ntn pages get` 和 `ntn pages update` 接受 page ID，不接受完整 Notion URL。

2. 判断 append 还是 replace。
   "写到/放到/追加到/记录到" 默认 `append`。只有当用户明确说替换、覆盖、重写整页或清空现有页面内容时才 `replace`。

3. 写前先读。
   非琐碎的更新，用 `get` 检查当前页面结构，决定新内容放哪。如果具体位置不明，就在末尾追加一个带日期的清晰小节。

4. 写 Markdown。
   把内容准备成本地临时文件里的 Markdown，再调 helper 的 `append` 或 `replace` 模式。不要把未经审阅的工具输出直接灌进 Notion。

5. 汇报 page ID 和备份路径。
   写完后告诉用户目标 page ID 和本地备份路径。

示例：

```bash
cat /tmp/content.md | ~/.claude/skills/notion-life-system/scripts/notion_page_io.zsh append "https://www.notion.so/.../<your-page-id>?source=copy_link"
```

```bash
~/.claude/skills/notion-life-system/scripts/notion_page_io.zsh replace <your-page-id> /tmp/new-page.md
```

## 交互工作流

1. 对用户输入分类。
   先加载 `references/notion-intake-rules.md` 或 `.json`。判断它是任务、项目、目标、规划、知识笔记、内容想法、书/影记录、财务记录、健康事件、习惯记录、人际事项、旅游事项、复盘、资源，还是助手管理项。

2. 选目标数据库。
   从 `notion-intake-rules` 的场景路由起步。常规记录用 `direct_write` 数据库，`conditional_write` 数据库只用于新建维度对象，除非用户明确点名，否则别写 `avoid_manual_write` 数据库。

3. 检查必填和有用属性。
   尽量按输入填上相关的可直填字段。不要填 `formula`、`rollup`、`button`、创建/编辑时间，或其他同步/计算字段。缺关键直填字段时，只问最少必要的问题。
   如果某数据库是 `avoid_manual_write`，写入策略优先于字段表：不要仅因为它有可直填字段就往里写。

4. 写前解析关联。
   如果某关联字段需要填，先用 `scripts/notion_query.zsh <name>` 查关联数据库，用返回的 `page_id`。不要凭空编关联 page ID，也不要把关联名当纯文本写进去。

5. 仅在歧义重大时才问。
   如果目标数据库或必填字段值不清楚，问一个简洁的问题。如果有明显的安全默认值，就直接做并说明假设。

6. 仅在明确许可下写入。
   对创建/更新请求，若改动非琐碎，执行前先汇总计划的目标数据库、属性映射和关联。除非用户明确要求，绝不做破坏性操作。

7. 汇报结果。
   包含数据库名、记录标题、page ID 或 URL（如有），以及任何未解析的字段。

## 路由启发式

优先用 `references/notion-intake-rules.md` 而非这张短表。本表只是快速兜底：

- 任务、提醒、执行步骤: `任务执行`
- 项目、里程碑、交付物: `项目执行`
- 目标与规划: `目标设定`, `规划设定`
- 想法、选题、创作计划: `选题收集`, `创作计划`, `第二大脑`
- 知识、课程、读书笔记: `知识类型`, `兴趣学习`, `学习笔记`, `书籍阅读`, `书籍笔记`
- 支出、收入、账户、固定周期付款: `支出事项`, `收入事项`, `收支账户`, `固定收支`, `支出分类`, `收入分类`
- 健康、饮食、就医跟踪: `身体健康`, `美食记录`, `就医跟踪`, `事项跟踪`
- 习惯与打卡: `日常打卡`, `次数打卡`, `打卡记录`, `月度展示`, `习惯分类`
- 人物、关系、社交跟进: `社交信息`, `事项处理`, `关系分类`
- 旅游: `旅游计划`, `景点选择`, `旅游地点`
- 影视: `电影视频`, `影视评论`, `影视分类`
- 复盘与看板: `每日复盘`, `每周复盘`, `每月复盘`, 相关的 `*监管` 数据库
- 资源与心愿: `资源收集`, `心愿奖励`
- 助手或自动化管理: `助手管理`

## 刷新 Schema

用户改了数据库结构后，运行这两个命令：

```bash
~/.claude/skills/notion-life-system/scripts/fetch_raw_schema.zsh
NOTION_SCHEMA_BUILD_ONLY=1 ~/.claude/skills/notion-life-system/scripts/refresh_schema.js --build-only
~/.claude/skills/notion-life-system/scripts/build_intake_rules.js
```

fetch 脚本只对 `v1/data_sources/<id>` 和 `v1/databases/<id>` 做读操作。build 步骤为 `notion_query.zsh` 重新生成 `queryDefaults`，连同以下其余文件：

- `~/.fios/notion-system-structure/Notion系统数据库结构说明.md`
- `~/.fios/notion-system-structure/notion-system-schema.json`
- `~/.fios/notion-system-structure/Notion入库路由规则.md`
- `references/notion-system-schema.md`
- `references/notion-system-schema.json`
- `references/notion-intake-rules.md`
- `references/notion-intake-rules.json`
