Here is Claude's plan:
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
 Plan: Review & Update full_stack_integration.md Phase 7

 Context

 The full_stack_integration.md document has been revised: Parts 3 and 4 merged into Part 2 (now Phases 4–6), and a new
 Part 3 added for development commands. Phases 1–6 are fully implemented and marked [x]. Phase 7 (Integration Testing)
 is present but incomplete — it has only high-level bullet points with no code examples, missing test specifications,
 or troubleshooting detail.

 File to edit: planning/full_stack_integration.md

 ---
 Findings

 Phases 1–6: Fully Complete

 All steps are marked [x] and confirmed implemented in the codebase. No corrections needed.

 Phase 7: Incomplete

 Current state is 3 thin steps:
 - Step 7.1: Start Servers (3 bullets, no detail)
 - Step 7.2: Run Back-End Tests (2 bullets)
 - Step 7.3: Run Front-End Tests (4 bullets)

 Missing Test Files (not in Appendix I)

 These components have no unit tests documented or created:
 - src/components/ConversationManager.test.tsx — tests CRUD, agent prop reactivity, conv selection
 - src/components/MessagePanel.test.tsx — tests message display, send form, live/offline indicator
 - src/components/AuthContext.test.tsx — tests login/logoff state management

 Appendix I

 Missing the 3 test files above from the "New Files to Create" table.

 ---
 Changes to full_stack_integration.md

 1. Expand Phase 7 with new Step 7.0 (before starting servers)

 Add Step 7.0: Create Missing Tests with:
 - Note identifying ConversationManager.test.tsx and MessagePanel.test.tsx as missing
 - Full test code for ConversationManager.test.tsx covering:
   - Renders heading and "select an agent" placeholder when no agent
   - Displays conversations after agent selected
   - Create form calls backendRpc.conv.create with correct params
   - onConvSelect callback fires on click
   - Resets selection when agent changes
 - Full test code for MessagePanel.test.tsx covering:
   - Shows "select a conversation" when conv is null
   - Shows Live/Offline indicator based on WebSocket connected()
   - Send form calls backendRpc.convMsg.add with correct params
   - Shows sent message in list after success
 - Brief AuthContext.test.tsx covering:
   - isAuthenticated starts false
   - login() sets isAuthenticated to true and stores username
   - logoff() clears auth state

 2. Expand Steps 7.1–7.3 with detail

 Step 7.1 Start Servers — add exact commands (or reference Part 3 section numbers), add expected startup indicators:
 - DB: database server started
 - Backend: Listening on 0.0.0.0:8080
 - Frontend: Local: http://localhost:3000/
 - Add note: confirm http://localhost:8080/api/rpc returns 401 (unauthenticated)

 Step 7.2 Back-End Tests — add:
 - Expected output pattern: X tests, 0 failures
 - Note on -j1 flag (tests share DB state, must run sequentially)
 - quick_dev expected output summary (creates agent/conv/msg then logoff)
 - Common error: connection refused → check Docker

 Step 7.3 Front-End Tests — expand into sub-steps:
 - 7.3.1 Unit tests: bun test:unit → expect all pass including new tests
 - 7.3.2 Component tests: bun test:comp → note requires @solidjs/testing-library
 - 7.3.3 E2E tests: npm run test:e2e → note requires both servers running; static tests run regardless
 - 7.3.4 Manual WebSocket verification steps:
   a. Open http://localhost:3000/fullstack
   b. Login with demo1 / welcome
   c. Create an agent, create a conversation
   d. Open a second browser tab to same URL, login
   e. Both tabs select same conversation
   f. Send message in Tab 1 → observe it appears in Tab 2 without refresh
   g. Confirm "Live" indicator is green in MessagePanel

 3. Update Appendix I

 Add 3 rows to "New Files to Create" table:
 | `src/components/ConversationManager.test.tsx` | ConversationManager unit tests | [ ] |
 | `src/components/MessagePanel.test.tsx`         | MessagePanel unit tests        | [ ] |
 | `src/components/AuthContext.test.tsx`          | AuthContext unit tests          | [ ] |

 4. Update Progress Tracking

 No changes needed — Phase 7 correctly shows [ ].

 ---
 Memory Updates

 Create/update memory/MEMORY.md with a note that the integration document lives at planning/full_stack_integration.md
 and that Phase 7 tracks integration testing status.

 ---
 Verification

 After editing the document:
 1. Confirm Phase 7 now has Step 7.0 with full test code for the 3 missing files
 2. Confirm Steps 7.1–7.3 have command references and expected output markers
 3. Confirm Step 7.3.4 has the manual WebSocket two-tab test procedure
 4. Confirm Appendix I lists the 3 new test files
 5. Optionally: read Appendix II to confirm workflow mapping still accurate (no changes needed)
