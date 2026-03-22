---
name: spec
description: >
  Spec-driven coding for Claude Code. Paste a spec from any source (Google Docs,
  Jira, Slack, markdown, email), get reviewed and verified code. Reviews specs for
  gaps, asks clarifying questions, routes to implementation based on prescriptiveness.
  Trigger phrases: "spec", "implement this spec", "here's the spec", "my boss sent",
  "build from spec", "execute this spec".
argument-hint: "<paste or describe the spec>"
user-invocable: true
---

# Autospec

Spec-driven coding. Paste a spec, get reviewed and verified code.

**Spec:** $ARGUMENTS

## Quick Reference

- State directory: `.autospec/`
- Session doc: `.autospec/session.md`
- Structured log: `.autospec/log.jsonl`
- Config (optional): `.autospec/config.json`
- Refined spec artifact: `.autospec/spec.md`
- Branch naming: `autospec/<task-slug>-<date>`

## JSONL Event Schema

Every event appended to `log.jsonl` must follow one of these schemas:

```
{"type":"intake","timestamp":<epoch>,"raw_length":<chars>,"classification":"prescriptive|directional|open-ended","gap_count":<N>,"blocking_gaps":<N>}
{"type":"interrogation","timestamp":<epoch>,"round":<N>,"questions_asked":<N>,"questions_answered":<N>,"gaps_remaining":<N>}
{"type":"spec_refined","timestamp":<epoch>,"spec_path":".autospec/spec.md","classification":"prescriptive|directional|open-ended"}
{"type":"routing","timestamp":<epoch>,"classification":"prescriptive|directional|open-ended","route":"direct|light_research|full_research","user_choice":<1|2|3>}
{"type":"research","timestamp":<epoch>,"agent":"researcher-N","topic":"<topic>","summary":"<text>"}
{"type":"evaluation","timestamp":<epoch>,"ranking":[<names>],"recommendation":"<name>"}
{"type":"research_routed","timestamp":<epoch>,"reason":"<why research was needed>","task_description":"<synthesized task for full research>"}
{"type":"plan","timestamp":<epoch>,"files_to_create":[<paths>],"files_to_modify":[<paths>],"key_decisions":[<strings>]}
{"type":"implement","timestamp":<epoch>,"commit":"<hash>","description":"<text>","files_changed":<N>}
{"type":"verify","timestamp":<epoch>,"overall":"PASS|FAIL|WARN","tests":"pass|fail","typecheck":"pass|fail|skipped","lint":"pass|fail|skipped","blocking_issues":[<strings>],"warnings":[<strings>]}
{"type":"autofix","timestamp":<epoch>,"retry":<N>,"trigger":"<failure description>"}
{"type":"complete","timestamp":<epoch>,"status":"success|failed|escalated"}
```

## Resume Check

First, check if there's an existing session to resume:

1. Read `.autospec/session.md` — if it exists, check `.autospec/log.jsonl` for the last event type
2. If resuming, skip to the appropriate phase based on the last logged event type:

| Last event | Resume at |
|---|---|
| `intake` | Phase 2 (interrogation) |
| `interrogation` | Phase 2 (continue questions from last round) |
| `spec_refined` | Phase 3 (routing) |
| `routing` | Resume based on `route` field: `direct` → Phase 4, `light_research` → dispatch researchers, `full_research` → dispatch autoresearch agents |
| `research` | Check if all researchers returned; if so dispatch evaluator, else re-run remaining researchers |
| `evaluation` | Phase 4 (present implementation plan) |
| `research_routed` | Check for `evaluation` event in log; if found → Phase 4, else continue research |
| `plan` | Phase 5 (implementation) — plan was already approved in previous session |
| `implement` | Phase 6 (verification) |
| `verify` with FAIL | Auto-fix loop |
| `verify` with PASS | Final report |
| `autofix` | Continue auto-fix loop from last retry number |
| `complete` | Inform user the session is already complete; suggest `/spec clear` to start fresh |

3. If no session exists, proceed with Phase 1.

**`/spec clear` cleanup:**
If the user runs `/spec clear`:
1. Delete `.autospec/` directory: `rm -rf .autospec/`
2. List and remove autospec branches: `git branch --list 'autospec/*' | xargs -r git branch -D`
3. Remove autospec worktrees: `git worktree list --porcelain | grep -B2 'autospec/' | grep '^worktree ' | sed 's/^worktree //' | xargs -I{} git worktree remove --force {}`
4. Confirm to user: "Autospec session cleared. State files, branches, and worktrees removed."

