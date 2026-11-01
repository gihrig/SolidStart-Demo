---
name: close
description: Close a GitHub issue of this repo (gihrig/SolidStart-Demo) with a short summary that shows each Acceptance criterion, or each Fix step, met with evidence — git grep results on the merged branch, file:line, test names, commit SHAs and the PR's CI results. Use it whenever the user asks to close an issue ("close #271", "close 272 with a summary", "mark the issue done", "the PR is merged, close the issue"), even if they do not say "acceptance criteria". It closes the issue only when every criterion is proven; otherwise it reports the gaps. Say "dry run" to draft the comment without posting or closing.
---

# Close an issue with evidence

The closing comment is the record that the issue's contract was met. A reader must
see, for each criterion, the proof: a command result, a file and line, a test name
or a commit. A claim without proof is worth nothing here, and this repo's rule is
the same: quote the code or the output that proves a claim, or say that you could
not verify it.

Inputs: the issue number, and optionally "dry run".

## 1. Find the merged PR

```bash
gh issue view <N> --json title,state,body,comments
gh pr list --state all --search "<N> in:body" --json number,title,state,baseRefName,mergeCommit,headRefName
```

- If the issue is already closed, stop and say so. A dry run may still draft the
  comment for a closed issue.
- Pick the PR whose body says `Closes #<N>` (or names the issue as its work). It
  must be `MERGED`. If no merged PR exists, stop: do not close, and report it.
- Note the base branch. A merge into a branch other than `main` does not close
  the issue on GitHub, which is why this skill exists.
- `git fetch -q origin`. All checks below run against `origin/<base>`, the code
  as merged, not the local working tree.

## 2. List the criteria

- Use the issue's **Acceptance criteria** checklist. If it has none, use its
  **Fix** checklist. Keep the issue's own grouping (for example C-26, C-25, Docs).
- Read the issue comments too. A comment can record a deviation or an extra step;
  the summary must mention it, so a reader is not surprised.

## 3. Prove each criterion

Pick the proof that fits the criterion. Run each command; never infer a result.

| Criterion says                     | Proof                                                                   |
| ---------------------------------- | ----------------------------------------------------------------------- |
| "`git grep …` finds no match"      | Run it on `origin/<base>`: `git grep -nE '<pat>' origin/<base> -- <path>` |
| "X exports Y", "takes a prop"      | `git grep -n` the declaration; cite `file:line`                         |
| "A test proves …"                  | Find the test (`git grep -n '<words>'`); cite its name and file         |
| "Commit N does not change F"       | `git diff <sha>~1 <sha> -- F` is empty                                  |
| "Has the text below, word for word"| Compare the issue's text with the file, whitespace-normalized          |
| "`cgs check`/tests/e2e pass"       | `gh pr checks <PR>`; local runs only if they ran in this session        |
| Each fix commit                    | `git log origin/<base> --oneline --grep '#<N>'`; cite short SHAs        |

For the PR's CI: list every check that did not pass, read its log
(`gh run view <run> --job <job> --log`), and say in one sentence why it does or
does not block. Hiding a red check makes the whole summary untrustworthy.

Say what each proof covers. Two kinds of claim need different proof:

- **A claim about the merged code** (a grep, an export, a prop, a test that
  exists, a doc text): prove it on `origin/<base>`. If you cannot, it is a gap.
- **A claim about history** (a test failed before its fix, the tests passed at
  commit 5): the record may prove it — the commit message, the PR body, or CI on
  that commit. Name the record, and say that it was not re-run: "Commit 7
  records that these tests failed before the fix; not re-run at close." Re-run it
  in a temporary `git worktree` only if the record is missing or the user asks.

A reader must never take an indirect proof for a direct one.

## 4. Decide

- **Every criterion proven, and no blocking check failed:** write the comment and
  close the issue (unless this is a dry run).
- **Anything else** — a criterion not met, a claim about the merged code that
  you could not prove, a claim about history with no record, the PR not merged,
  a blocking check red: do not close. Report each gap with its evidence,
  and offer the fix. Closing an issue with an unmet criterion hides open work.

## 5. Write the comment

Write it to the session scratchpad (e.g. `close<N>.md`). Keep it short, in the
repo's plain English: one fact per sentence, sentences under 20 words. Use
checklists, not tables (GitHub's comment column is narrow).

The comment posts from the user's GitHub account, so it speaks for the user.
Write it without "I", "we" or "the PR author": state the facts, and say "not
re-run at close" for a check that was not run again.

The user asks for a concise summary, so each line must earn its place:

- One bullet per criterion, with its strongest proof. Add a second proof only
  when the first does not cover the whole criterion.
- Only the issue's criteria and the steps that were added to them. A plan item
  that is not a criterion (such as the commit order) stays out.
- Name only the CI checks that did not pass. "Every CI check passes except …"
  covers the rest.
- Every box is `- [x]`. An unchecked `- [ ]` in a closing comment reads as open
  work. If you could not run something, say so in a plain sentence, such as
  "The proof is the PR's CI; the local commands were not re-run."

```markdown
**Done in #<PR> (merged into `<base>` as <sha7>). Each acceptance criterion is met.**

Each `git grep` below ran on `origin/<base>` after the merge, and each found 0 matches.

**<group from the issue>**

- [x] <the criterion, shortened>. <its proof: file:line, grep count, test name, commit>.
- [x] <criterion>. Tests:
  - `<file>`: "<test name>".

**Checks**

- [x] Locally …, or: On #<PR>, every CI check passes except `<job>`. <why it does not block>.

**Also in #<PR>, beyond this issue:** <extra commits or deviations, with SHAs>.
```

- Say "Fix step" instead of "acceptance criterion" when the issue has a Fix list.
- Drop the grep line when no criterion uses `git grep`.
- Drop the "beyond this issue" line when there is nothing beyond it.
- If a step was done that the issue did not list (as the VEX step in #272), add it
  as its own `- [x]` line that says so.

## 6. Post and confirm

```bash
gh issue close <N> --reason completed --comment "$(cat <scratchpad>/close<N>.md)"
gh issue view <N> --json state,stateReason
```

- **Dry run:** do not run `gh issue close`. Print the comment and its file path.
- Tell the user in two or three lines: the issue is closed (or not, and why), and
  what the comment proves.
- If the same PR also fixed another open issue (its body names it), say so and
  offer to close that one too.
