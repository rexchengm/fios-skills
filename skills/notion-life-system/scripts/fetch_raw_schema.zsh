#!/bin/zsh
set -euo pipefail

FIOS_DATA_DIR="${FIOS_DATA_DIR:-$HOME/.fios}"
SOURCE_MD="${1:-$FIOS_DATA_DIR/数据管理.page.md}"
OUTPUT_DIR="${2:-$FIOS_DATA_DIR/notion-system-structure}"
# Direct connection by default. Set NOTION_CLI_PROXY=http://host:port to route via a proxy.
PROXY="${NOTION_CLI_PROXY:-}"
TIMEOUT_SECONDS="${NOTION_CLI_TIMEOUT_SECONDS:-60}"

RAW_DATA_SOURCES_DIR="$OUTPUT_DIR/raw-data-sources"
RAW_DATABASES_DIR="$OUTPUT_DIR/raw-databases"
MANIFEST="$OUTPUT_DIR/manifest.tsv"

mkdir -p "$RAW_DATA_SOURCES_DIR" "$RAW_DATABASES_DIR"

sanitize_file_part() {
  perl -e '
    my $value = join(" ", @ARGV);
    $value =~ s/[^\p{L}\p{N}._-]+/-/g;
    $value =~ s/^-+|-+$//g;
    print substr($value, 0, 80);
  ' "$1"
}

run_ntn_json() {
  local endpoint="$1"
  local output_path="$2"
  local tmp_path="$output_path.tmp"
  local attempt exit_code pid watchdog

  for attempt in 1 2 3; do
    rm -f "$tmp_path"
    (
      if [[ -n "$PROXY" ]]; then
        export HTTP_PROXY="$PROXY"
        export HTTPS_PROXY="$PROXY"
        export http_proxy="$PROXY"
        export https_proxy="$PROXY"
      fi
      ntn api "$endpoint" > "$tmp_path" < /dev/null
    ) &
    pid=$!

    (
      sleep "$TIMEOUT_SECONDS"
      kill -TERM "$pid" 2>/dev/null || true
    ) &
    watchdog=$!

    set +e
    wait "$pid"
    exit_code=$?
    set -e
    kill "$watchdog" 2>/dev/null || true

    if [[ "$exit_code" -eq 0 ]] && jq empty "$tmp_path" >/dev/null 2>&1; then
      mv "$tmp_path" "$output_path"
      return 0
    fi

    rm -f "$tmp_path"
    sleep "$attempt"
  done

  echo "Failed to fetch $endpoint" >&2
  return 1
}

print $'index\tname\tdatabasePageId\tdataSourceId\tdataSourceFile\tdatabaseFile' > "$MANIFEST"

perl -0777 -ne '
  my $i = 0;
  while (/<database\s+[^>]*url="https:\/\/www\.notion\.so\/([^"]+)"[^>]*data-source-url="collection:\/\/([^"]+)"[^>]*>([\s\S]*?)<\/database>/g) {
    my ($db, $ds, $name) = ($1, $2, $3);
    $db =~ s/[?#\/].*$//;
    $name =~ s/<[^>]+>//g;
    $name =~ s/&amp;/&/g;
    $name =~ s/&lt;/</g;
    $name =~ s/&gt;/>/g;
    $name =~ s/&quot;/"/g;
    $name =~ s/&#39;/'"'"'/g;
    $name =~ s/^\s+|\s+$//g;
    next if $seen{$ds}++;
    $i++;
    print join("\t", $i, $name, $db, $ds), "\n";
  }
' "$SOURCE_MD" | while IFS=$'\t' read -r index name database_page_id data_source_id; do
  base_file="$(printf "%02d-%s" "$index" "$data_source_id")"
  data_source_file="$base_file.json"
  database_file="$base_file.json"

  echo "[$index] Reading $name"
  run_ntn_json "v1/data_sources/$data_source_id" "$RAW_DATA_SOURCES_DIR/$data_source_file"
  run_ntn_json "v1/databases/$database_page_id" "$RAW_DATABASES_DIR/$database_file"
  print "$index\t$name\t$database_page_id\t$data_source_id\t$data_source_file\t$database_file" >> "$MANIFEST"
  echo "[$index] Done $name"
done

echo "Wrote $MANIFEST"