## Phase 1: Intake + Analysis

**Goal:** Parse the spec, scan the codebase, classify prescriptiveness, detect gaps.

1. **Parse the task**: Extract the raw spec text from `$ARGUMENTS`.

2. **Minimum input threshold**: If the raw spec is under ~50 words with no concrete requirements, prompt the user before proceeding:
   ```
   That's pretty brief — can you paste the full spec or give me more detail on what needs to be built?
   ```
   Wait for their response, then continue with the full input.

3. **Scan the codebase**:
   - Use Grep/Glob to find relevant files (imports, patterns related to the spec domain)
   - Check `package.json` for current dependencies and frameworks
   - Identify integration points and existing patterns relevant to the spec

4. **Read config** (if exists): Check `.autospec/config.json` for user overrides:
   ```json
   { "maxRetries": 3, "maxImplementerTurns": 50, "maxInterrogationRounds": 5, "maxResearchers": 3 }
   ```
   Use defaults if the file doesn't exist.

5. **Dispatch the `analyzer` agent** with the raw spec and codebase context:
   ```
   Analyze the following spec for prescriptiveness and gaps.

   **Raw Spec:**
   [full spec text]

   **Codebase Context:**
   [relevant files found, frameworks, package.json summary, existing patterns]
   ```

6. **Collect analyzer output** (classification + gap analysis). The analyzer returns text — you parse it.

7. **Initialize state**:
   - Create `.autospec/` directory
   - Add `.autospec/` to `.gitignore` if not already present
   - Write initial `session.md` using the template below
   - Append `intake` event to `log.jsonl`

NO user checkpoint here — flow directly into Phase 2.

**session.md template:**
```markdown
# Autospec: <task summary>

## Objective
<What we're building and why>

## Classification
<prescriptive/directional/open-ended>

## Gap Analysis Summary
<Key gaps found and how they were resolved>

## Refined Spec
See .autospec/spec.md

## Research Findings
<To be updated if research is needed>

## Implementation Plan
<To be updated after Phase 4>

## Implementation Log
<To be updated after Phase 5>

## Verification Results
<To be updated after Phase 6>
```

## Phase 2: Interrogation (User Checkpoint #1)

**Goal:** Fill all blocking gaps through targeted Q&A, produce a refined spec.

**Interrogation loop:**

1. **Dispatch the `interrogator` agent** with the analyzer output and original spec:
   ```
   Generate clarifying questions for this spec based on the gap analysis.

   **Original Spec:**
   [raw spec text]

   **Analyzer Output:**
   [full gap analysis and classification from Phase 1]

   **User Answers So Far:**
   [answers from previous rounds, if any]
   ```

2. **Present questions to the user**. The interrogator returns a numbered list — present it as-is. Collect the user's answers.

3. **Append `interrogation` event** to `log.jsonl` with the round number, questions asked, questions answered, and gaps remaining.

4. **Check blocking gaps remaining:**
   - If yes + rounds < `maxInterrogationRounds`: re-dispatch the interrogator with original analysis + all answers accumulated so far, asking it to generate follow-up questions for remaining blocking gaps. Loop back to step 2.
   - If yes + rounds >= `maxInterrogationRounds`: proceed with best-effort defaults, warn the user: "Proceeding with best-effort defaults for unresolved gaps — review `.autospec/spec.md` before approving the plan."
   - If no blocking gaps remain: proceed to spec refinement.

5. **Write the refined spec to `.autospec/spec.md`**: Incorporate all original spec content plus resolved gap answers. This is the authoritative document for all subsequent phases.

6. **Append `spec_refined` event** to `log.jsonl`. Update the "Gap Analysis Summary" section in `session.md`.

## Phase 3: Routing Decision

**Goal:** Determine research needs and get user buy-in on the approach.

Based on the prescriptiveness classification from Phase 1, present one of the following to the user:

**Prescriptive:**
```
## Spec Classification: Prescriptive

Your spec is clear and specific — it names technologies, has detailed criteria, and leaves little room for interpretation. Going straight to implementation planning.

(Want me to research alternatives first? Just say so.)
```
Route: `direct`. Skip to Phase 4. Log `routing` event with `route: "direct"` and `user_choice: 1`.

