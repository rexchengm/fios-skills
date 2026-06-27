#!/bin/zsh
# FIOS 初始化编排脚本
# 把买家自己那份 FIOS 的结构绑定到本机技能：导出 hub 页 → 重建 schema → 重建入库规则 → 发现 10 个维度页 → 自检。
# 全程只读买家 Notion 结构（v1/data_sources/<id>、v1/databases/<id>、v1/blocks 导出），不修改任何 Notion 数据。
#
# 用法：  fios_init.zsh <hub页URL或ID>
# 依赖：  已安装并配置好 ntn CLI（带买家自己的 Notion integration token），node、jq、python3。
set -euo pipefail

HUB="${1:-}"
if [[ -z "$HUB" ]]; then
  echo "用法: fios_init.zsh <FIOS hub页(数据管理)的URL或ID>" >&2
  exit 2
fi

SELF_DIR="${0:A:h}"                      # .../notion-fios-init/scripts
INIT_DIR="${SELF_DIR:h}"                 # .../notion-fios-init
SKILLS_ROOT="${INIT_DIR:h}"              # .../skills
SYS="$SKILLS_ROOT/notion-life-system"    # 底座技能（脚本+references 都在这）

FIOS_DATA_DIR="${FIOS_DATA_DIR:-$HOME/.fios}"
SRC_MD="$FIOS_DATA_DIR/数据管理.page.md"
OUT_DIR="$FIOS_DATA_DIR/notion-system-structure"
mkdir -p "$FIOS_DATA_DIR" "$OUT_DIR" "$SYS/references"

if [[ ! -d "$SYS/scripts" ]]; then
  echo "❌ 找不到底座技能 notion-life-system（期望在 $SYS）。请确认 6 个技能都装在同一个 skills 目录下。" >&2
  exit 1
fi

echo "▶ [1/5] 导出你的 FIOS hub 页 → $SRC_MD"
"$SYS/scripts/notion_page_io.zsh" get "$HUB" "$SRC_MD"
db_count=$(grep -c '<database' "$SRC_MD" || true)
echo "   hub 页含 $db_count 个数据库引用。"
if [[ "$db_count" -lt 1 ]]; then
  echo "❌ hub 页里没解析到任何 <database> 引用。确认你给的是 FIOS 的「数据管理」hub 页、且已分享给 integration。" >&2
  exit 1
fi

echo "▶ [2/5] 拉取每个库的结构（只读 schema）→ $OUT_DIR"
"$SYS/scripts/fetch_raw_schema.zsh" "$SRC_MD" "$OUT_DIR"

echo "▶ [3/5] 重建 notion-system-schema.json → $SYS/references/"
SKILL_DIR="$SYS" NOTION_SCHEMA_BUILD_ONLY=1 node "$SYS/scripts/refresh_schema.js" "$SRC_MD" "$OUT_DIR" --build-only

echo "▶ [4/5] 重建 notion-intake-rules.json（入库路由规则）→ $SYS/references/"
node "$SYS/scripts/build_intake_rules.js"

echo "▶ [5/5] 自检结构 + 发现 10 个维度页 → fios-dimension-pages.json"
node "$SELF_DIR/build_dimension_pages.js"

echo ""
echo "✅ 初始化完成。已绑定到你自己的 FIOS。生成物："
echo "   - $SYS/references/notion-system-schema.json"
echo "   - $SYS/references/notion-intake-rules.json"
echo "   - $SYS/references/fios-dimension-pages.json"
echo "现在可以用 notion-life-capture / cascade / insights / reflection / fios-status 了。"
