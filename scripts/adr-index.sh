#!/usr/bin/env bash
#
# Single source for the ADR index (ADR-0010 command surface).
# Extracts number + H1 title + status from docs/adr/NNNN-*.md and renders it as
# either the committed Markdown index or a console table. No hand-maintained list.
#
#   scripts/adr-index.sh write   # regenerate docs/adr/README.md         (cgs adr:index)
#   scripts/adr-index.sh check   # fail if README.md is stale (CI guard) (cgs adr:index:check)
#   scripts/adr-index.sh list    # print an aligned table to stdout      (cgs adr:list)
#
# Status is inferred, not hand-tracked:
#   "Superseded by [ADR-NNNN]" anywhere in a file -> Superseded by NNNN
#   "superseded-in-part"                          -> Accepted (amended)
#   otherwise                                     -> Accepted
set -euo pipefail

# Resolve repo root from this script's location so it runs from any cwd.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ADR_DIR="$ROOT/docs/adr"
README="$ADR_DIR/README.md"

mode="${1:-list}"

# Emit one TSV record per ADR: number <TAB> file <TAB> title <TAB> status.
# Every renderer reads from this, so extraction lives in exactly one place.
extract() {
  local f base num title status sup
  for f in "$ADR_DIR"/[0-9]*.md; do
    base="$(basename "$f")"
    num="${base%%-*}"
    title="$(sed -n '1s/^# //p' "$f")"
    if grep -qiE 'superseded by \[adr-[0-9]{4}\]' "$f"; then
      sup="$(grep -oiE 'superseded by \[adr-[0-9]{4}\]' "$f" | head -1 | grep -oE '[0-9]{4}')"
      status="Superseded by $sup"
    elif grep -qi 'superseded-in-part' "$f"; then
      status="Accepted (amended)"
    else
      status="Accepted"
    fi
    printf '%s\t%s\t%s\t%s\n' "$num" "$base" "$title" "$status"
  done
}

render_markdown() {
  cat <<'EOF'
# Architecture Decision Records

One decision per file, titled with the decision itself. Numbered and immutable
once accepted — a reversal is a **new** ADR that supersedes the old one, never an
edit. `CONTEXT.md` cites ADRs inline where a topic comes up; this table is the
flat "what has been decided" view.

> **Generated file — do not edit by hand.** Regenerate with `cgs adr:index`
> (from the repo root); CI verifies it is current via `cgs adr:index:check`.

| #   | Decision | Status |
| --- | -------- | ------ |
EOF
  # Turn an inferred status into a linked one where it references another ADR.
  extract | while IFS=$'\t' read -r num file title status; do
    local sup supfile linked
    if [[ "$status" == Superseded\ by\ * ]]; then
      sup="${status##* }"
      supfile="$(basename "$(ls "$ADR_DIR/$sup"-*.md 2>/dev/null | head -1)")"
      if [[ -n "$supfile" ]]; then
        linked="Superseded by [$sup]($supfile)"
      else
        linked="$status"
      fi
    else
      linked="$status"
    fi
    printf '| [%s](%s) | %s | %s |\n' "$num" "$file" "$title" "$linked"
  done
}

render_console() {
  { printf 'ADR\tStatus\tDecision\n';
    extract | while IFS=$'\t' read -r num file title status; do
      printf '%s\t%s\t%s\n' "$num" "$status" "$title"
    done
  } | column -t -s $'\t'
}

case "$mode" in
  write)
    render_markdown > "$README"
    echo "Wrote $README"
    ;;
  check)
    if ! diff -u "$README" <(render_markdown) >/dev/null 2>&1; then
      echo "ADR index is stale. Run 'cgs adr:index' and commit docs/adr/README.md." >&2
      diff -u "$README" <(render_markdown) >&2 || true
      exit 1
    fi
    echo "ADR index is current."
    ;;
  list)
    render_console
    ;;
  *)
    echo "usage: adr-index.sh {write|check|list}" >&2
    exit 2
    ;;
esac
