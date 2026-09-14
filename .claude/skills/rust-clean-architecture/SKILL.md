---
name: rust-clean-architecture
description: Enforce clean Rust code architecture following Jeremy Chone rust-10x patterns. Use for Rust projects, module layout, mod.rs rules, workspace structure, crate organization, clean architecture, production coding, or when creating/refactoring Rust modules and crates.
---

# Rust Clean Architecture (rust-10x style)

Apply Jeremy Chone's rust-10x production patterns for scalable, maintainable Rust codebases.

## Core Module Rules (strict)

1. **Always use the `module/mod.rs` form**
   - Directory + `mod.rs` for any module that has (or may have) children.
   - Never use the modern `module.rs` + `module/` sibling style.
   - Example:

```text
src/
  model/
    mod.rs          # only imports + re-exports
    task.rs
    user.rs
  task/
    mod.rs
    bmc.rs
```

2. **`mod.rs` files are limited to dependency import/export only**

   - Allowed content in any `mod.rs`:
     - `mod` declarations (`mod foo;`, `pub mod bar;`)
     - `use` / `pub use` re-exports
     - Minimal attributes (`#![allow(...)]`, `#[cfg(...)]`) if required for the module
     - Short module-level doc comments (`//!`)
   - **Forbidden** in `mod.rs`:
     - Function, struct, enum, trait, or impl definitions
     - Business logic, constants with non-trivial values, macros
     - Anything that is not pure module wiring / public API surface
   - Put real code in sibling files (`foo.rs`) or deeper submodules.

3. **Public API is curated at every level**

   - Prefer explicit `pub use` in `mod.rs` over making everything public deeper.
   - Keep internal implementation details private (`pub(crate)` or private).

## Project / Workspace Structure (rust-10x)

Follow the multi-crate workspace layout used in rust-web-app:

```text
project/
├── Cargo.toml                # workspace root
├── crates/
│   ├── libs/                 # reusable application libraries
│   │   ├── lib-core/         # domain + model + store
│   │   ├── lib-utils/
│   │   ├── lib-auth/
│   │   └── ...
│   ├── services/             # runnable services
│   │   └── web-server/
│   └── tools/                # CLIs, generators, etc.
└── ...
```

- Prefix application libraries with `lib-` (e.g. `lib-core`, `lib-rpc`).
- Keep services thin; put shared logic in `crates/libs/`.
- Prefer one primary domain model crate (`lib-core`) that owns entities, BMCs (Business Model Controllers), and store abstractions.

## Layering Guidelines

- **Domain / Model** (`lib-core`): entities, value objects, BMC methods, pure business rules. No web or infrastructure details.
- **Infrastructure**: DB, external services, file system — behind traits or thin adapters.
- **Application / Service**: orchestration, use-cases, RPC or HTTP handlers.
- **Presentation**: Axum/Tower handlers, JSON-RPC, CLI — thin and delegating.

Prefer composition and explicit dependency injection (pass `ModelManager`, `Ctx`, etc.) over globals or deep service locators.

## Naming & Conventions

- BMC = Business Model Controller (the place that owns CRUD + domain operations for an entity).
- Use `Ctx` for request-scoped context (user, tenant, etc.).
- Prefer `Result<T>` with a well-designed error type hierarchy (often using `thiserror` + context).
- Keep files focused: one primary type or cohesive set of functions per file when practical.

## When Generating or Refactoring Code

- Always create the directory + `mod.rs` pair for new modules that will contain code.
- Immediately put only wiring in the new `mod.rs`.
- Move any logic out of existing `mod.rs` files into proper sibling modules.
- Preserve the rust-10x crate layout when starting or expanding a workspace.
- Favor explicit, readable module trees over deep nesting or clever macros for module declaration.

## References

Primary sources:

- https://rust10x.com
- https://github.com/rust10x/rust-web-app
- https://github.com/rust10x
- Jeremy Chone YouTube channel (production coding series)

This skill deliberately restricts `mod.rs` content more strictly than general Rust practice in order to keep module boundaries crystal-clear for both humans and AI agents.
