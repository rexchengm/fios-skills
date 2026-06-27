#!/usr/bin/env node
// 1) 用刚生成的 schema 对照模板清单做结构自检（缺库/多库）
// 2) 发现 10 个维度页（第二大脑 + 9 监管，各自库里的那一行），写出 fios-dimension-pages.json
// 只读 Notion；不修改任何数据。

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const SCRIPTS_DIR = __dirname;                                  // .../notion-fios-init/scripts
const INIT_DIR = path.resolve(SCRIPTS_DIR, "..");              // .../notion-fios-init
const SKILLS_ROOT = path.resolve(SCRIPTS_DIR, "../..");        // .../skills
const SYS = path.join(SKILLS_ROOT, "notion-life-system");
const schemaPath = path.join(SYS, "references", "notion-system-schema.json");
const manifestPath = path.join(INIT_DIR, "fios-template-manifest.json");
const outPath = path.join(SYS, "references", "fios-dimension-pages.json");

const notionCliProxy = process.env.NOTION_CLI_PROXY || "";
const proxyEnv = notionCliProxy
  ? { ...process.env, HTTP_PROXY: notionCliProxy, HTTPS_PROXY: notionCliProxy, http_proxy: notionCliProxy, https_proxy: notionCliProxy }
  : { ...process.env };

function ntn(endpoint, bodyObj) {
  const args = ["api", endpoint];
  if (bodyObj) args.push("-d", JSON.stringify(bodyObj));
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const raw = execFileSync("ntn", args, { env: proxyEnv, maxBuffer: 64 * 1024 * 1024 });
      const cleaned = raw.toString("utf8").replace(/[\x00-\x1f\x7f]/g, (c) => (c === "\n" || c === "\t" ? c : ""));
      const json = JSON.parse(cleaned);
      if (json && json.object !== "error") return json;
    } catch (_) { /* retry */ }
  }
  return null;
}

if (!fs.existsSync(schemaPath)) {
  console.error(`❌ 找不到 ${schemaPath}。请先成功跑完前面的 schema 重建步骤。`);
  process.exit(1);
}
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

// ---------- 结构自检：库名对照 ----------
const expected = new Set(manifest.databases.map((d) => d.name));
const got = new Set(schema.databases.map((d) => d.name));
const missing = [...expected].filter((n) => !got.has(n));
const extra = [...got].filter((n) => !expected.has(n));

console.log(`结构自检：模板期望 ${expected.size} 个库，你的 FIOS 发现 ${got.size} 个。`);
if (missing.length) console.log(`  ⚠️ 缺少（模板有、你没发现）：${missing.join("、")}`);
if (extra.length) console.log(`  ℹ️ 额外（你有、模板清单没有，通常无害）：${extra.join("、")}`);
if (!missing.length) console.log("  ✓ 模板要求的库都在。");

// 可选：抽查几个关键库的 directFill 字段是否对得上（指纹兜底）
const byName = Object.fromEntries(schema.databases.map((d) => [d.name, d]));
const DIRECT = new Set(["title","rich_text","number","date","select","multi_select","status","url","checkbox","people","files","place","email","phone_number"]);
let fpWarn = 0;
for (const md of manifest.databases) {
  const live = byName[md.name];
  if (!live) continue;
  const liveFields = new Set(live.properties.filter((p) => DIRECT.has(p.type)).map((p) => p.name.trim()));
  const expFields = md.fields.map((f) => f.name);
  const lost = expFields.filter((n) => !liveFields.has(n));
  if (lost.length > Math.max(2, Math.ceil(expFields.length * 0.3))) {
    fpWarn++;
    console.log(`  ⚠️ 「${md.name}」字段差异较大（模板有但你库里没有：${lost.slice(0, 6).join("、")}${lost.length > 6 ? "…" : ""}）。可能是改过结构或匹配到了别的同名库。`);
  }
}
if (!fpWarn) console.log("  ✓ 抽查的库字段结构与模板一致。");

// ---------- 发现 10 个维度页 ----------
const DIMENSIONS = [
  { key: "dabrain", names: ["第二大脑"] },
  { key: "time", names: ["时间监管"] },
  { key: "knowledge", names: ["知识监管"] },
  { key: "social", names: ["人际监管", "社交监管"] },
  { key: "habit", names: ["习惯监管"] },
  { key: "finance", names: ["财务监管"] },
  { key: "travel", names: ["旅游监管"] },
  { key: "family", names: ["家庭监管"] },
  { key: "media", names: ["影视监管"] },
  { key: "review", names: ["复盘监管"] },
];

function titleOf(page) {
  for (const v of Object.values(page.properties || {})) {
    if (v.type === "title") return (v.title || []).map((t) => t.plain_text).join("");
  }
  return "";
}

const dimPages = {};
const dimMiss = [];
for (const dim of DIMENSIONS) {
  const db = dim.names.map((n) => byName[n]).find(Boolean);
  if (!db) { dimMiss.push(dim.names[0]); continue; }
  const res = ntn(`v1/data_sources/${db.dataSourceId}/query`, { page_size: 10 });
  const rows = (res && res.results) || [];
  if (!rows.length) { dimMiss.push(dim.names[0]); continue; }
  // 优先取标题等于维度名的那一行；否则取唯一/第一行
  const exact = rows.find((r) => dim.names.includes(titleOf(r).trim()));
  const chosen = exact || rows[0];
  dimPages[dim.key] = { name: dim.names[0], page_id: chosen.id, title: titleOf(chosen) };
}

const out = {
  generatedAt: new Date().toISOString(),
  note: "由 notion-fios-init 自动发现。每个维度=对应监管/第二大脑库里的那一行（其 page body 存放状态正文）。",
  dimensions: dimPages,
};
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");

console.log(`\n维度页发现：${Object.keys(dimPages).length}/10 → ${outPath}`);
for (const [k, v] of Object.entries(dimPages)) console.log(`  ${k.padEnd(9)} ${v.name}  ${v.page_id}`);
if (dimMiss.length) console.log(`  ⚠️ 未发现：${dimMiss.join("、")}（fios-status 用到对应维度时会提示你手动补 page_id）`);
