#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");

const skillDir = path.resolve(__dirname, "..");
const schemaPath = path.join(skillDir, "references", "notion-system-schema.json");
const outputJson = path.join(skillDir, "references", "notion-intake-rules.json");
const outputMd = path.join(skillDir, "references", "notion-intake-rules.md");
// 可选的镜像副本：默认写到 ~/.fios（仅本机方便用，非必需）。设 FIOS_SKIP_LOCAL_MIRROR=1 可关闭。
const localDir = process.env.FIOS_DATA_DIR || path.join(os.homedir(), ".fios", "notion-system-structure");
const localJson = path.join(localDir, "notion-intake-rules.json");
const localMd = path.join(localDir, "Notion入库路由规则.md");

const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));

const notFillTypes = new Set([
  "formula",
  "rollup",
  "button",
  "created_time",
  "created_by",
  "last_edited_time",
  "last_edited_by",
  "unique_id",
]);

const directFillTypes = new Set([
  "title",
  "rich_text",
  "number",
  "date",
  "select",
  "multi_select",
  "status",
  "url",
  "checkbox",
  "people",
  "files",
  "place",
  "email",
  "phone_number",
]);

const roleMap = {
  旅游计划: ["底层数据", "travel_event", "direct"],
  景点选择: ["底层数据", "travel_spot", "direct"],
  旅游地点: ["底层数据", "travel_location_dimension", "dimension"],
  社交信息: ["底层数据", "social_person", "dimension"],
  事项处理: ["底层数据", "social_matter", "direct"],
  关系分类: ["底层数据", "relationship_category", "dimension"],
  电影视频: ["底层数据", "media_item", "direct"],
  影视评论: ["底层数据", "media_review", "direct"],
  影视分类: ["底层数据", "media_category", "dimension"],
  目标设定: ["底层数据", "goal", "direct"],
  规划设定: ["底层数据", "plan", "direct"],
  项目执行: ["底层数据", "project", "direct"],
  任务执行: ["底层数据", "task", "direct"],
  家人亲人: ["底层数据", "family_person", "dimension"],
  物品管理: ["底层数据", "item_purchase", "direct"],
  固定收支: ["底层数据", "recurring_finance", "direct"],
  资源收集: ["底层数据", "resource_capture", "direct"],
  身体健康: ["底层数据", "health_record", "direct"],
  美食记录: ["底层数据", "food_record", "direct"],
  就医跟踪: ["底层数据", "medical_visit", "direct"],
  事项跟踪: ["底层数据", "matter_tracking", "direct"],
  日常打卡: ["底层数据", "daily_habit", "direct"],
  次数打卡: ["底层数据", "count_habit", "direct"],
  打卡记录: ["底层数据", "habit_checkin_record", "direct"],
  月度展示: ["底层数据", "habit_month_view", "aggregate"],
  习惯分类: ["底层数据", "habit_category", "dimension"],
  知识类型: ["底层数据", "knowledge_category", "dimension"],
  兴趣学习: ["底层数据", "learning_topic", "direct"],
  学习笔记: ["底层数据", "learning_note", "direct"],
  书籍阅读: ["底层数据", "book_reading", "direct"],
  书籍笔记: ["底层数据", "book_note", "direct"],
  支出分类: ["底层数据", "expense_category", "dimension"],
  收入事项: ["底层数据", "income_record", "direct"],
  支出事项: ["底层数据", "expense_record", "direct"],
  收入分类: ["底层数据", "income_category", "dimension"],
  收支账户: ["底层数据", "finance_account", "dimension"],
  时间监管: ["自动数据", "time_monitor", "monitor"],
  知识监管: ["自动数据", "knowledge_monitor", "monitor"],
  人际监管: ["自动数据", "social_monitor", "monitor"],
  习惯监管: ["自动数据", "habit_monitor", "monitor"],
  财务监管: ["自动数据", "finance_monitor", "monitor"],
  旅游监管: ["自动数据", "travel_monitor", "monitor"],
  家庭监管: ["自动数据", "family_monitor", "monitor"],
  影视监管: ["自动数据", "media_monitor", "monitor"],
  每日复盘: ["自动数据", "daily_review", "direct"],
  每周复盘: ["自动数据", "weekly_review", "direct"],
  每月复盘: ["自动数据", "monthly_review", "direct"],
  复盘监管: ["自动数据", "review_monitor", "monitor"],
  第二大脑: ["关键", "second_brain_dashboard", "hub"],
  创作计划: ["关键", "content_plan", "direct"],
  选题收集: ["关键", "topic_capture", "direct"],
  心愿奖励: ["关键", "wish_reward", "direct"],
  助手管理: ["关键", "assistant_registry", "dimension"],
};

