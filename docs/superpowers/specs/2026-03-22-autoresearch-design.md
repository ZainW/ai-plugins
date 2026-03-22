# Autoresearch — Claude Code Plugin Design Spec

**Date:** 2026-03-22
**Status:** Approved
**Author:** Zain

---

## Credits & Inspiration

Inspired by [Andrej Karpathy's autoresearch concept](https://github.com/karpathy) and built on ideas from [pi-autoresearch](https://github.com/davebcn87/pi-autoresearch) by [davebcn87](https://github.com/davebcn87). The autonomous loop pattern — research, try, measure, keep what works — originates from their work. This plugin adapts that pattern for Claude Code's subagent architecture.

---

## Overview

`autoresearch` is a Claude Code plugin that turns any coding task into an autonomous research-driven workflow. One command, natural language input:

```
/research replace moment.js with something modern and lightweight
/research refactor the auth middleware to use the new API patterns
/research add comprehensive error handling to the payment flow
```

The plugin runs an autonomous loop: **research -> present options -> implement -> verify -> auto-fix** — using subagents with model-appropriate allocation.

---

## Design Decisions

### Model Allocation

| Phase | Model | Rationale |
|-------|-------|-----------|
| Upfront brief + candidate discovery | Sonnet | Fast interaction, smart defaults, web search for candidates |
| Research (parallel) | Sonnet x3-5 | 1M context for ingesting full docs, better judgment on library quality than Haiku |
| Evaluation + ranking | Sonnet | Synthesis of research into ranked comparison |
| Implementation | Opus high-effort | Best coding model (80.8% SWE-bench), tasks skew hard |
| Auto-fix on failure | Opus high-effort | Retry with fresh approach, same quality bar |
| Verification | Sonnet | Script execution + result parsing |

**Why Sonnet over Haiku for research:** The 1M context window (vs Haiku's 200k) allows ingesting entire library docs in one pass. Research agents make qualitative judgments ("is this API well-designed?", "is this project well-maintained?") where Sonnet's reasoning advantage matters. Cost difference per research run is ~$0.50 — negligible.

**Why Opus for implementation:** Despite Sonnet 4.6 being 79.6% on SWE-bench (only 1.2% behind Opus), autoresearch targets harder-than-average tasks: multi-file refactors, dependency replacements, building custom solutions. The 1.2% gap compounds on hard tasks, and since time is not a constraint, Opus is the right call.

### Autonomy Model

- **Full auto** for research, implementation, verification, and auto-fix
- **Two user checkpoints:**
  1. After brief generation — confirm scope/priorities/constraints (presented as markdown summary; user responds "looks good" or types modifications in natural language)
  2. After evaluation — pick from top 3 options + "build custom"
- Auto-fix loop retries up to 3 times on verification failure before escalating to user

### Verification Strategy

Multi-layer pipeline with blocking vs. warning severity:

| Check | Method | On Failure |
|-------|--------|------------|
| Tests | Detect and run existing test command | **Block** (auto-fix) |
| Typecheck | `tsc --noEmit` or equivalent | **Block** (auto-fix) |
| Lint | Detect and run existing linter | **Block** (auto-fix) |
| Bundle size | Snapshot before (main) vs after (branch) — only if build script detected | **Warn** if >10% increase |
| Benchmarks (existing) | Run existing bench scripts if present | **Report** |
| Benchmarks (generated) | Create targeted micro-benchmarks for the specific change | **Report** |
| Static analysis | Circular deps, unused exports, dead code | **Warn** |

"Block" triggers the auto-fix loop. "Warn" and "Report" are included in the final report but don't trigger auto-fix.

**Bundle analysis applicability:** The verifier detects whether the project has a build step that produces a measurable bundle (via `package.json` scripts, webpack/vite/rollup/esbuild config). If no bundle output is detected, bundle analysis is skipped.

---

## Plugin Structure

```
autoresearch/
├── .claude-plugin/
│   └── plugin.json                    # manifest + credits
├── skills/
│   └── research/
│       └── SKILL.md                   # main entry point (/research command)
├── agents/
│   ├── researcher.md                  # Sonnet — parallel research agent
│   ├── evaluator.md                   # Sonnet — synthesize + rank options
│   ├── implementer.md                 # Opus high-effort — do the work
│   └── verifier.md                    # Sonnet — run checks + benchmarks
├── hooks/
│   ├── hooks.json                     # session state tracking
│   └── session-resume.mjs             # detect + inject in-progress session state
├── scripts/
│   ├── bundle-analysis.sh             # before/after bundle size comparison
│   ├── benchmark-runner.sh            # run existing + generated benchmarks
│   └── static-analysis.sh             # lint, typecheck, circular deps
├── LICENSE                            # MIT
└── README.md                          # credits, installation, usage
```

---

## Flow

```
User: /research <task description>
         │
         ▼
    ┌─────────────┐
    │  BRIEF       │  Sonnet (main thread)
    │  Smart scan   │  - Scan codebase for relevant files
    │  + defaults   │  - Infer scope, constraints, priorities
    │  + discovery  │  - Web search to identify 3-5 candidate approaches
    │  Show summary │  - Present brief + candidate list, user confirms or tweaks
    └──────┬──────┘
           │ user confirms
           ▼
    ┌─────────────┐
    │  RESEARCH    │  Sonnet x3-5 (parallel subagents, one per candidate)
    │  Each agent   │  - Deep-dive: docs, npm stats, GitHub, API review
    │  researches   │  - Multiple Agent tool calls in single response for parallelism
    │  one option   │  - Results returned to skill; skill writes to state files
    └──────┬──────┘
           │ all agents complete
           ▼
    ┌─────────────┐
    │  EVALUATE    │  Sonnet (evaluator subagent)
    │  Synthesize   │  - Compare options on user's priorities
    │  + rank       │  - Generate comparison table
    │  Present 3+1  │  - Top 3 options + "build custom" (with effort estimate)
    └──────┬──────┘
           │ user picks option
           ▼
    ┌─────────────┐
    │  IMPLEMENT   │  Opus high-effort (implementer subagent)
    │  Full auto    │  - Creates branch (autoresearch/<task>-<date>)
    │  on branch    │  - Makes all changes in isolated worktree
    │               │  - Commits frequently to preserve progress
    └──────┬──────┘
           │
           ▼
    ┌─────────────┐
    │  VERIFY      │  Sonnet (verifier subagent)
    │  Multi-layer  │  - Runs in same worktree as implementer
    │  checks       │  - Tests, typecheck, lint
    │               │  - Bundle analysis (checks out main in temp dir for baseline)
    │               │  - Auto-generated benchmarks + static analysis
    └──────┬──────┘
           │
      pass? ──── yes ──▶ Present results + report
           │
           no
           │
           ▼
    ┌─────────────┐
    │  AUTO-FIX    │  Opus high-effort (implementer subagent, re-dispatched)
    │  Fix + retry  │  - Receives verifier failure output as context
    │  (max 3)      │  - Fix and re-verify
    │               │  - Escalate to user after 3 attempts
    └──────┬──────┘
           │
           ▼
      Present results + report
```

### Candidate Discovery

The brief phase includes candidate discovery. The skill (running as Sonnet on the main thread):

1. Analyzes the task description to understand what's needed
2. Scans the codebase for current usage patterns (e.g., how moment.js is used)
3. Performs web searches to identify candidate solutions
4. Presents 3-5 candidates in the brief summary for user confirmation

The user can add, remove, or modify candidates before confirming. Once confirmed, one researcher subagent is dispatched per candidate (min 3, max 5). If fewer than 3 candidates exist, remaining agents explore alternative approaches or architectural variations.

### "Build Custom" Path

When the user selects "build custom" after evaluation:

1. The evaluator's analysis of existing options is passed to the implementer as anti-patterns and inspiration (what works in other libraries, what doesn't)
2. The implementer gets explicit instructions: "Design and build a custom solution from scratch. Use research findings as reference but don't depend on any external library for this functionality."
3. The implementer has the same turn budget (50) but is expected to create tests as part of the implementation
4. The verification pipeline runs identically

### Parallelism Mechanism

Researcher subagents run in parallel by issuing multiple Agent tool calls in a single response from the orchestrating skill. The skill waits for all agents to complete before proceeding. If one agent takes significantly longer, the skill is blocked but this is acceptable since time is not a constraint.

---

## Session State & Persistence

State files live in `.autoresearch/` in the project root, on whatever branch the user is on. This directory is created at brief time (before branching) and updated throughout the flow. This ensures the session resume hook can always find state files regardless of which branch the user is on.

**Key principle (from pi-autoresearch):** A fresh agent with zero context can read `.autoresearch/session.md` + `.autoresearch/log.jsonl` and pick up exactly where the last session left off.

### `.autoresearch/session.md` — Living Session Document

```markdown
# Autoresearch: <task summary>

## Objective
<What we're doing and why>

## Brief
- **Scope**: files affected, packages involved
- **Priorities**: bundle size, performance, API compat, etc.
- **Constraints**: TS required, license restrictions, etc.

## Candidates
<List of candidates identified during discovery>

## Research Findings
<Updated by orchestrating skill after research agents return — candidate options with pros/cons>

## Selected Approach
<What the user chose and why>

## Implementation Log
<What's been done, what worked, what didn't>

## Verification Results
<Test results, bundle analysis, benchmark data>
```

### `.autoresearch/log.jsonl` — Append-Only Structured Log

One line per event. Written exclusively by the orchestrating skill (not by subagents) to avoid write contention. Subagents return structured data to the skill, which serializes writes.

```jsonl
{"type":"brief","timestamp":1711100000,"scope":["src/utils/date.ts"],"priorities":["bundle-size","api-compat"],"candidates":["date-fns","dayjs","temporal-polyfill"]}
{"type":"research","timestamp":1711100060,"agent":"researcher-1","option":"date-fns","summary":"...","scores":{...}}
{"type":"research","timestamp":1711100062,"agent":"researcher-2","option":"dayjs","summary":"...","scores":{...}}
{"type":"decision","timestamp":1711100120,"selected":"dayjs","reason":"user choice"}
{"type":"implement","timestamp":1711100300,"commit":"a1b2c3d","description":"replaced moment imports","files_changed":12}
{"type":"verify","timestamp":1711100400,"tests":"pass","typecheck":"pass","bundle_before":"245kb","bundle_after":"198kb"}
```

### State File Write Ownership

**Only the orchestrating skill writes to state files.** Subagents return structured results to the skill, which updates `.autoresearch/session.md` and appends to `.autoresearch/log.jsonl`. This prevents race conditions from parallel researchers and ensures consistency between worktree-isolated agents and the main project.

### `.gitignore` Entry

The `.autoresearch/` directory should be added to `.gitignore` — it's session-local state, not project code. The skill handles this automatically on first run.

---

## Component Details

### 1. Research Skill (`/research`)

The entry point. Orchestrates the full flow — calls subagents, manages state files, handles user checkpoints.

```yaml
---
name: research
description: >
  Autonomous research-driven coding. Researches options, presents choices,
  implements with full verification. Use when asked to research, replace,
  evaluate, or find the best approach for a coding task.
argument-hint: "<task description>"
user-invocable: true
---
```

**Responsibilities:**
- Parse the user's task description
- Scan codebase to generate smart defaults for the brief
- Discover 3-5 candidate approaches via web search
- Present brief summary + candidates, wait for user confirmation
- Dispatch parallel researcher subagents (multiple Agent calls in one response)
- Collect results from all researchers, write to state files
- Dispatch evaluator subagent to synthesize findings
- Present options (top 3 + "build custom"), wait for user selection
- Dispatch implementer subagent (in worktree)
- Dispatch verifier subagent (in same worktree)
- If verification fails, re-dispatch implementer with failure context (up to 3x)
- Present final report with verification data

### 2. Researcher Agent

```yaml
---
name: researcher
model: sonnet
tools: WebSearch, WebFetch, Read, Grep, Glob, Bash
maxTurns: 30
---
```

Spawned 3-5 times in parallel (one per candidate). Each instance deep-dives one candidate solution.

**Evaluates:**
- npm download trends, GitHub stars, last commit, open issues/CVEs
- Documentation quality and completeness
- API surface area and ergonomics
- Bundle size (bundlephobia data)
- TypeScript support quality
- Migration path complexity from current solution
- Community health (contributors, release cadence)

**Output:** Returns structured findings to the orchestrating skill (not written to files directly).

**Graceful degradation:** If WebSearch/WebFetch are unavailable (user hasn't permitted), the researcher falls back to local analysis: `node_modules` inspection, lock file analysis, existing `package.json` metadata. The skill warns the user that research quality will be reduced without web access.

### 3. Evaluator Agent

```yaml
---
name: evaluator
model: sonnet
tools: Read, Grep, Glob
maxTurns: 15
---
```

Reads all research findings (passed via prompt context from skill), scores each option against user's priorities, generates:
- Comparison table with weighted scores
- Pros/cons per option
- Clear recommendation with reasoning
- The "build custom" option with effort estimate and feasibility assessment

### 4. Implementer Agent

```yaml
---
name: implementer
model: opus
effort: high
tools: Read, Write, Edit, Bash, Grep, Glob
maxTurns: 50
isolation: worktree
---
```

The workhorse. Key behaviors:
- Runs in an **isolated git worktree** (can't corrupt main branch)
- Creates branch `autoresearch/<task-slug>-<date>`
- **Commits frequently** (every significant change) to preserve progress even if context is exhausted
- Returns implementation summary to the orchestrating skill
- Turn budget of 50 (sufficient for complex multi-file changes while staying within context limits)

**If context is exhausted mid-implementation:** The frequent commits ensure progress is saved. The skill can re-dispatch the implementer with instructions to continue from the last commit.

### 5. Verifier Agent

```yaml
---
name: verifier
model: sonnet
tools: Read, Bash, Grep, Glob
maxTurns: 30
---
```

Runs in the **same worktree** as the implementer (the skill passes the worktree path). For bundle analysis, the verifier uses `git stash` or checks out `main` in a temporary directory to snapshot the baseline.

Runs the multi-layer verification pipeline:

1. **Correctness**: existing tests, typecheck, lint
2. **Bundle analysis**: snapshot main (temp checkout) vs branch, compute delta (skipped if no build step detected)
3. **Benchmarks**: run existing scripts + generate targeted micro-benchmarks
4. **Static analysis**: circular deps, unused imports/exports, dead code

Returns structured pass/fail/warn report to the orchestrating skill.

---

## Error Handling

### Research Phase Failures

If a researcher subagent fails (web search timeout, npm registry down, candidate doesn't exist):
- The skill logs the failure to `.autoresearch/log.jsonl`
- Proceeds with results from successful researchers
- If fewer than 2 researchers succeed, the skill informs the user and offers to retry or proceed with limited options

### Cancellation

The user can interrupt at any time by pressing Escape or Ctrl+C in Claude Code. Behavior:
- If a subagent is running, it terminates
- State files reflect the last completed phase (not the interrupted one)
- The session resume hook detects the in-progress session on next startup
- The user can run `/research` again to resume from the last checkpoint, or `/research clear` to reset

### Cost Awareness

Before dispatching the implementation phase (the most expensive part), the skill shows an estimated cost range based on codebase size and task complexity. Example:

```
Estimated cost for implementation + verification: $5-15 (Opus high-effort, ~50 turns)
Proceed? [Y/n]
```

This is the third and final user checkpoint. After confirmation, the implementation runs fully autonomously.

### Worktree Cleanup

The `session-resume.mjs` hook detects orphaned autoresearch worktrees on session start and offers to clean them up. Additionally, `/research clear` removes all state files and worktrees.

---

## Hooks

### `hooks.json`

```json
{
  "SessionStart": [
    {
      "matcher": "startup|resume",
      "hooks": [
        {
          "type": "command",
          "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/session-resume.mjs\""
        }
      ]
    }
  ]
}
```

**`session-resume.mjs`**: On session start/resume:
1. Checks if `.autoresearch/session.md` exists in the project root
2. If found, reads the session state and injects a summary via stdout (`additionalContext`)
3. Detects orphaned worktrees from previous autoresearch runs, offers cleanup
4. Reconciles state: compares what `log.jsonl` claims vs actual git state (branch exists, commits present)
5. If state diverges, logs a warning in the injected context

---

## Installation

```
/plugin marketplace add zain/autoresearch
```

Then select and install. The plugin provides:
- `/research` slash command (entry point for all tasks)
- `/research clear` — reset state, clean up worktrees
- 4 specialized subagents (researcher, evaluator, implementer, verifier)
- Session hooks for resume support
- Verification scripts

---

## Future Considerations (not in v1)

- **Task-type detection**: Infer whether task is dependency replacement, refactor, feature build, etc. and adapt strategy per type
- **Parallel implementation**: Try multiple options simultaneously in separate worktrees, compare results
- **Learning from history**: Use `.autoresearch/log.jsonl` across sessions to improve research quality
- **Custom verification plugins**: Let users define project-specific verification checks
- **Dashboard/status widget**: Rich progress display during long-running research
- **Multiple research commands**: Specialized variants like `/research:replace`, `/research:refactor`, etc.
- **Budget cap flag**: `--budget $20` to hard-stop if estimated cost exceeds threshold
