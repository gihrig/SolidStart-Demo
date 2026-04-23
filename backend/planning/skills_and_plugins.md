Claude Code Skills and Plugins

The difference between a frustrating Claude Code session and a productive one is usually setup. These skills and plugins are most of that setup — and they’re all free.

General:
Prefer a CLI over an MCP
Install/create a skill to use the CLI
/plugin for official plugins

Anthropic Plugins directory
https://claude.com/plugins#plugins
SuperPowers https://claude.com/plugins/superpowers
Context 7 Docs https://claude.com/plugins/context7
TypeScript LSP https://claude.com/plugins/typescript-lsp
Rust LSP https://claude.com/plugins/rust-analyzer-lsp
SQL Data https://claude.com/plugins/data
Front End Design https://claude.com/plugins/frontend-design
GitHub MCP https://claude.com/plugins/github
Code Review https://claude.com/plugins/code-review
Security Guidance https://claude.com/plugins/security-guidance
Memory https://claude.com/plugins/remember
Skill Creator https://claude.com/plugins/skill-creator
CLAUDE.md Management https://claude.com/plugins/claude-md-management

Anthropic Skill Creator
https://claude.com/plugins/skill-creator
https://www.youtube.com/watch?v=UtGszoiwrsQ

Andrej Karpathy Skills
A single CLAUDE.md file to improve Claude Code behavior, derived from Andrej Karpathy's observations on LLM coding pitfalls.
https://github.com/multica-ai/andrej-karpathy-skills/tree/main

Awesome Claude Code
A selectively curated list of skills, agents, plugins, hooks, and other amazing tools for enhancing your Claude Code workflow.
https://github.com/hesreallyhim/awesome-claude-code

Open Source Skills directory
The Open Agent Skills Ecosystem
https://skills.sh/
https://claude.com/blog/improving-skill-creator-test-measure-and-refine-agent-skills
https://www.youtube.com/watch?v=epZy_NajGnA

Superpowers
Superpowers makes Claude stop, plan, and test first.
It auto-enforces brainstorming → planning → TDD → code review on every session.
Competitor or companion to GSD - Grok says some use both
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@superpowers-marketplace

Claude Mem
Claude forgets everything when a session ends. This fixes that.
It captures what Claude learns during your sessions, compresses it, and injects it back next time.
https://github.com/thedotmack/claude-mem

UI/UX Pro Max
Default Claude UI looks like every other AI-built app...
This skill gives Claude 50+ UI styles, 97 color palettes, and 57 font pairings. It analyzes your project and picks the right design system automatically. Works across React, Next.js, Vue, Svelte, SwiftUI, Flutter, and Tailwind.
https://github.com/nextlevelbuilder/ui-ux-pro-max-skill

Matt Pocock Agent Skills
A collection of agent skills that extend capabilities across planning, development, and tooling.
https://github.com/mattpocock/skills

SolidJS & SolidStart Expert Development Skill
Senior/Lead engineer-level guidance for building production-ready applications with fine-grained reactivity.
https://skills.sh/modra40/claude-codex-skills-directory/solidjs-solidstart-expert
References: https://github.com/mOdrA40/claude-codex-skills-directory/tree/main/frontend-skills/solidjs-solidstart-mastery-skill

Rust Mastery Skill
Principal/Senior-level Rust playbook for architecture, ownership, async systems, error handling, observability, security, testing, and production readiness.
https://github.com/mOdrA40/claude-codex-skills-directory/tree/main/backend-skills/rust-mastery-skill

Rust Best Practices
Apply these guidelines when writing or reviewing Rust code. Idiomatic Rust coding standards based on Apollo GraphQL's best practices handbook.
https://skills.sh/apollographql/skills/rust-best-practices

SQLite Database Expert
SQLite database expert for Tauri/desktop apps with SQL injection prevention, migrations, FTS search, and secure data handling.
https://skills.sh/martinholovsky/claude-skills-generator/sqlite-database-expert

Supabase CLI
Skill Available
https://github.com/supabase/agent-skills
Local execution in Container
https://supabase.com/docs/guides/local-development/cli/getting-started
https://supabase.com/docs/guides/self-hosting

GSD (Get Shit Done)
A meta-prompting, context engineering and spec-driven dev system.
One command. Claude interviews you, builds the plan, and executes phase by phase.
https://www.youtube.com/watch?v=ZgfybHGxzJU&t=278s
https://github.com/gsd-build/get-shit-done/

Playwright CLI + Skills
https://github.com/microsoft/playwright-cli
https://www.youtube.com/watch?v=I9kO6-yPkfM

GitHub CLI
https://github.com/cli/cli#installation
https://cli.github.com/manual/gh

Firecrawl Skill + CLI
https://www.firecrawl.dev/
https://docs.firecrawl.dev/sdks/cli

Excalidraw CLI + Skill
https://github.com/ahmadawais/excalidraw-cli

Obsidian Skills
Built by Obsidian’s own CEO. Teaches Claude how Obsidian actually works.
Great for: developers who use Obsidian and want Claude to work inside it, not just dump markdown files.
https://github.com/kepano/obsidian-skills
https://obsidian.md/

n8n-MCP
Without this, Claude guesses at n8n node names and gets them wrong. With it, Claude knows all 1,200+ nodes — names, parameters, schemas, everything.
https://github.com/czlonkowski/n8n-mcp
https://www.n8n-mcp.com/
https://n8n.io/

Status Line
In Claude Code: /statusline
- show the current directory last two path segments
- git branch with dirty status (red if dirty, green if clean)
- model used
- context usage 'ctx:0%' when empty color-coded by how full the window is (green < 50%, yellow 50-80%, red > 80%)
- show weekly/5hr usage percentage used as 'W/5:w%/n% color coded as above.
Separate all elements with ` | ` do not color these characters.


Context Management in long running plans
Can I write instructions into my plan to have claude check ctx% after each step and compact if >60% and clear at end of each phase?

⏺ Yes, absolutely. The plan file is just instructions — you can add a standing directive like:

Place it near the top of the plan so it's read before execution begins.

  ## Context Management

  After each step:
  - Check ctx% in status line
  - If ctx% > 60%, run `/compact`

  ## Phase Boundary Protocol

  At the end of each phase:
  1. Commit all work
  2. STOP and prompt user: "Phase X complete. Please run `/clear`, then paste the plan path to continue."

  This makes the phase boundary explicit and puts the /clear in your hands, where it actually has to happen.

  Claude can call /compact itself (it's just a tool call), so that one can be fully automated in the plan.

Track Plan Steps
Examples commands:
- Use /plan mode, /SuperPowers and ultrathink to generate a plan that will create in `tanstack-solid-cc` all features and styles found in `tanstack-react-cc`
- The plan should have left aligned check boxes for each phase and step to track progress
- Check off each plan Phase and Step when it is complete so the project can be restarted and continue where it left off
- The plan must include fixing all lint and format errors and warnings found by `npx biome check` This must be done at the end of each phase
