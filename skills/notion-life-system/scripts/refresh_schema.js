#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const FIOS_DATA_DIR = process.env.FIOS_DATA_DIR || path.join(os.homedir(), ".fios");
const DEFAULT_SOURCE_MD = path.join(FIOS_DATA_DIR, "数据管理.page.md");
const DEFAULT_OUTPUT_DIR = path.join(FIOS_DATA_DIR, "notion-system-structure");
const DEFAULT_SKILL_DIR = path.resolve(__dirname, "..");

const buildOnly = process.env.NOTION_SCHEMA_BUILD_ONLY === "1" || process.argv.includes("--build-only");
const positionalArgs = process.argv.slice(2).filter((arg) => arg !== "--build-only");
const sourceMarkdownPath = positionalArgs[0] || DEFAULT_SOURCE_MD;
const outputDir = positionalArgs[1] || DEFAULT_OUTPUT_DIR;
const skillDir = process.env.SKILL_DIR || DEFAULT_SKILL_DIR;
const skillReferencesDir = path.join(skillDir, "references");
const concurrency = Number(process.env.NOTION_EXPORT_CONCURRENCY || "2");
// Direct connection by default. Set NOTION_CLI_PROXY=http://host:port to route via a proxy.
const notionCliProxy = process.env.NOTION_CLI_PROXY || "";
const notionCliTimeoutMs = Number(process.env.NOTION_CLI_TIMEOUT_MS || "60000");

const proxyEnv = notionCliProxy
  ? {
      ...process.env,
      HTTP_PROXY: notionCliProxy,
      HTTPS_PROXY: notionCliProxy,
      http_proxy: notionCliProxy,
      https_proxy: notionCliProxy,
    }
  : { ...process.env };

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(value) {
  return decodeEntities(value.replace(/<[^>]+>/g, "")).trim();
}

