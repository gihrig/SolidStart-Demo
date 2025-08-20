## Modifications to Claude Opus generated PRD.md

1. Uses Nginx as edge proxy > change to Caddy server

2. Uses PostgreSQL > change to Turso
- Configure Turso
- Full-Text search including Faceted (filtered) Search
- Application backup
- See Full-Text_Search.md???

3. Section 4.1 Database Schema Evolution
- Modify to express applicaton requirements
 -- List table and column requirements
 -- Review Suggested table/column spec again existing AEA Gems
- Modify DDL code to SQLite/Turso syntax
- Evaluate and expand on provided DDL code

4. URL migration
- Create system of URL mapping for old .php to new slug style URLs

5. Front End Requirements
- Purchase, select and download Tailwind Plus components
- Make use of "Leptose-Use" or "thaw-ui" component as appropriate
- 5.1 Leptos Component Architecture
 -- Core Components worspace to be placed in /service/web-services/
 -- Implement Leptos Island architecture
 -- Implement appication as a Leptos SSR project
- Add vertical fyout menu to show productuct categories (is this Category showcase?)
- Eliminate 5.2 > 3 Product Detail Pages "Product Information Tabs"

6. Line 803: *End of Product Requirements Document*
- Is the following material appropriate for a PRD?
- Move to separate dicument?