const triggers = {
  旅游计划: ["旅行计划", "行程", "旅游安排", "出游"],
  景点选择: ["景点", "门票", "游玩点", "打卡地"],
  旅游地点: ["城市", "省份", "目的地", "旅游地点"],
  社交信息: ["联系人", "朋友", "人脉", "社交对象"],
  事项处理: ["人际事项", "要联系", "要处理的人情事"],
  关系分类: ["关系分类", "朋友分组", "社交类别"],
  电影视频: ["电影", "视频", "剧集", "想看", "看完"],
  影视评论: ["影评", "观后感", "影视评价"],
  影视分类: ["影视类型", "题材", "影视分类"],
  目标设定: ["目标", "年度目标", "长期目标"],
  规划设定: ["规划", "计划", "阶段规划"],
  项目执行: ["项目", "交付", "里程碑"],
  任务执行: ["任务", "待办", "提醒", "明天要做"],
  家人亲人: ["家人", "亲人", "家庭成员"],
  物品管理: ["买东西", "物品", "购物", "资产"],
  固定收支: ["固定收入", "固定支出", "订阅", "房租"],
  资源收集: ["资料", "资源", "链接", "素材", "收藏"],
  身体健康: ["健康", "身体", "体检", "睡眠"],
  美食记录: ["吃了", "菜谱", "饮食", "美食"],
  就医跟踪: ["看病", "就医", "复查", "医院"],
  事项跟踪: ["跟踪事项", "持续跟进"],
  日常打卡: ["日常打卡", "每天打卡"],
  次数打卡: ["次数打卡", "做了几次", "训练次数"],
  打卡记录: ["打卡记录", "完成一次"],
  月度展示: ["月度展示", "月度习惯统计"],
  习惯分类: ["习惯分类", "新习惯"],
  知识类型: ["知识类型", "知识分类"],
  兴趣学习: ["学习计划", "课程", "技能学习"],
  学习笔记: ["学习笔记", "笔记", "课程笔记"],
  书籍阅读: ["读书", "书籍", "阅读"],
  书籍笔记: ["读书笔记", "书摘"],
  支出分类: ["支出分类", "消费类别"],
  收入事项: ["收入", "收款", "进账"],
  支出事项: ["支出", "花了", "消费", "付款"],
  收入分类: ["收入分类", "收入类别"],
  收支账户: ["账户", "银行卡", "余额"],
  时间监管: ["时间监管", "时间总览"],
  知识监管: ["知识监管", "知识总览"],
  人际监管: ["人际监管", "关系总览"],
  习惯监管: ["习惯监管", "习惯总览"],
  财务监管: ["财务监管", "财务总览"],
  旅游监管: ["旅游监管", "旅游总览"],
  家庭监管: ["家庭监管", "家庭总览"],
  影视监管: ["影视监管", "影视总览"],
  每日复盘: ["今天复盘", "日复盘", "日报"],
  每周复盘: ["周复盘", "周报"],
  每月复盘: ["月复盘", "月报"],
  复盘监管: ["复盘监管", "复盘总览"],
  第二大脑: ["第二大脑", "总控", "总览"],
  创作计划: ["创作计划", "文章计划", "视频计划"],
  选题收集: ["选题", "内容灵感", "小红书选题"],
  心愿奖励: ["心愿", "奖励", "想买"],
  助手管理: ["助手", "AI 工具", "Agent", "自动化工具"],
};

const titleAliases = ["名称", "事项", "项目", "目标", "规划", "姓名", "账户", "主题", "Name", "书籍名称", "记录主题"];

