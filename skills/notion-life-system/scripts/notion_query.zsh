#!/bin/zsh
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  notion_query.zsh <db_name> [limit] [--format tsv|md|json] [--full] [--include-archived]
  notion_query.zsh --list

Reads queryDefaults from references/notion-intake-rules.json and runs a
sorted, field-pruned, archive-filtered query against the named database via `ntn api`.

Args:
  <db_name>           Chinese database name (e.g. 目标设定, 任务执行).
  limit               Max records to return. Default: queryDefaults.pageSize (25).
  --format tsv|md|json
                      Output format. tsv (default) prints one record per line with
                      a header row. md prints a Markdown table. json prints the
                      extracted fields as JSON.
  --full              Return the raw Notion API response instead of the pruned
                      fields. Use only when you need rollups, formulas, or other
                      fields not in queryDefaults.displayFields.
  --include-archived  Include rows where the database's archive checkbox (e.g.
                      归档 / 已归档 / 知识归档) is true. By default these rows are
                      filtered out. No-op for databases without an archive field.
  --list              List all known database names with their queryDefaults.

Stderr hints (do not interfere with stdout pipelines):
  - "... (has_more=true; ...)"  if there are more records than the current limit.
  - "(filtered: <field> != true; ...)" when the default archive filter is active.

Examples:
  notion_query.zsh 目标设定
  notion_query.zsh 任务执行 50
  notion_query.zsh 目标设定 --include-archived
  notion_query.zsh 支出事项 5 --format md
  notion_query.zsh 助手管理 --full | jq '.results[0].properties'
EOF
}

SCRIPT_DIR="${0:A:h}"
RULES_JSON="${SCRIPT_DIR}/../references/notion-intake-rules.json"
# Direct connection by default. Set NOTION_CLI_PROXY=http://host:port to route via a proxy.
PROXY="${NOTION_CLI_PROXY:-}"

if [[ ! -f "$RULES_JSON" ]]; then
  echo "intake-rules.json not found at: $RULES_JSON" >&2
  exit 2
fi

