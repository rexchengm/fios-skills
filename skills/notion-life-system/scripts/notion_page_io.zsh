#!/bin/zsh
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  notion_page_io.zsh id <page-url-or-id>
  notion_page_io.zsh get <page-url-or-id> [output.md]
  notion_page_io.zsh append <page-url-or-id> [content.md]
  notion_page_io.zsh replace <page-url-or-id> [content.md]

Modes:
  id       Extract and print the Notion page ID.
  get      Read a page as Markdown. Write to stdout or output.md.
  append   Append Markdown content to the existing page body.
  replace  Replace page body with Markdown content.

append/replace read content from content.md when provided, otherwise stdin.
append/replace create a local Markdown backup before writing.
EOF
}

if [[ $# -lt 2 ]]; then
  usage >&2
  exit 2
fi

MODE="$1"
TARGET="$2"
CONTENT_PATH="${3:-}"
# Direct connection by default. Set NOTION_CLI_PROXY=http://host:port to route via a proxy.
PROXY="${NOTION_CLI_PROXY:-}"
BACKUP_DIR="${NOTION_PAGE_BACKUP_DIR:-${FIOS_DATA_DIR:-$HOME/.fios}/notion-page-backups}"

extract_page_id() {
  local target="$1"
  local cleaned last_segment id
  cleaned="${target%%\?*}"
  cleaned="${cleaned%%#*}"
  last_segment="${cleaned:t}"

  id="$(print -r -- "$last_segment" | perl -ne '
    if (/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/) {
      print $1;
      exit;
    }
    if (/([0-9a-fA-F]{32})/) {
      print $1;
      exit;
    }
  ')"

  if [[ -z "$id" ]]; then
    id="$(print -r -- "$cleaned" | perl -ne '
      if (/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/) {
        print $1;
        exit;
      }
      if (/([0-9a-fA-F]{32})/) {
        print $1;
        exit;
      }
    ')"
  fi

  if [[ -z "$id" ]]; then
    echo "Could not extract a Notion page ID from: $target" >&2
    exit 2
  fi

  print -r -- "$id"
}

run_ntn() {
  if [[ -n "$PROXY" ]]; then
    export HTTP_PROXY="$PROXY"
    export HTTPS_PROXY="$PROXY"
    export http_proxy="$PROXY"
    export https_proxy="$PROXY"
  fi
  ntn "$@"
}

# Robust `ntn pages get` with retry. ntn intermittently fails with
# "error: Failed to execute public API request" — exit=5 AND the error text
# is written to stdout (not stderr). Without retry+validation, callers will
# silently treat that error string as the page body.
robust_get() {
  local id="$1"
  local out_path="$2"
  local attempts="${NOTION_RETRY_ATTEMPTS:-5}"
  local delay="${NOTION_RETRY_DELAY:-2}"
  local i
  for (( i = 1; i <= attempts; i++ )); do
    if run_ntn pages get "$id" > "$out_path" 2>/dev/null; then
      if [[ -s "$out_path" ]] && ! head -n 1 "$out_path" | grep -q "^error:"; then
        return 0
      fi
    fi
    if (( i < attempts )); then
      sleep "$delay"
    fi
  done
  echo "robust_get: failed to get page $id after $attempts attempts" >&2
  return 1
}

# Robust `ntn pages update` with retry. Same intermittent-failure pattern as get.
robust_update() {
  local id="$1"
  local src="$2"
  local attempts="${NOTION_RETRY_ATTEMPTS:-5}"
  local delay="${NOTION_RETRY_DELAY:-2}"
  local i
  local result
  for (( i = 1; i <= attempts; i++ )); do
    if result=$(run_ntn pages update "$id" < "$src" 2>&1); then
      if ! grep -q "^error:" <<< "$result"; then
        print -r -- "$result"
        return 0
      fi
    fi
    if (( i < attempts )); then
      sleep "$delay"
    fi
  done
  echo "robust_update: failed to update page $id after $attempts attempts" >&2
  return 1
}

read_content() {
  local content_path="$1"
  if [[ -n "$content_path" ]]; then
    cat "$content_path"
    return
  fi

  if [[ -t 0 ]]; then
    echo "No content file was provided and stdin is empty." >&2
    exit 2
  fi

  cat
}

PAGE_ID="$(extract_page_id "$TARGET")"

case "$MODE" in
  id)
    print -r -- "$PAGE_ID"
    ;;
  get)
    if [[ -n "$CONTENT_PATH" ]]; then
      robust_get "$PAGE_ID" "$CONTENT_PATH"
      print -r -- "$CONTENT_PATH"
    else
      tmp_get="$(mktemp)"
      trap 'rm -f "$tmp_get"' EXIT
      robust_get "$PAGE_ID" "$tmp_get"
      cat "$tmp_get"
    fi
    ;;
  append|replace)
    mkdir -p "$BACKUP_DIR"
    timestamp="$(date +%Y%m%d-%H%M%S)"
    backup_path="$BACKUP_DIR/${PAGE_ID}-${timestamp}.md"
    current_path="$(mktemp)"
    body_path="$(mktemp)"
    content_tmp="$(mktemp)"
    output_tmp="$(mktemp)"
    trap 'rm -f "$current_path" "$body_path" "$content_tmp" "$output_tmp"' EXIT

    robust_get "$PAGE_ID" "$current_path"
    cp "$current_path" "$backup_path"

    # Strip frontmatter — `ntn pages get` prepends properties as YAML frontmatter,
    # but `ntn pages update` writes raw body (no frontmatter parsing). Including
    # frontmatter in the update payload corrupts the page (becomes body text).
    awk '
      NR == 1 && $0 == "---" { in_fm = 1; next }
      in_fm && $0 == "---"   { in_fm = 0; next }
      !in_fm                 { print }
    ' "$current_path" > "$body_path"

    read_content "$CONTENT_PATH" > "$content_tmp"

    if [[ "$MODE" == "append" ]]; then
      cat "$body_path" > "$output_tmp"
      if [[ -s "$body_path" ]]; then
        printf '\n\n' >> "$output_tmp"
      fi
      cat "$content_tmp" >> "$output_tmp"
      printf '\n' >> "$output_tmp"
    else
      cat "$content_tmp" > "$output_tmp"
    fi

    robust_update "$PAGE_ID" "$output_tmp" >/dev/null
    print -r -- "page_id=$PAGE_ID"
    print -r -- "backup=$backup_path"
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
