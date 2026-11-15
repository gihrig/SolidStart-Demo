# Architecture Decision Records

One decision per file, titled with the decision itself. `GLOSSARY.md` cites
ADRs inline where a topic comes up; this table is the flat "what has been
decided" view.

- **An ADR states the current decision.** Change the ADR text in place; git
  keeps the history. Addenda are not permitted.
- **Numbers stay stable.** When an ADR becomes obsolete, delete it, and leave
  its number unused for all time.
- **A reversal is a new ADR.** Delete the old file. The new ADR has one line,
  `Replaces ADR-NNNN`, and lists the old decision as a rejected option.

An ADR without a `_Status: Proposed_` line is Accepted.

> **Generated file — do not edit by hand.** Regenerate with `cgs adr:index`
> (from the repo root); CI verifies it is current via `cgs adr:index:check`.

| #   | Decision | Status |
| --- | -------- | ------ |
| [0008](0008-keep-solidstart-leptos-tradeoff.md) | SolidStart for the front-end; Full-Rust (Leptos / Topcoat) as a trade-off study | Accepted |
| [0010](0010-monorepo-structure.md) | Merge the front-end and back-end into one mono-repo (`frontend/` + `backend/`) | Accepted |
| [0011](0011-jedi-backend-domain-contract.md) | The back-end owns the Jedi domain contract | Accepted |
| [0012](0012-postgres-turso-db-swap-seam.md) | Swap Postgres ↔ Turso Database behind a compile-time feature flag over a portable-subset schema | Accepted |
| [0013](0013-in-browser-turso-server-sync.md) | Run an in-browser Turso Database that syncs to the server (optional, on the Turso build) | Accepted |
| [0014](0014-backend-row-scoped-authorization-seam.md) | Row-scoped authorization lives in a per-Bmc `access_scope` hook | Accepted |
| [0015](0015-realtime-push-authorization-at-subscribe-time.md) | Realtime push authorization lives at subscribe-time, reusing the read scope | Accepted |
| [0016](0016-poke-rule-typed-receipt.md) | The Poke rule is enforced by a typed poke receipt, not a source-scan guard | Accepted |
| [0019](0019-layered-user-text-sanitization.md) | User input is defended in layers: reject on write, sanitize on read, escape at sinks | Accepted |
| [0020](0020-collapse-channel-vocabulary.md) | One generated Channel type; channel names track domain names | Accepted |
| [0021](0021-public-projection-surface-selected.md) | The public read is a per-entity public projection, audit visibility selected by surface | Accepted |
| [0022](0022-fullstack-sbom-vuln-scanning-syft-grype.md) | Full-stack SBOM + vulnerability scanning with syft + grype; Snyk abandoned | Accepted |
| [0026](0026-realtime-feed-in-lib-web-contract-in-lib-core.md) | The back-end follows the rust10x blueprint; code the blueprint lacks goes into the libs | Accepted |
| [0027](0027-backend-integers-cross-seam-as-number.md) | Back-end integers cross the contract seam as `number`, emitted by ts-rs | Accepted |
| [0028](0028-feed-subscriptions-by-channel.md) | One client Feed; Subscriptions are held by Channel over a swappable transport | Accepted |
| [0029](0029-rpc-contract-from-handler-signatures.md) | The RPC contract is read from the handler signatures and pinned by one test | Accepted |
| [0030](0030-unsaved-draft-guard.md) | Unsaved Drafts are guarded by one app-level guard | Accepted |
| [0032](0032-delete-cascades-to-every-row-under-it.md) | A Post or Caption delete cascades to every row under it, other Users' rows too | Accepted |
| [0033](0033-saved-theme-in-an-httponly-cookie.md) | The saved theme lives in an HttpOnly cookie that the server renders | Accepted |
| [0034](0034-one-https-edge-for-dev-and-e2e.md) | One HTTPS edge serves dev and e2e, as in production | Accepted |