**Directional:**
```
## Spec Classification: Directional

Your spec describes what to build but leaves some technical choices open.
I'd like to do a quick research pass on [specific topic] before implementing.

Options:
1. Quick research (recommended) — I'll check best approaches for [topic]
2. Skip research — just implement with [my best guess default]
3. Full research — run the complete research pipeline

Which approach? (1/2/3)
```
Wait for user selection. Log `routing` event with `route` based on choice (choice 1 → `light_research`, choice 2 → `direct`, choice 3 → `full_research`).

**Open-ended:**
```
## Spec Classification: Open-ended

Your spec describes a goal but doesn't prescribe an approach. I'd like to research options before implementing.

Options:
1. Full research (recommended) — evaluate multiple approaches, present ranked options
2. Quick research — brief look at best practices, then implement
3. Skip research — I'll pick an approach and go

Which approach? (1/2/3)
```
Wait for user selection. Log `routing` event with `route` based on choice (choice 1 → `full_research`, choice 2 → `light_research`, choice 3 → `direct`).

**For light research (directional default route or user choice):**

Dispatch autospec's own `researcher` agent(s) in PARALLEL — one per specific technical question surfaced by the analyzer. Use up to `maxResearchers` agents (default: 3).

For each question, dispatch the `researcher` agent:
```
Research the following technical question to inform implementation:

**Question:** [specific technical question from gap analysis / spec]
**Spec Context:** [relevant excerpt from spec.md]
**Codebase Context:** [relevant stack, existing patterns]
```

Collect results. Fold findings into `.autospec/spec.md` as a "## Research Addendum" section. Log each result as a `research` event.

**For full research (open-ended route or user choice):**

1. Check if `../autoresearch/agents/researcher/researcher.md` exists.
2. **If autoresearch is installed:**
   - Read `../autoresearch/agents/researcher/researcher.md` and `../autoresearch/agents/evaluator/evaluator.md`
   - Log `research_routed` event with reason and synthesized task description
   - Dispatch parallel researcher agents using autoresearch's researcher prompt (same as autoresearch Phase 2). One agent per candidate (up to `maxResearchers`)
   - Collect results, log each as a `research` event
   - Dispatch the evaluator agent using autoresearch's evaluator prompt with all research findings (same as autoresearch Phase 3)
   - Log `evaluation` event
   - Present ranked options to user for selection:
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
   - Wait for user selection. Fold chosen approach into `.autospec/spec.md` as a "## Research Addendum" section.
3. **If autoresearch is NOT installed** (agent files not found):
   - Warn user: "Full research requires the autoresearch plugin. Running light research instead."
   - Fall back to autospec's own `researcher` agent for light research (same as light research path above).

All research results are logged to autospec's own `.autospec/log.jsonl` — NOT to `.autoresearch/`.

## Phase 4: Implementation Plan (User Checkpoint #2)

**Goal:** Get explicit user approval on what will be built before any code is written.

Present a concrete plan derived from `.autospec/spec.md`:

```
## Implementation Plan

Based on the refined spec, here's what I'm going to build:

### Files to Create
- [path] — [purpose]

### Files to Modify
- [path] — [what changes and why]

### Order of Operations
1. [step]
2. [step]
...

### Key Decisions
- [decision derived from spec, e.g., "Using Prisma for the subscription model per spec requirement"]

### Assumptions
- [anything not explicitly stated in the spec that you're inferring]

Does this plan look right? Adjust anything before I start implementing.
```

Wait for user approval. User may request adjustments — incorporate them, then confirm before proceeding.

**Append `plan` event** to `log.jsonl` with `files_to_create`, `files_to_modify`, and `key_decisions`. Update "Implementation Plan" section in `session.md`.

## Phase 5: Implementation

**Goal:** Execute the refined spec in an isolated git worktree using the Opus implementer.

**Build the implementer prompt** based on context:

**For initial implementation:**
```
Implement the following spec:

**Refined Spec:**
[full contents of .autospec/spec.md]

**Implementation Plan:**
[plan details from Phase 4 — files to create/modify, order of operations]

**Files in Scope:** [list from plan]
**Codebase Context:** [relevant patterns, frameworks, conventions found during Phase 1 scan]
**Constraints:** [constraints from spec, e.g., "must not change the public API", "TypeScript strict mode"]
```

