#!/usr/bin/env bash
#
# Test for the release-binary dependency embedding (cargo-auditable, #141,
# ADR-0022 / spec #137, T5). cargo-auditable is a build integration, not a
# gate: it embeds the dependency list into the compiled binary so a shipped
# binary can be audited after the fact (`cargo audit bin`). This test proves
# the two external behaviours the `cgs auditable` recipe and the CI job rely on:
#   1. Embedded    — a binary built with `cargo auditable build` carries its
#                    dependency list; `cargo audit bin` finds it.
#   2. Not embedded — a plain `cargo build` binary carries no list; `cargo audit
#                    bin` reports the report is incomplete.
# Both cases run against a tiny throwaway crate in a temp dir, so the test is
# fast and never touches the real workspace. Like the other gate tests
# (cargo-audit.test.sh), `cargo audit bin` fetches the advisory DB; this test
# reads the embedding marker, so the advisory result itself does not matter.
#
# A case asserts the exact cargo-audit marker line, not just an exit code.
# `cargo audit bin` also exits non-zero on a real advisory in the embedded
# deps, so an exit-code-only test would confuse "no embedded data" with
# "a vulnerable dependency". Grepping the marker tells the two apart.
#
#   scripts/cargo-auditable.test.sh
set -euo pipefail

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# A minimal crate with one pinned dependency. `itoa` is tiny, pure Rust, and
# carries no advisory, so the scan result is deterministic.
mkdir -p "$work/src"
cat > "$work/Cargo.toml" <<'EOF'
[package]
name = "auditable_probe"
version = "0.0.0"
edition = "2021"

[dependencies]
itoa = "=1.0.11"
EOF
printf 'fn main() { let mut b = itoa::Buffer::new(); println!("{}", b.format(42u32)); }\n' > "$work/src/main.rs"

BIN="$work/target/debug/auditable_probe"

# Run `cargo audit bin` over $BIN. Sets REPORT (combined stdout+stderr). The
# `|| true` guards set -e: the scan exits non-zero on any advisory, but this
# test reads the embedding marker, not the advisory result.
scan() {
  REPORT="$(cargo audit bin "$BIN" 2>&1)" || true
}

echo "1/2 not embedded: a plain build carries no dependency list"
( cd "$work" && cargo build --quiet )
scan
if ! grep -q "was not built with 'cargo auditable'" <<<"$REPORT"; then
  echo "FAIL: a plain binary was not detected as lacking embedded data." >&2
  echo "$REPORT" >&2
  exit 1
fi
echo "  ok — plain binary carries no list"

echo "2/2 embedded: a cargo-auditable build carries the dependency list"
( cd "$work" && cargo auditable build --quiet )
scan
if ! grep -q "Found 'cargo auditable' data" <<<"$REPORT"; then
  echo "FAIL: a cargo-auditable binary was not detected as carrying embedded data." >&2
  echo "$REPORT" >&2
  exit 1
fi
echo "  ok — auditable binary carries the list"

echo "PASS"