const sortFieldPriority = [
  "截止日期",
  "目标开始日期",
  "开始日期",
  "事项日期",
  "结束日期",
  "旅行日期",
  "备注日期",
  "日期",
  "时间",
];

const selectAliasesForDisplay = ["类型", "分类", "标签", "分组", "类别", "来源", "状态"];
const numberAliasesForDisplay = ["金额", "实际消费", "支出金额", "收入金额", "评分"];

const importantNames = [
  "状态",
  "来源",
  "备注日期",
  "时间",
  "日期",
  "事项日期",
  "开始日期",
  "结束日期",
  "截至日期",
  "URL",
  "标签",
  "描述",
  "主要内容",
  "核心思想",
  "备注",
  "分类",
  "账户",
  "金额",
  "收入金额",
  "支出金额",
  "实际消费",
  "负责人",
  "项目",
  "任务",
  "知识",
];

function optionsFor(prop) {
  const cfg = prop.config || {};
  if (prop.type === "select") return (cfg.options || []).map((x) => x.name);
  if (prop.type === "multi_select") return (cfg.options || []).map((x) => x.name);
  if (prop.type === "status") return (cfg.options || []).map((x) => x.name);
  return undefined;
}

function shortField(prop) {
  const field = { name: prop.name, id: prop.id, type: prop.type };
  const options = optionsFor(prop);
  if (options?.length) field.options = options;
  return field;
}

function writePolicy(role) {
  if (role === "monitor" || role === "hub" || role === "aggregate") {
    return "avoid_manual_write";
  }
  if (role === "dimension") return "conditional_write";
  return "direct_write";
}

function writePolicyNote(role) {
  if (role === "monitor") return "监管/同步汇总库。默认只读；只在用户明确要维护监管维度条目时写入基础字段。";
  if (role === "hub") return "总控页/总览库。默认只读，不把随手输入直接写进这里。";
  if (role === "aggregate") return "展示/聚合库。默认只读，通常由底层记录和按钮/公式驱动。";
  if (role === "dimension") return "维度库。只有新增分类、人物、账户、地点、工具等基础对象时写入。";
  return "业务写入库。用户随手输入匹配该场景时，可创建新记录并尽量填写可填字段。";
}

function pickSortField(fillable) {
  for (const name of sortFieldPriority) {
    const match = fillable.find((p) => p.name === name && p.type === "date");
    if (match) return { sortBy: "property", sortField: match.name, sortFieldId: match.id };
  }
  const anyDate = fillable.find((p) => p.type === "date");
  if (anyDate) return { sortBy: "property", sortField: anyDate.name, sortFieldId: anyDate.id };
  return { sortBy: "timestamp", sortField: "last_edited_time", sortFieldId: null };
}

function pickDisplayFields(fillable, sortFieldName) {
  const title = fillable.find((p) => p.type === "title");
  const status = fillable.find((p) => p.type === "status");

  const dateSort = fillable.find((p) => p.type === "date" && p.name === sortFieldName);
  const otherDates = fillable
    .filter((p) => p.type === "date" && p.name !== sortFieldName)
    .slice(0, 1);

  const selects = fillable
    .filter(
      (p) =>
        (p.type === "select" || p.type === "multi_select") &&
        selectAliasesForDisplay.some((alias) => p.name.includes(alias)),
    )
    .slice(0, 2);

  const numbers = fillable
    .filter((p) => p.type === "number" && numberAliasesForDisplay.some((alias) => p.name.includes(alias)))
    .slice(0, 1);

  const picked = [title, status, dateSort, ...otherDates, ...selects, ...numbers].filter(Boolean);
  const seen = new Set();
  return picked
    .filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    })
    .slice(0, 6)
    .map(shortField);
}

function pickArchiveField(properties) {
  // Detect an archive-style checkbox field (归档 / 已归档 / archived).
  // Returns {name, id} or null. Used by notion_query.zsh to filter out
  // archived rows by default.
  const archiveAliases = ["归档", "已归档", "archived", "Archived"];
  for (const p of properties) {
    if (p.type !== "checkbox") continue;
    if (archiveAliases.some((alias) => p.name === alias || p.name.includes(alias))) {
      return { name: p.name, id: p.id };
    }
  }
  return null;
}