function safeFilePart(value) {
  return value
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function plainText(richText) {
  if (!Array.isArray(richText)) return "";
  return richText.map((part) => part.plain_text || "").join("");
}

function compactId(id) {
  return String(id || "").replace(/-/g, "");
}

function escapeCell(value) {
  return String(value ?? "")
    .replace(/\r?\n/g, "<br>")
    .replace(/\|/g, "\\|");
}

function truncate(value, max = 220) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function parseDatabaseEntries(markdown) {
  const entries = [];
  const seen = new Set();
  const databaseTag =
    /<database\s+[^>]*url="https:\/\/www\.notion\.so\/([^"]+)"[^>]*data-source-url="collection:\/\/([^"]+)"[^>]*>([\s\S]*?)<\/database>/g;
  let match;
  while ((match = databaseTag.exec(markdown)) !== null) {
    const databasePageId = match[1].split(/[?#/]/)[0];
    const dataSourceId = match[2];
    const name = stripTags(match[3]);
    if (seen.has(dataSourceId)) continue;
    seen.add(dataSourceId);
    entries.push({
      index: entries.length + 1,
      name,
      databasePageId,
      dataSourceId,
    });
  }
  return entries;
}

function execNtn(args) {
  return new Promise((resolve, reject) => {
    execFile(
      "ntn",
      args,
      {
        env: proxyEnv,
        maxBuffer: 64 * 1024 * 1024,
        timeout: notionCliTimeoutMs,
      },
      (error, stdout, stderr) => {
        if (error) {
          const detail = [stderr, stdout].filter(Boolean).join("\n");
          error.message = `${error.message}\n${detail}`;
          reject(error);
          return;
        }
        resolve(stdout);
      },
    );
  });
}

async function ntnJson(args, label, retries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const stdout = await execNtn(args);
      return JSON.parse(stdout);
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(800 * attempt);
      }
    }
  }
  throw new Error(`${label} failed after ${retries} attempts: ${lastError.message}`);
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function runWorker() {
    while (cursor < items.length) {
      const current = cursor;
      cursor += 1;
      results[current] = await worker(items[current], current);
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => runWorker(),
  );
  await Promise.all(workers);
  return results;
}

function summarizeProperty(prop, source, dataSourceById) {
  const type = prop.type;
  const config = prop[type] || {};
  const summary = {
    id: prop.id,
    name: prop.name,
    type,
    description: prop.description ?? null,
    config,
  };

  if (type === "relation") {
    const target = dataSourceById.get(config.data_source_id);
    summary.relation = {
      dataSourceId: config.data_source_id,
      databaseId: config.database_id,
      targetName: target?.name || null,
      targetKnownInSystem: Boolean(target),
      mode: config.type || null,
      syncedPropertyId: config.dual_property?.synced_property_id || null,
      syncedPropertyName: config.dual_property?.synced_property_name || null,
    };
  }

  if (type === "rollup") {
    const relationProp = Object.values(source.rawDataSource.properties || {}).find(
      (candidate) => candidate.id === config.relation_property_id,
    );
    const relationTarget =
      relationProp?.type === "relation"
        ? dataSourceById.get(relationProp.relation?.data_source_id)
        : null;
    summary.rollup = {
      function: config.function,
      relationPropertyId: config.relation_property_id,
      relationPropertyName: config.relation_property_name,
      rollupPropertyId: config.rollup_property_id,
      rollupPropertyName: config.rollup_property_name,
      relationTargetName: relationTarget?.name || null,
      relationTargetDataSourceId: relationProp?.relation?.data_source_id || null,
    };
  }

  return summary;
}

function propertyDetail(prop) {
  const config = prop.config || {};
  switch (prop.type) {
    case "relation":
      return `to ${prop.relation?.targetName || "unknown"} (${prop.relation?.dataSourceId || ""}); mode=${prop.relation?.mode || ""}; synced=${prop.relation?.syncedPropertyName || ""}`;
    case "rollup":
      return `via ${prop.rollup?.relationPropertyName || ""} -> ${prop.rollup?.rollupPropertyName || ""}; function=${prop.rollup?.function || ""}; target=${prop.rollup?.relationTargetName || ""}`;
    case "formula":
      return `formula: ${truncate(config.expression || "", 180)}`;
    case "select":
      return `options: ${(config.options || []).map((option) => option.name).join(", ")}`;
    case "multi_select":
      return `options: ${(config.options || []).map((option) => option.name).join(", ")}`;
    case "status":
      return `options: ${(config.options || []).map((option) => option.name).join(", ")}; groups: ${(config.groups || []).map((group) => group.name).join(", ")}`;
    case "number":
      return `format: ${config.format || ""}`;
    case "unique_id":
      return `prefix: ${config.prefix || ""}`;
    default:
      return "";
  }
}

function domainForName(name) {
  const domains = [
    ["规划", ["目标", "规划", "项目", "任务"]],
    ["知识", ["知识", "学习", "书籍", "第二大脑"]],
    ["创作", ["创作", "选题"]],
    ["财务", ["收入", "支出", "收支", "财务", "固定收支"]],
    ["习惯", ["习惯", "打卡", "月度展示"]],
    ["健康", ["健康", "美食", "就医"]],
    ["人际", ["社交", "关系", "人际", "事项处理"]],
    ["旅游", ["旅游", "景点"]],
    ["影视", ["影视", "电影"]],
    ["复盘监管", ["复盘", "监管", "时间监管", "家庭监管"]],
    ["生活", ["家人", "物品", "资源", "心愿", "助手"]],
  ];
  const matched = domains.find(([, keywords]) =>
    keywords.some((keyword) => name.includes(keyword)),
  );
  return matched?.[0] || "其他";
}

function buildMarkdown(schema) {
  const lines = [];
  lines.push("# Notion 个人系统数据库结构说明");
  lines.push("");
  lines.push(`生成时间：${schema.generatedAt}`);
  lines.push("");
  lines.push("本文件由 `ntn` CLI 只读导出生成。导出过程只调用 `v1/data_sources/<id>` 和 `v1/databases/<id>` 读取结构，没有修改 Notion 页面、数据库或条目。");
  lines.push("");
  lines.push("## 文件说明");
  lines.push("");
  lines.push("- `notion-system-schema.json`：完整结构数据，包含每个属性的原始配置、公式表达式、选项、relation 和 rollup 配置。");
  lines.push("- `raw-data-sources/`：每个 data source 的原始 Notion API 响应。");
  lines.push("- `raw-databases/`：每个 database 的原始 Notion API 响应。");
  lines.push("");
  lines.push("## 总览");
  lines.push("");
  lines.push(`- 数据库入口数：${schema.databaseCount}`);
  lines.push(`- 属性总数：${schema.stats.propertyCount}`);
  lines.push(`- Relation 属性数：${schema.stats.relationCount}`);
  lines.push(`- Rollup 属性数：${schema.stats.rollupCount}`);
  lines.push(`- Formula 属性数：${schema.stats.formulaCount}`);
  lines.push("");
  lines.push("## 数据库索引");
  lines.push("");
  lines.push("| # | 领域 | 数据库 | database page ID | data source ID | 属性 | relations | rollups |");
  lines.push("|---:|---|---|---|---|---:|---:|---:|");
  for (const database of schema.databases) {
    lines.push(
      `| ${database.index} | ${escapeCell(database.domain)} | ${escapeCell(database.name)} | \`${database.databasePageId}\` | \`${database.dataSourceId}\` | ${database.propertyCount} | ${database.relationCount} | ${database.rollupCount} |`,
    );
  }
  lines.push("");

  lines.push("## 领域分组");
  lines.push("");
  const byDomain = new Map();
  for (const database of schema.databases) {
    if (!byDomain.has(database.domain)) byDomain.set(database.domain, []);
    byDomain.get(database.domain).push(database.name);
  }
  for (const [domain, names] of byDomain.entries()) {
    lines.push(`- ${domain}：${names.join("、")}`);
  }
  lines.push("");

  lines.push("## Relation 关联图");
  lines.push("");
  lines.push("| 来源库 | 属性 | 指向库 | 关联模式 | 对向属性 | 目标 data source |");
  lines.push("|---|---|---|---|---|---|");
  for (const relation of schema.relations) {
    lines.push(
      `| ${escapeCell(relation.sourceName)} | ${escapeCell(relation.propertyName)} | ${escapeCell(relation.targetName || "unknown")} | ${escapeCell(relation.mode || "")} | ${escapeCell(relation.syncedPropertyName || "")} | \`${relation.targetDataSourceId || ""}\` |`,
    );
  }
  lines.push("");

  lines.push("## Rollup 依赖图");
  lines.push("");
  lines.push("| 来源库 | Rollup 属性 | 经由 Relation | 目标属性 | 函数 | Relation 目标库 |");
  lines.push("|---|---|---|---|---|---|");
  for (const rollup of schema.rollups) {
    lines.push(
      `| ${escapeCell(rollup.sourceName)} | ${escapeCell(rollup.propertyName)} | ${escapeCell(rollup.relationPropertyName || "")} | ${escapeCell(rollup.rollupPropertyName || "")} | ${escapeCell(rollup.function || "")} | ${escapeCell(rollup.relationTargetName || "")} |`,
    );
  }
  lines.push("");

  lines.push("## 交互入口建议");
  lines.push("");
  lines.push("| 用户输入类型 | 优先数据库 | 说明 |");
  lines.push("|---|---|---|");
  lines.push("| 待办、提醒、执行动作 | 任务执行 | 创建或查询具体行动项，通常关联项目、每日复盘或相关资料库。 |");
  lines.push("| 项目、阶段性目标、交付计划 | 项目执行 | 承接任务执行，上接目标/规划。 |");
  lines.push("| 年度/月度目标和规划 | 目标设定、规划设定 | 目标到规划到项目到任务的主线。 |");
  lines.push("| 灵感、选题、文章/视频计划 | 选题收集、创作计划、第二大脑 | 未成型信息先入选题或第二大脑，成型后进入创作计划。 |");
  lines.push("| 学习笔记、课程、书籍 | 学习笔记、兴趣学习、书籍阅读、书籍笔记 | 按资料类型选择，并尽量关联任务或知识类型。 |");
  lines.push("| 收入、支出、账户和预算 | 收入事项、支出事项、收支账户、收入分类、支出分类 | 金额流水进事项，分类和账户作为维度。 |");
  lines.push("| 健康、美食、就医 | 身体健康、美食记录、就医跟踪、事项跟踪 | 健康事件和长期跟踪分开。 |");
  lines.push("| 习惯和打卡 | 日常打卡、次数打卡、打卡记录、习惯分类 | 习惯定义、打卡动作、记录展示分层。 |");
  lines.push("| 人际关系和社交事项 | 社交信息、事项处理、关系分类 | 人、关系、待处理事项分开。 |");
  lines.push("| 旅游计划 | 旅游计划、景点选择、旅游地点 | 目的地、景点和具体行程分层。 |");
  lines.push("| 影视观看和评论 | 电影视频、影视评论、影视分类 | 资源、评论、分类分开。 |");
  lines.push("");

  lines.push("## 各数据库完整属性索引");
  lines.push("");
  lines.push("说明：下表列出每个属性的名称、属性 ID、类型和关键配置。公式完整表达式、select/status 完整选项、relation/rollup 原始配置保存在同目录 `notion-system-schema.json`。");
  lines.push("");

  for (const database of schema.databases) {
    lines.push(`### ${database.index}. ${database.name}`);
    lines.push("");
    lines.push(`- 领域：${database.domain}`);
    lines.push(`- database page ID：\`${database.databasePageId}\``);
    lines.push(`- data source ID：\`${database.dataSourceId}\``);
    if (database.apiTitle && database.apiTitle !== database.name) {
      lines.push(`- API 标题：${database.apiTitle}`);
    }
    lines.push(`- 属性数：${database.propertyCount}，Relation：${database.relationCount}，Rollup：${database.rollupCount}，Formula：${database.formulaCount}`);
    lines.push("");
    lines.push("| 属性 | 属性 ID | 类型 | 关键配置 |");
    lines.push("|---|---|---|---|");
    for (const prop of database.properties) {
      lines.push(
        `| ${escapeCell(prop.name)} | \`${escapeCell(prop.id)}\` | ${escapeCell(prop.type)} | ${escapeCell(propertyDetail(prop))} |`,
      );
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  ensureDir(outputDir);
  ensureDir(path.join(outputDir, "raw-data-sources"));
  ensureDir(path.join(outputDir, "raw-databases"));
  ensureDir(skillReferencesDir);

  const markdown = fs.readFileSync(sourceMarkdownPath, "utf8");
  const entries = parseDatabaseEntries(markdown);
  if (entries.length === 0) {
    throw new Error(`No database tags found in ${sourceMarkdownPath}`);
  }

  console.error(`Found ${entries.length} database entries.`);

  let fetched;
  if (buildOnly) {
    const manifestPath = path.join(outputDir, "manifest.tsv");
    const manifest = fs.readFileSync(manifestPath, "utf8").trim().split(/\r?\n/).slice(1);
    fetched = manifest.map((line) => {
      const [index, name, databasePageId, dataSourceId, dataSourceFile, databaseFile] =
        line.split("\t");
      return {
        index: Number(index),
        name,
        databasePageId,
        dataSourceId,
        rawDataSource: JSON.parse(
          fs.readFileSync(path.join(outputDir, "raw-data-sources", dataSourceFile), "utf8"),
        ),
        rawDatabase: JSON.parse(
          fs.readFileSync(path.join(outputDir, "raw-databases", databaseFile), "utf8"),
        ),
      };
    });
    console.error(`Loaded ${fetched.length} raw entries from ${manifestPath}`);
  } else {
    fetched = await mapWithConcurrency(entries, concurrency, async (entry) => {
    const label = `${entry.index}/${entries.length} ${entry.name}`;
    console.error(`Reading ${label}`);
    const rawDataSource = await ntnJson(
      ["api", `v1/data_sources/${entry.dataSourceId}`],
      `${label} data source`,
    );
    const rawDatabase = await ntnJson(
      ["api", `v1/databases/${entry.databasePageId}`],
      `${label} database`,
    );

    const baseFile = `${String(entry.index).padStart(2, "0")}-${safeFilePart(entry.name)}-${entry.dataSourceId}`;
    fs.writeFileSync(
      path.join(outputDir, "raw-data-sources", `${baseFile}.json`),
      `${JSON.stringify(rawDataSource, null, 2)}\n`,
    );
    fs.writeFileSync(
      path.join(outputDir, "raw-databases", `${baseFile}.json`),
      `${JSON.stringify(rawDatabase, null, 2)}\n`,
    );
    console.error(`Done ${label}`);

    return {
      ...entry,
      rawDataSource,
      rawDatabase,
    };
    });
  }

  const dataSourceById = new Map(
    fetched.map((item) => [
      item.dataSourceId,
      {
        name: item.name,
        databasePageId: item.databasePageId,
        dataSourceId: item.dataSourceId,
      },
    ]),
  );

  const databases = fetched.map((item) => {
    const properties = Object.values(item.rawDataSource.properties || {})
      .map((prop) => summarizeProperty(prop, item, dataSourceById))
      .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));

    return {
      index: item.index,
      name: item.name,
      domain: domainForName(item.name),
      databasePageId: item.databasePageId,
      databaseId: item.rawDatabase.id || null,
      dataSourceId: item.dataSourceId,
      apiTitle: plainText(item.rawDataSource.title) || item.name,
      url: item.rawDataSource.url || item.rawDatabase.url || null,
      publicUrl: item.rawDataSource.public_url || item.rawDatabase.public_url || null,
      parent: item.rawDataSource.parent || null,
      databaseParent: item.rawDataSource.database_parent || item.rawDatabase.parent || null,
      isInline: item.rawDataSource.is_inline ?? item.rawDatabase.is_inline ?? null,
      inTrash: item.rawDataSource.in_trash ?? item.rawDatabase.in_trash ?? null,
      createdTime: item.rawDataSource.created_time || null,
      lastEditedTime: item.rawDataSource.last_edited_time || null,
      propertyCount: properties.length,
      relationCount: properties.filter((prop) => prop.type === "relation").length,
      rollupCount: properties.filter((prop) => prop.type === "rollup").length,
      formulaCount: properties.filter((prop) => prop.type === "formula").length,
      properties,
    };
  });

  const relations = [];
  const rollups = [];
  for (const database of databases) {
    for (const prop of database.properties) {
      if (prop.type === "relation") {
        relations.push({
          sourceName: database.name,
          sourceDataSourceId: database.dataSourceId,
          sourceDatabasePageId: database.databasePageId,
          propertyName: prop.name,
          propertyId: prop.id,
          targetName: prop.relation?.targetName || null,
          targetDataSourceId: prop.relation?.dataSourceId || null,
          targetDatabaseId: prop.relation?.databaseId || null,
          targetKnownInSystem: prop.relation?.targetKnownInSystem || false,
          mode: prop.relation?.mode || null,
          syncedPropertyName: prop.relation?.syncedPropertyName || null,
          syncedPropertyId: prop.relation?.syncedPropertyId || null,
        });
      }
      if (prop.type === "rollup") {
        rollups.push({
          sourceName: database.name,
          sourceDataSourceId: database.dataSourceId,
          propertyName: prop.name,
          propertyId: prop.id,
          function: prop.rollup?.function || null,
          relationPropertyName: prop.rollup?.relationPropertyName || null,
          relationPropertyId: prop.rollup?.relationPropertyId || null,
          relationTargetName: prop.rollup?.relationTargetName || null,
          relationTargetDataSourceId: prop.rollup?.relationTargetDataSourceId || null,
          rollupPropertyName: prop.rollup?.rollupPropertyName || null,
          rollupPropertyId: prop.rollup?.rollupPropertyId || null,
        });
      }
    }
  }

  const schema = {
    generatedAt: new Date().toISOString(),
    sourceMarkdownPath,
    sourcePage: {
      title: "数据管理",
      pageId: process.env.FIOS_HUB_PAGE_ID || "",
    },
    readOnlyNotice:
      "Generated with ntn CLI read-only API calls: v1/data_sources/<id> and v1/databases/<id>.",
    databaseCount: databases.length,
    stats: {
      propertyCount: databases.reduce((sum, item) => sum + item.propertyCount, 0),
      relationCount: relations.length,
      rollupCount: rollups.length,
      formulaCount: databases.reduce((sum, item) => sum + item.formulaCount, 0),
    },
    databases,
    relations,
    rollups,
  };

  const schemaJson = `${JSON.stringify(schema, null, 2)}\n`;
  const schemaMarkdown = buildMarkdown(schema);

  fs.writeFileSync(path.join(outputDir, "notion-system-schema.json"), schemaJson);
  fs.writeFileSync(path.join(outputDir, "Notion系统数据库结构说明.md"), schemaMarkdown);
  fs.writeFileSync(path.join(skillReferencesDir, "notion-system-schema.json"), schemaJson);
  fs.writeFileSync(path.join(skillReferencesDir, "notion-system-schema.md"), schemaMarkdown);

  console.error("Wrote:");
  console.error(`- ${path.join(outputDir, "notion-system-schema.json")}`);
  console.error(`- ${path.join(outputDir, "Notion系统数据库结构说明.md")}`);
  console.error(`- ${path.join(skillReferencesDir, "notion-system-schema.json")}`);
  console.error(`- ${path.join(skillReferencesDir, "notion-system-schema.md")}`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
