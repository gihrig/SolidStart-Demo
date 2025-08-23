## Modifications to Claude Opus generated PRD.md

## Backend updates

1. Manual updates to PRD.md
- Rename /web-folder as /static-files See /.cargo/config.toml
- Remove nginx application is served by axum
- Create site_images catalog_images structure under /static-files

2. Configure Turso database
- Configure Turso database: https://crates.io/crates/turso
- Full-Text Faceted (filtered) Search using Tantivy: https://crates.io/crates/tantivy

3. Section 4.1 Database Schema Evolution
- Modify DDL code to SQLite/Turso syntax
- Integrate existing EAGems table/column spec into DDL code
  -- See /EAG_Requirements/_example.text.php_
- Remove PostgreSQL

4. Application evironment
- Review and integrate /EAG_Requirements/framework.config.php
- Review and integrate /EAG_Requirements/_menu_instructions.txt

5. URL migration
- Create system of URL mapping for old .php to new slug style URLs

## Frontend updates

6. Front End Requirements
- Purchase, select and download Tailwind Plus components
- Make use of "Leptose-Use" or "thaw-ui" components as appropriate
- 5.1 Leptos Component Architecture
 -- Core Components workspace to be placed in /service/web-services/
 -- Implement Leptos Island architecture
 -- Implement appication as a Leptos SSR project
- Create an auto-generated vertical flyout menu to show productuct categories. See /EAG_Requirements/_menu_instructions.txt
- Eliminate 5.2 > 3 Product Detail Pages "Product Information Tabs"

7. Line 803: *End of Product Requirements Document*
- Is the following material appropriate for a PRD?
- Move to separate dicument?