function queryDefaults(fillable, properties) {
  const sort = pickSortField(fillable);
  const displayFields = pickDisplayFields(fillable, sort.sortField);
  const archiveField = pickArchiveField(properties);
  return {
    pageSize: 25,
    sortBy: sort.sortBy,
    sortField: sort.sortField,
    sortFieldId: sort.sortFieldId,
    sortDirection: "descending",
    displayFields,
    archiveField, // {name, id} or null. Helper filters where checkbox != true by default.
  };
}

function minimumFields(db, fillable) {
  const title = fillable.find((p) => p.type === "title") || fillable.find((p) => titleAliases.includes(p.name));
  const candidates = [title, ...fillable.filter((p) => importantNames.some((name) => p.name.includes(name)))].filter(Boolean);
  const seen = new Set();
  return candidates.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  }).slice(0, 10).map(shortField);
}

const rules = {
  generatedAt: new Date().toISOString(),
  principle: "用户输入后按场景选库；formula/rollup/button/created/edited 等同步或计算字段不填；普通字段尽量从输入中提取，缺关键字段时追问；relation 字段必须先查询目标库拿 page ID。",
  notFillTypes: [...notFillTypes],
  directFillTypes: [...directFillTypes],
  databases: [],
};

for (const db of schema.databases) {
  const [section, scenario, role] = roleMap[db.name] || [db.domain, "unknown", "direct"];
  const fillable = db.properties.filter((p) => directFillTypes.has(p.type));
  const relation = db.properties.filter((p) => p.type === "relation");
  const doNotFill = db.properties.filter((p) => notFillTypes.has(p.type));
  const rule = {
    name: db.name,
    section,
    domain: db.domain,
    scenario,
    role,
    writePolicy: writePolicy(role),
    writePolicyNote: writePolicyNote(role),
    databasePageId: db.databasePageId,
    dataSourceId: db.dataSourceId,
    triggers: triggers[db.name] || [db.name],
    queryDefaults: queryDefaults(fillable, db.properties),
    minimumFields: minimumFields(db, fillable),
    fillableFields: fillable.map(shortField),
    relationFields: relation.map((p) => ({
      name: p.name,
      id: p.id,
      type: p.type,
      target: p.relation?.targetName || null,
      targetDataSourceId: p.relation?.dataSourceId || null,
      note: "需要先查询目标数据库，拿到目标页面 ID 后再填写 relation；不要把 relation 当普通文本写入。",
    })),
    doNotFillFields: doNotFill.map((p) => ({
      name: p.name,
      id: p.id,
      type: p.type,
      reason:
        p.type === "formula"
          ? "公式自动计算"
          : p.type === "rollup"
            ? "Rollup 从 relation 同步汇总"
            : p.type === "button"
              ? "按钮动作，不通过 API 填值"
              : "系统自动字段",
    })),
  };
  rules.databases.push(rule);
}

