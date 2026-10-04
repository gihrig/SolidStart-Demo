#!/usr/bin/env bash
#
# Project-wide vulnerability list. Scans the committed
# CycloneDX SBOM with grype and all findings across both
# ecosystems (Rust back-end + TypeScript front-end).
# Shows both vex logged and new vulnerabilities.
grype "sbom:sbom.cdx.json" -o json | jq -r '.matches[] | "\(.vulnerability.severity)\t\(.artifact.purl)\t\(.vulnerability.id)"'
