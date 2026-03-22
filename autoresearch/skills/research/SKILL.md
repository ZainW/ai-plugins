---
name: research
description: >
  Autonomous research-driven coding for Claude Code. Researches options, presents
  choices, implements with full verification, auto-fixes on failure. Use when asked
  to research, replace, evaluate, or find the best approach for a coding task.
  Trigger phrases: "research", "replace X with", "find the best", "evaluate options for",
  "what should I use for", "upgrade", "migrate from".
argument-hint: "<task description>"
user-invocable: true
---

# Autoresearch

Autonomous research-driven coding. Inspired by [Andrej Karpathy](https://github.com/karpathy)'s autoresearch concept and [pi-autoresearch](https://github.com/davebcn87/pi-autoresearch) by [davebcn87](https://github.com/davebcn87).

**Task:** $ARGUMENTS

## Quick Reference

- State directory: `.autoresearch/`
- Session doc: `.autoresearch/session.md`
- Structured log: `.autoresearch/log.jsonl`
- Config (optional): `.autoresearch/config.json`
- Branch naming: `autoresearch/<task-slug>-<date>`

## JSONL Event Schema

Every event appended to `log.jsonl` must follow one of these schemas:

```
{"type":"brief","timestamp":<epoch>,"scope":[<files>],"priorities":[<strings>],"candidates":[<names>]}
{"type":"research","timestamp":<epoch>,"agent":"researcher-N","option":"<name>","summary":"<text>","scores":{"health":N,"bundle":N,"api":N,"migration":N,"performance":N,"community":N}}
{"type":"research_failed","timestamp":<epoch>,"agent":"researcher-N","option":"<name>","error":"<text>"}
{"type":"evaluation","timestamp":<epoch>,"ranking":[<names in order>],"recommendation":"<name>"}
{"type":"decision","timestamp":<epoch>,"selected":"<name>","reason":"<text>"}
{"type":"implement","timestamp":<epoch>,"commit":"<hash>","description":"<text>","files_changed":<N>}
{"type":"verify","timestamp":<epoch>,"overall":"PASS|FAIL|WARN","tests":"pass|fail","typecheck":"pass|fail|skipped","lint":"pass|fail|skipped","bundle_before":"<size>","bundle_after":"<size>","blocking_issues":[<strings>],"warnings":[<strings>]}
{"type":"autofix","timestamp":<epoch>,"retry":<N>,"trigger":"<failure description>"}
{"type":"complete","timestamp":<epoch>,"status":"success|failed|escalated"}
```

## Resume Check

First, check if there's an existing session to resume:

1. Read `.autoresearch/session.md` — if it exists, check `.autoresearch/log.jsonl` for the last phase
2. If resuming, skip to the appropriate phase based on the last logged event type:
   - `brief` → resume at Phase 2 (research)
   - `research` → resume at Phase 3 (evaluation) if enough results, else re-run Phase 2
   - `evaluation` → resume at Phase 3 (present options again)
   - `decision` → resume at Phase 5 (implementation)
   - `implement` → resume at Phase 6 (verification)
   - `verify` with FAIL → resume at Phase 7 (auto-fix)
   - `verify` with PASS → resume at Phase 8 (final report)
   - `autofix` → continue auto-fix loop from last retry number
   - `complete` → inform user session is already complete
3. If starting fresh, proceed with Phase 1

**`/research clear` cleanup:**
If the user runs `/research clear`:
1. Delete `.autoresearch/` directory: `rm -rf .autoresearch/`
2. List and remove autoresearch branches: `git branch --list 'autoresearch/*' | xargs -r git branch -D`
3. Remove autoresearch worktrees: `git worktree list --porcelain | grep -B2 'autoresearch/' | grep '^worktree ' | sed 's/^worktree //' | xargs -I{} git worktree remove --force {}`
4. Confirm cleanup to user: "Autoresearch session cleared. State files, branches, and worktrees removed."

## Phase 1: Brief + Candidate Discovery

**Goal:** Understand the task, scan the codebase, discover candidates, present smart defaults.

1. **Parse the task**: Extract what the user wants from `$ARGUMENTS`

2. **Scan the codebase**:
   - Use Grep/Glob to find relevant files (e.g., imports of the library being replaced)
   - Check `package.json` for current dependencies
   - Identify the scope of changes needed (count affected files)

3. **Discover candidates**: Use WebSearch to find 3-5 candidate approaches. For dependency replacement, search for alternatives. For refactoring, search for patterns/best practices. **If WebSearch is unavailable** (user hasn't permitted web tools), warn the user: "Web search is not available — research quality will be reduced. Consider allowing WebSearch/WebFetch for better results." Fall back to local analysis: check `node_modules/`, lock files, and existing `package.json` dependencies for known alternatives.

4. **Read config** (if exists): Check `.autoresearch/config.json` for user overrides:
   ```json
   { "maxRetries": 3, "maxImplementerTurns": 50, "maxResearchers": 5 }
   ```

5. **Present the brief** to the user:

```
## Autoresearch Brief

**Task:** [parsed task description]

**Scope:**
- [X files affected]
- [packages involved]
- [key patterns found in codebase]

**Priorities** (inferred, adjust if needed):
1. [first priority]
2. [second priority]
3. [third priority]

**Constraints:**
- [detected constraints: TypeScript, test framework, etc.]

**Candidates to Research:**
1. [candidate 1] — [one-line description]
2. [candidate 2] — [one-line description]
3. [candidate 3] — [one-line description]
[4. ...]
[5. ...]

Does this look right? You can adjust priorities, add/remove candidates, or modify constraints.
```

6. **Wait for user confirmation.** User responds "looks good" or types modifications in natural language.

7. **Initialize state**:
   - Create `.autoresearch/` directory
   - Add `.autoresearch/` to `.gitignore` if not already present
   - Write initial `session.md` using this template:

```markdown
# Autoresearch: <task summary>

## Objective
<What we're doing and why>

## Brief
- **Scope**: <files affected, packages involved>
- **Priorities**: <ordered list>
- **Constraints**: <detected constraints>

## Candidates
<List of candidates from discovery>

## Research Findings
<To be updated after Phase 2>

## Selected Approach
<To be updated after Phase 3>

## Implementation Log
<To be updated after Phase 5>

## Verification Results
<To be updated after Phase 6>
```

   - Append `brief` event to `log.jsonl`

## Phase 2: Parallel Research

**Goal:** Deep-dive each candidate using parallel Sonnet subagents.

1. **Dispatch researcher subagents** — issue multiple Agent tool calls in a SINGLE response for true parallelism. One agent per confirmed candidate (3-5 agents).

   For each candidate, dispatch the `researcher` agent with this prompt:
   ```
   Research the following candidate for this task:

   **Candidate:** [name]
   **Task:** [task description]
   **User Priorities:** [ordered list]
   **Current Usage Patterns:** [how the current solution is used in the codebase — include actual code snippets from Grep results]
   **Codebase Context:** [relevant files, frameworks, TypeScript yes/no, test framework]
   ```

2. **Collect results** from all researchers. For each agent:
   - If successful: append `research` event to `log.jsonl` with scores and summary
   - If failed: append `research_failed` event to `log.jsonl`
   - Proceed with successful results
   - If fewer than 2 researchers succeed, inform user and offer to retry or proceed with limited options

3. **Update session.md**: Write all research findings to the "Research Findings" section.

## Phase 3: Evaluation + Ranking

**Goal:** Synthesize research into ranked options with top 3 + "build custom".

1. **Dispatch the `evaluator` agent** with ALL research findings:

   ```
   Evaluate these research findings and rank the options.

   **Task:** [task description]
   **User Priorities (in order):** [ordered list]
   **Current Usage Patterns:** [patterns from codebase scan]

   **Research Findings:**
   [paste all successful researcher outputs here]
   ```

2. **Append `evaluation` event** to `log.jsonl` with ranking and recommendation.

3. **Present the evaluation** to the user:

```
## Research Complete — Choose Your Approach

[evaluator's comparison table and option details]

### Your Options:
1. **[Top pick]** (Recommended) — [one-line summary]
2. **[Second]** — [one-line summary]
3. **[Third]** — [one-line summary]
4. **Build Custom** — [effort estimate], [one-line summary]

Which option? (1/2/3/4)
```

4. **Wait for user selection.**

5. **Append `decision` event** to `log.jsonl`. Update "Selected Approach" in `session.md`.

## Phase 4: Cost Estimate

**Goal:** Transparent cost information before the expensive implementation phase.

Present to the user:
```
Estimated cost for implementation + verification: ~$5-15 (Opus high-effort, ~50 turns)
This is covered by your Claude Max plan. Proceed? [Y/n]
```

If user declines, offer adjustments (reduce scope, use Sonnet for implementation instead).

## Phase 5: Implementation

**Goal:** Execute the chosen approach using Opus in an isolated worktree.

1. **Build the implementer prompt** based on selection:

   **For library adoption (options 1-3):**
   ```
   Implement the following approach:

   **Selected Approach:** [option name and details from evaluator]
   **Evaluation Summary:** [why this was chosen, pros/cons, migration notes]
   **Task:** [full task description]
   **Files in Scope:** [list from brief]
   **Current Usage Patterns:** [code snippets showing current usage]
   **Constraints:** [user's constraints]
   **Priorities:** [user's priorities]
   ```

   **For "build custom" (option 4):**
   ```
   Build a custom solution from scratch:

   **Task:** [full task description]
   **Research Insights:** [what works in existing libraries, what to avoid — from evaluator]
   **Design guidance:** Design and build a custom solution. Do not depend on any
   external library for this functionality. Write tests alongside the implementation.
   **Files in Scope:** [list from brief]
   **Current Usage Patterns:** [code snippets showing current usage]
   **Constraints:** [user's constraints]
   ```

   **For auto-fix retry (Phase 7):**
   ```
   Fix the verification failures from the previous implementation attempt:

   **Verification Failure Report:**
   [full verifier output including error messages]

   **Previous Implementation:** Check git log on this branch for what was done.
   **Focus:** ONLY fix the issues identified. Don't redo work that already passed.
   **Task:** [original task description for context]
   ```

2. **Dispatch the `implementer` agent** with the appropriate prompt.

3. **Collect implementation summary.** Append `implement` event to `log.jsonl`. Update "Implementation Log" in `session.md`.

## Phase 6: Verification

**Goal:** Run the multi-layer verification pipeline.

1. **Dispatch the `verifier` agent**:

   ```
   Verify the implementation changes.

   **Implementation Summary:** [what was changed, from implementer output]
   **Task:** [task description]
   **Worktree Path:** [path to the worktree where changes were made]
   **Files Changed:** [list from implementer summary]
   ```

2. **Collect verification report.** Append `verify` event to `log.jsonl`. Update "Verification Results" in `session.md`.

3. **Evaluate results:**
   - If overall is **PASS**: proceed to Phase 8 (final report)
   - If overall is **FAIL** (blocking issues): proceed to Phase 7 (auto-fix)
   - If overall is **WARN** only (no blocking): proceed to Phase 8 with warnings

## Phase 7: Auto-Fix Loop (if needed)

**Goal:** Fix verification failures automatically, up to 3 retries.

Read `maxRetries` from `.autoresearch/config.json` (default: 3).

1. Append `autofix` event to `log.jsonl` with retry number and failure trigger
2. Re-run Phase 5 with the auto-fix retry prompt (includes verification failure report)
3. After implementer fixes, re-run Phase 6 (verification)
4. If PASS: proceed to Phase 8
5. If FAIL and retries remaining: loop back to step 1
6. If FAIL and max retries exceeded: append `complete` event with `status: "escalated"`, present failure report to user:

```
## Auto-Fix Exhausted

After [N] attempts, the following issues remain unresolved:

[blocking issues from last verification report]

**Options:**
- Review and fix manually on branch `autoresearch/<branch-name>`
- Run `/research` again to retry with a different approach
- Run `/research clear` to reset and start over
```

## Phase 8: Final Report

**Goal:** Present comprehensive results to the user.

Append `complete` event with `status: "success"` to `log.jsonl`.

```
## Autoresearch Complete

**Task:** [task description]
**Selected:** [chosen option]
**Branch:** `autoresearch/<task-slug>-<date>`

### Verification Results
[full verification report]

### Changes Summary
- Files changed: [count]
- Commits: [count]
- [key changes listed]

### Bundle Impact
[before/after or "N/A"]

### Benchmark Results
[results or "N/A"]

### Next Steps
- Review the changes: `git diff main...autoresearch/<branch>`
- Merge when ready: `git merge autoresearch/<branch>`
- Or discard: `git branch -D autoresearch/<branch>`
```

## Rules

- **Only YOU write to state files.** Subagents return text output; you parse it and serialize to `.autoresearch/session.md` and `.autoresearch/log.jsonl`.
- **Dispatch researchers in PARALLEL** — multiple Agent tool calls in one response.
- **Two user checkpoints**: brief confirmation (Phase 1) and option selection (Phase 3). Plus cost estimate (Phase 4).
- **Log everything** to `log.jsonl` — every phase transition, every agent result, every retry.
- **On resume**, read `log.jsonl` and pick up from the last logged event type.
- **`/research clear`** removes all state, branches, and worktrees.
