# Rust10x Web App Blueprint for Production Coding

More info at: https://rust10x.com/web-app
Discord: https://discord.gg/XuKWrNGKpC

# Note last commit with `modql 0.4.0-rc.4`

- There is a small change in the `SeaField::new(iden, value)` where the value is now `impl Into<SimpleExpr>`.
	- `so change:` `SeaField::new(UserIden::Pwd, pwd.into())`
	- `       to:` `SeaField::new(UserIden::Pwd, pwd)`

You can find this change in the `. update to modql 0.4.0-rc.4`

# IMPORTANT NOTE on E06 - 2024-01-23 BIG UPDATE

This update ([GitHub tag: E06](https://github.com/rust10x/rust-web-app/releases/tag/E06)) is significant in many respects:

- **1) Data Model Change**
	- We are transitioning from the simple `Project / Task` model to a more intricate one centered around AI chat, specifically `Agent, Conv / ConvMsg`.
	- Subsequently, we'll introduce `Org / Space` constructs to demonstrate multi-tenancy and a "workspace" type of container, common in many use cases (like GitHub repositories, Discord servers, etc.).
	- The `examples/quick_dev` has been updated to reflect the new data model.
	- IMPORTANT - While `Agent` and `Conv` concepts exist, the blueprint's purpose isn't to develop a complete AI chat system. Instead, it aims to illustrate the common structures needed to build such an application and others. The Agents are merely examples of entities and might later exhibit some "Echo" capability to demonstrate the integration of long-running, event-based services.

- **2) ModelManager DB Transaction Support**
	- There's a significant enhancement to the `ModelManager`, which now contains a `lib_core::model::store::Dbx` implementing an on-demand **database transaction** support.
	- By default, the ModelManager operates non-transactionally; each query executes as its own DB command. However, Bmc functions can transform a ModelManager into a transactional one and initiate/commit a transaction
		- Search for `mm.dbx().begin_txn()` for an example in `UserBmc::create`.

- **3) Declarative Macros**
	- To reduce boilerplate, this Rust10x blueprint now supports flexible declarative macros (i.e., `macro_rules`) at the `lib_rpc` and `lib_core::model` levels. These create the common basic CRUD JSON-RPC functions and the common BMC CRUD methods.
		- Search for `generate_common_bmc_fns` or `generate_common_rpc_fns` to see them in actions.
	- It's important to note that these declarative macros are additive and optional. In fact, entities can introduce additional behavior as needed or opt out of using these macros if custom logic is required, even for common behaviors.

- **4) Code Update**
	- All JSON-RPC responses now include a `.data` field as `result.data` to represent the requested data. This adds flexibility to later include metadata at the root of the `result` object (the JSON-RPC specification prohibits adding anything at the root of the JSON response).
		- This is in the `lib_rpc::response` crate/module.
	- The introduction of a `conv_id` in the `Ctx` paves the way for a future `Access Control System`, which will be privilege-based and tied to key container constructs (e.g., `Org`, `Space`, `Conv`).

## Rust10x Web App YouTube Videos:

- [Episode 01 - Rust Web App - Base Production Code](https://youtube.com/watch?v=3cA_mk4vdWY&list=PL7r-PXl6ZPcCIOFaL7nVHXZvBmHNhrh_Q)
    - [Topic video - Code clean -  `#[cfg_attr(...)]` for unit test](https://www.youtube.com/watch?v=DCPs5VRTK-U&list=PL7r-PXl6ZPcCIOFaL7nVHXZvBmHNhrh_Q)
	- [Topic video - The Reasoning Behind Differentiating ModelControllers and ModelManager](https://www.youtube.com/watch?v=JdLi69mWIIE&list=PL7r-PXl6ZPcCIOFaL7nVHXZvBmHNhrh_Q)
	- [Topic video - Base64Url - Understanding the Usage and Significance of Base64URL](https://www.youtube.com/watch?v=-9K7zNgsbP0&list=PL7r-PXl6ZPcCIOFaL7nVHXZvBmHNhrh_Q)

- [Episode 02 - Sea-Query (sql builder) & modql (mongodb like filter)](https://www.youtube.com/watch?v=-dMH9UiwKqg&list=PL7r-PXl6ZPcCIOFaL7nVHXZvBmHNhrh_Q)

- [Episode 03 - Cargo Workspace (multi-crates)](https://www.youtube.com/watch?v=zUxF0kvydJs&list=PL7r-PXl6ZPcCIOFaL7nVHXZvBmHNhrh_Q)
	- [AI-Voice-Remastered](https://www.youtube.com/watch?v=iCGIqEWWTcA&list=PL7r-PXl6ZPcCIOFaL7nVHXZvBmHNhrh_Q)

- [Episode 04 - Multi-Scheme Password Hashing](https://www.youtube.com/watch?v=3E0zK5h9zEs&list=PL7r-PXl6ZPcCIOFaL7nVHXZvBmHNhrh_Q)

- [Episode 05 - JSON-RPC Dynamic Router](https://www.youtube.com/watch?v=Gc5Nj5LJe1U&list=PL7r-PXl6ZPcCIOFaL7nVHXZvBmHNhrh_Q)

- **Episode 06 coming upon request on [discord](https://discord.gg/XuKWrNGKpC)**

- Other Related videos:
	- [Rust Axum Full Course](https://youtube.com/watch?v=XZtlD_m59sM&list=PL7r-PXl6ZPcCIOFaL7nVHXZvBmHNhrh_Q)


## Mono-repo & commands (ADR-0010)

This back-end is the `backend/` subtree of the [SolidStart Demo mono-repo](../CONTEXT.md)
(a SolidJS front-end in `frontend/` + this Rust/Axum back-end). See
[ADR-0010](../docs/adr/0010-monorepo-structure.md) for the structure.

- **Cross-cutting work** (both subtrees) runs from the **repo root** via `cgs`
  (`run-cargo-script` on the root `Scripts.toml`): `cgs dev`, `cgs build`,
  `cgs test`, `cgs check`, `cgs bindings`.
- **Single-side (back-end) work** runs by `cd backend/` and using `cgs <script>`
  against this subtree's `Scripts.toml` (`cgs` reads the `Scripts.toml` in the
  working directory). The recipes below are back-end single-side commands; run
  them from `backend/`.

Prefer the `cgs` recipes over raw `cargo`; the recipes wrap the exact `cargo`
invocations and keep flags consistent. Raw `cargo` stays available for one-offs
with no recipe.

## Starting the DB

```sh
# Start the Postgres docker image.
cgs db

# (optional) To have a psql terminal on pg.
# In another terminal (tab) run psql.
docker exec -it -u postgres pg psql

# (optional) For pg to print all sql statements.
# In psql command line started above.
ALTER DATABASE postgres SET log_statement = 'all';
```
> See `psql_commands.md`

## Dev (watch)

> NOTE: Install cargo watch with `cargo install cargo-watch`.

```sh
# Run the server in watch mode.
cgs dev-watch

# Run the Quick Dev framework once (no watch recipe).
cgs quick
```

## Dev

```sh
# Terminal 1 - To run the server.
cgs dev

# Terminal 2 - To run the Quick Dev framework (login, CRUD, logout).
cgs quick
```

## Unit Test (watch)

```sh
# Concise test output, watch mode.
cgs test-watch
```

## Unit Test

```sh
# Concise test output (cargo nextest run -j1).
cgs test
```

## Build for production

Note that codegen-units = 1 and lto = true increase compilation time but often yield the best size and performance results.

```sh
# build for minimal binary size (cargo build --release)
cgs release

```

## Tools

```sh
# No cgs recipe; run directly from backend/.
cargo run -p gen-key
```

## Production

These settings:
- Apply uniformly to all crates built in the workspace (including binaries and libraries).
- Member crates cannot use their own [profile.release] sections for these keys.

Optimize binary size for back end <br /><br />
Project root `cargo.toml`

```toml
[profile.release]
opt-level = "z"       # Optimize binary "z" = size "s" = balance "3" = speed)
lto = true            # "true" Link Time Optimization "fat" = more aggressive LTO)
codegen-units = 1     # Better cross-crate optimizations (increases compile time)
panic = "abort"       # Abort on panic (removes unwinding code, reducing binary size)
strip = "symbols"     # Strip debug symbols (available since Rust 1.59+)
```

Optimize WASM bundle size for Leptos front end <br /><br />
Project root `cargo.toml`

```toml
# Defines a size-optimized profile for the WASM bundle in release mode
[profile.wasm-release]
inherits = "release"
opt-level = 'z'
lto = true
codegen-units = 1
panic = "abort"
```

Consider using these rust crates to enhance production security

- [cargo-deny](https://crates.io/crates/cargo-deny)
- [cargo-udeps](https://crates.io/crates/cargo-udeps)
- [cargo-auditable](https://crates.io/crates/cargo-auditable)
- [cargo-audit](https://crates.io/crates/cargo-audit)
- [cargo-geiger](https://crates.io/crates/cargo-geiger)

<br />

---

More resources for [Rust for Production Coding](https://rust10x.com)


[This repo on GitHub](https://github.com/rust10x/rust-web-app)