**For auto-fix retry (Phase 6 loop):**
```
Fix the verification failures from the previous implementation attempt:

**Verification Failure Report:**
[full verifier output including all error messages and blocking issues]

**Previous Implementation:** Check git log on this branch for what was done.
**Focus:** ONLY fix the issues identified. Don't redo work that already passed.
**Spec:** [full contents of .autospec/spec.md for reference]
```

**Dispatch the `implementer` agent** with the appropriate prompt.

Collect implementation summary (commit hash, files changed, description). The implementer works in an isolated worktree on branch `autospec/<task-slug>-<date>`.

**Append `implement` event** to `log.jsonl`. Update "Implementation Log" section in `session.md`.

## Phase 6: Verification + Auto-fix + Final Report

**Goal:** Run the verification pipeline. Auto-fix on failure. Deliver final report on pass.

### Verification

1. **Dispatch the `verifier` agent**:
   ```
   Verify the implementation changes.

   **Implementation Summary:** [what was changed, from implementer output]
   **Spec:** [path to .autospec/spec.md — verifier checks implementation matches spec]
   **Worktree Path:** [path to the worktree where changes were made]
   **Files Changed:** [list from implementer summary]
   ```

2. **Collect verification report.** Append `verify` event to `log.jsonl`. Update "Verification Results" in `session.md`.

3. **Evaluate results:**
   - **PASS** → proceed to Final Report
   - **WARN only** (no blocking issues) → proceed to Final Report with warnings included
   - **FAIL** (blocking issues) → enter Auto-fix loop

### Auto-fix Loop

Read `maxRetries` from `.autospec/config.json` (default: 3).

1. Append `autofix` event to `log.jsonl` with current retry number and failure trigger (summary of blocking issues)
2. Re-dispatch the `implementer` agent with the auto-fix retry prompt (includes full verification failure report)
3. Append `implement` event. Update `session.md`.
4. Re-dispatch the `verifier` agent
5. Append `verify` event. Update `session.md`.
6. If **PASS**: proceed to Final Report
7. If **FAIL** + retries remaining: increment retry counter, loop back to step 1
8. If **FAIL** + max retries exceeded: append `complete` event with `status: "escalated"`, present escalation report:

```
## Auto-Fix Exhausted

After [N] attempts, the following issues remain unresolved:

[blocking issues from last verification report]

**Options:**
- Review and fix manually on branch `autospec/<branch-name>`
- Run `/spec` again with an adjusted spec
- Run `/spec clear` to reset and start over
```

### Final Report

Append `complete` event with `status: "success"` to `log.jsonl`.

```
## Autospec Complete

**Spec:** [one-line summary of what was built]
**Classification:** [prescriptive/directional/open-ended]
**Branch:** `autospec/<task-slug>-<date>`

### Refined Spec
See `.autospec/spec.md`

### Verification Results
[full verification report — tests, typecheck, lint, any warnings]

### Changes Summary
- Files changed: [count]
- Commits: [count]
- [key changes listed]

### Next Steps
- Review the changes: `git diff main...autospec/<branch>`
- Merge when ready: `git merge autospec/<branch>`
- Or discard: `git branch -D autospec/<branch>`
```

## Rules

- **Only YOU write to state files.** Subagents return text output; you parse it and serialize to `.autospec/session.md` and `.autospec/log.jsonl`. Never instruct agents to write to these files.
- **Dispatch researchers in PARALLEL** — multiple Agent tool calls in one response for true parallelism.
- **Two user checkpoints**: interrogation (Phase 2) and implementation plan (Phase 4). Plus the routing choice (Phase 3). Do not skip them.
- **Log everything** to `log.jsonl` — every phase transition, every agent result, every retry, every routing decision.
- **On resume**, read `log.jsonl` and pick up from the last logged event type. Do not re-run completed phases.
- **`.autospec/spec.md` is the source of truth** for implementation. The implementer executes the spec, not the raw user input.
- **`/spec clear`** removes all state, branches, and worktrees. Always confirm before clearing if there is an active session with uncommitted work.
- **Agent names** used for dispatch: `analyzer`, `interrogator`, `researcher`, `implementer`, `verifier`. For full research via autoresearch cross-plugin delegation, agent prompts are read from `../autoresearch/agents/` and dispatched directly.