if [[ $# -eq 0 ]]; then
  usage >&2
  exit 2
fi

if [[ "$1" == "--list" ]]; then
  jq -r '.databases[] | "\(.name)\t\(.queryDefaults.sortBy)/\(.queryDefaults.sortField)\t\(.queryDefaults.displayFields | map(.name) | join(","))"' "$RULES_JSON" \
    | column -t -s $'\t'
  exit 0
fi

DB_NAME="$1"
shift

LIMIT=""
FORMAT="tsv"
FULL=0
INCLUDE_ARCHIVED=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --format)
      shift
      [[ $# -gt 0 ]] || { echo "--format needs an argument" >&2; exit 2; }
      FORMAT="$1"
      shift
      ;;
    --full)
      FULL=1
      shift
      ;;
    --include-archived)
      INCLUDE_ARCHIVED=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      if [[ -z "$LIMIT" && "$1" =~ ^[0-9]+$ ]]; then
        LIMIT="$1"
        shift
      else
        echo "Unknown argument: $1" >&2
        usage >&2
        exit 2
      fi
      ;;
  esac
done

DB_JSON="$(jq --arg name "$DB_NAME" '.databases[] | select(.name == $name)' "$RULES_JSON")"
if [[ -z "$DB_JSON" ]]; then
  echo "Database not found in intake-rules: $DB_NAME" >&2
  echo "Run with --list to see all known names." >&2
  exit 2
fi

DATA_SOURCE_ID="$(echo "$DB_JSON" | jq -r '.dataSourceId')"
SORT_BY="$(echo "$DB_JSON" | jq -r '.queryDefaults.sortBy')"
SORT_FIELD="$(echo "$DB_JSON" | jq -r '.queryDefaults.sortField')"
SORT_DIR="$(echo "$DB_JSON" | jq -r '.queryDefaults.sortDirection')"
DEFAULT_LIMIT="$(echo "$DB_JSON" | jq -r '.queryDefaults.pageSize')"
LIMIT="${LIMIT:-$DEFAULT_LIMIT}"
ARCHIVE_FIELD="$(echo "$DB_JSON" | jq -r '.queryDefaults.archiveField.name // empty')"

if [[ "$SORT_BY" == "timestamp" ]]; then
  SORT_OBJ="{\"timestamp\":\"$SORT_FIELD\",\"direction\":\"$SORT_DIR\"}"
else
  SORT_OBJ="{\"property\":\"$SORT_FIELD\",\"direction\":\"$SORT_DIR\"}"
fi

# Build body. If db has an archive field and --include-archived not set, filter out archived rows.
if [[ -n "$ARCHIVE_FIELD" && "$INCLUDE_ARCHIVED" -eq 0 ]]; then
  FILTER_OBJ="$(jq -nc --arg prop "$ARCHIVE_FIELD" '{property:$prop, checkbox:{equals:false}}')"
  BODY="$(jq -nc --argjson sort "$SORT_OBJ" --argjson ps "$LIMIT" --argjson filter "$FILTER_OBJ" '{sorts:[$sort], page_size:$ps, filter:$filter}')"
else
  BODY="$(jq -nc --argjson sort "$SORT_OBJ" --argjson ps "$LIMIT" '{sorts:[$sort], page_size:$ps}')"
fi

if [[ -n "$PROXY" ]]; then
  export HTTP_PROXY="$PROXY"
  export HTTPS_PROXY="$PROXY"
  export http_proxy="$PROXY"
  export https_proxy="$PROXY"
fi

RAW_FILE="$(mktemp -t notion_query.XXXXXX)"
trap 'rm -f "$RAW_FILE"' EXIT

ntn api "v1/data_sources/${DATA_SOURCE_ID}/query" -d "$BODY" > "$RAW_FILE"

if [[ "$FULL" -eq 1 ]]; then
  cat "$RAW_FILE"
  exit 0
fi

FIELDS_JSON="$(echo "$DB_JSON" | jq '.queryDefaults.displayFields')"

# Build a jq expression that extracts the display fields from each result.
EXTRACT_EXPR="$(echo "$FIELDS_JSON" | jq -r '
  map(
    if .type == "title" then "(.properties[\"" + .name + "\"].title[0].plain_text // \"\")"
    elif .type == "rich_text" then "((.properties[\"" + .name + "\"].rich_text // []) | map(.plain_text) | join(\"\"))"
    elif .type == "status" then "(.properties[\"" + .name + "\"].status.name // \"\")"
    elif .type == "select" then "(.properties[\"" + .name + "\"].select.name // \"\")"
    elif .type == "multi_select" then "((.properties[\"" + .name + "\"].multi_select // []) | map(.name) | join(\",\"))"
    elif .type == "date" then "(.properties[\"" + .name + "\"].date.start // \"\")"
    elif .type == "number" then "((.properties[\"" + .name + "\"].number) // \"\" | tostring)"
    elif .type == "url" then "(.properties[\"" + .name + "\"].url // \"\")"
    elif .type == "checkbox" then "(.properties[\"" + .name + "\"].checkbox | tostring)"
    elif .type == "people" then "((.properties[\"" + .name + "\"].people // []) | map(.name // .id) | join(\",\"))"
    elif .type == "files" then "((.properties[\"" + .name + "\"].files // []) | map(.name) | join(\",\"))"
    elif .type == "email" then "(.properties[\"" + .name + "\"].email // \"\")"
    elif .type == "phone_number" then "(.properties[\"" + .name + "\"].phone_number // \"\")"
    else "\"\""
    end
  ) | join(", ")
')"

HEADER_KEYS="$(echo "$FIELDS_JSON" | jq -r 'map(.name) | join("\t")')"
PAGE_ID_EXPR='.id'

case "$FORMAT" in
  tsv)
    printf '%s\tpage_id\n' "$HEADER_KEYS"
    jq -r ".results[] | [${EXTRACT_EXPR}, ${PAGE_ID_EXPR}] | @tsv" "$RAW_FILE"
    ;;
  md)
    headers_arr=("${(@s:	:)HEADER_KEYS}")
    md_header="|"
    md_sep="|"
    for h in "${headers_arr[@]}"; do
      md_header+=" ${h} |"
      md_sep+="---|"
    done
    md_header+=" page_id |"
    md_sep+="---|"
    print -r -- "$md_header"
    print -r -- "$md_sep"
    jq -r ".results[] | [${EXTRACT_EXPR}, ${PAGE_ID_EXPR}] | map(. // \"\" | tostring | gsub(\"\\\\|\"; \"\\\\|\") | gsub(\"\\n\"; \"<br>\")) | \"| \" + join(\" | \") + \" |\"" "$RAW_FILE"
    ;;
  json)
    KEYS_JSON="$(echo "$FIELDS_JSON" | jq 'map(.name)')"
    jq --argjson keys "$KEYS_JSON" "[.results[] | { page_id: .id, fields: ([${EXTRACT_EXPR}] as \$vals | reduce range(0; \$vals|length) as \$i ({}; .[\$keys[\$i]] = \$vals[\$i])) }]" "$RAW_FILE"
    ;;
  *)
    echo "Unknown --format: $FORMAT (expected tsv|md|json)" >&2
    exit 2
    ;;
esac

# has_more hint — printed to stderr so it does not corrupt TSV/MD/JSON output.
HAS_MORE="$(jq -r '.has_more' "$RAW_FILE" 2>/dev/null)"
if [[ "$HAS_MORE" == "true" ]]; then
  print -r -- "... (has_more=true; pass a larger limit to see all)" >&2
fi
if [[ -n "$ARCHIVE_FIELD" && "$INCLUDE_ARCHIVED" -eq 0 ]]; then
  print -r -- "(filtered: $ARCHIVE_FIELD != true; use --include-archived to include)" >&2
fi