function esc(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

const lines = [];
lines.push("# Notion 入库路由规则");
lines.push("");
lines.push(`生成时间：${rules.generatedAt}`);
lines.push("");
lines.push("这份规则用于让 Codex 在用户随手输入信息时判断写入位置。规则来自本地 schema 静态分析和数据管理页的场景分组，没有修改 Notion。");
lines.push("");
lines.push("## 总原则");
lines.push("");
lines.push("- 按场景选库，不按关键词机械匹配。");
lines.push("- `formula`、`rollup`、`button`、创建/编辑时间等同步或计算字段不要填写。");
lines.push("- `title`、`rich_text`、`number`、`date`、`select`、`multi_select`、`status`、`url`、`checkbox`、`people`、`files`、`place` 是可直接填写字段。");
lines.push("- `relation` 可以填写，但必须先查询目标数据库拿到目标 page ID，不要把 relation 当文本写入。");
lines.push("- 监管库、第二大脑、月度展示等默认只读；把底层业务数据写对，让公式/rollup 自动汇总。");
lines.push("- 用户信息足够时直接入库；缺关键字段时只问最少的问题。");
lines.push("");
lines.push("## 写入角色");
lines.push("");
lines.push("| 角色 | 策略 | 含义 |");
lines.push("|---|---|---|");
lines.push("| direct | direct_write | 业务记录入口，适合直接创建记录。 |");
lines.push("| dimension | conditional_write | 分类、账户、人物、地点等维度对象，只有新增维度时创建。 |");
lines.push("| monitor | avoid_manual_write | 监管/汇总库，默认只读。 |");
lines.push("| aggregate | avoid_manual_write | 展示聚合库，默认只读。 |");
lines.push("| hub | avoid_manual_write | 总控库/第二大脑，默认只读。 |");
lines.push("");
lines.push("## 场景路由总览");
lines.push("");
lines.push("| 数据库 | 场景 | 角色 | 写入策略 | 触发词 | 最小字段 | Relation | 不填字段数 |");
lines.push("|---|---|---|---|---|---|---:|---:|");
for (const rule of rules.databases) {
  lines.push(
    `| ${esc(rule.name)} | ${esc(rule.scenario)} | ${esc(rule.role)} | ${esc(rule.writePolicy)} | ${esc(rule.triggers.join("、"))} | ${esc(rule.minimumFields.map((f) => `${f.name}(${f.type})`).join("、"))} | ${rule.relationFields.length} | ${rule.doNotFillFields.length} |`,
  );
}
lines.push("");
lines.push("## 每库详细规则");
lines.push("");
for (const rule of rules.databases) {
  lines.push(`### ${rule.name}`);
  lines.push("");
  lines.push(`- 分区：${rule.section}`);
  lines.push(`- 领域：${rule.domain}`);
  lines.push(`- 场景：${rule.scenario}`);
  lines.push(`- 角色：${rule.role}`);
  lines.push(`- 写入策略：${rule.writePolicy}`);
  lines.push(`- 策略说明：${rule.writePolicyNote}`);
  lines.push(`- data source ID：\`${rule.dataSourceId}\``);
  lines.push(`- 触发词：${rule.triggers.join("、")}`);
  const qd = rule.queryDefaults;
  const qdSortLabel = qd.sortBy === "property" ? `属性「${qd.sortField}」` : `时间戳「${qd.sortField}」`;
  lines.push(`- 查询默认：按 ${qdSortLabel} ${qd.sortDirection} 排序，取 ${qd.pageSize} 条，展示字段 ${qd.displayFields.map((f) => f.name).join("、") || "无"}`);
  lines.push("");
  lines.push("可直接填写字段：");
  lines.push("");
  if (rule.fillableFields.length) {
    lines.push(rule.fillableFields.map((f) => `- ${f.name} (${f.type})${f.options ? `：${f.options.slice(0, 20).join("、")}${f.options.length > 20 ? " ..." : ""}` : ""}`).join("\n"));
  } else {
    lines.push("- 无");
  }
  lines.push("");
  lines.push("Relation 字段：");
  lines.push("");
  if (rule.relationFields.length) {
    lines.push(rule.relationFields.map((f) => `- ${f.name} -> ${f.target}，先查询目标库再填 page ID`).join("\n"));
  } else {
    lines.push("- 无");
  }
  lines.push("");
  lines.push("不要填写字段：");
  lines.push("");
  if (rule.doNotFillFields.length) {
    lines.push(rule.doNotFillFields.map((f) => `- ${f.name} (${f.type})：${f.reason}`).join("\n"));
  } else {
    lines.push("- 无");
  }
  lines.push("");
}

// 主输出：技能自身的 references/（可移植，随 __dirname 走）
fs.writeFileSync(outputJson, `${JSON.stringify(rules, null, 2)}\n`);
fs.writeFileSync(outputMd, `${lines.join("\n")}\n`);
console.log(outputJson);
console.log(outputMd);

// 可选镜像：默认也写一份到 ~/.fios，设 FIOS_SKIP_LOCAL_MIRROR=1 跳过
if (process.env.FIOS_SKIP_LOCAL_MIRROR !== "1") {
  fs.mkdirSync(localDir, { recursive: true });
  fs.writeFileSync(localJson, `${JSON.stringify(rules, null, 2)}\n`);
  fs.writeFileSync(localMd, `${lines.join("\n")}\n`);
  console.log(localJson);
  console.log(localMd);
}
