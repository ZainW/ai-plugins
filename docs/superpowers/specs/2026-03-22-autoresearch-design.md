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
| Upfront brief | Sonnet | Fast interaction, smart defaults |
| Research (parallel) | Sonnet x3+ | 1M context for ingesting full docs, better judgment on library quality than Haiku |
| Evaluation + ranking | Sonnet | Synthesis of research into ranked comparison |
| Implementation | Opus high-effort | Best coding model (80.8% SWE-bench), tasks skew hard |
| Auto-fix on failure | Opus high-effort | Retry with fresh approach, same quality bar |
| Verification | Sonnet | Script execution + result parsing |

**Why Sonnet over Haiku for research:** The 1M context window (vs Haiku's 200k) allows ingesting entire library docs in one pass. Research agents make qualitative judgments ("is this API well-designed?", "is this project well-maintained?") where Sonnet's reasoning advantage matters. Cost difference per research run is ~$0.50 — negligible.

**Why Opus for implementation:** Despite Sonnet 4.6 being 79.6% on SWE-bench (only 1.2% behind Opus), autoresearch targets harder-than-average tasks: multi-file refactors, dependency replacements, building custom solutions. The 1.2% gap compounds on hard tasks, and since time is not a constraint, Opus is the right call.

### Autonomy Model

- **Full auto** for research, implementation, verification, and auto-fix
- **Two user checkpoints:**
  1. After brief generation — confirm scope/priorities/constraints (smart defaults, just hit enter if they look right)
  2. After evaluation — pick from top 3 options + "build custom"
- Auto-fix loop retries up to 5 times on verification failure before escalating to user

### Verification Strategy

Multi-layer pipeline with blocking vs. warning severity:

| Check | Method | On Failure |
|-------|--------|------------|
| Tests | Detect and run existing test command | **Block** (auto-fix) |
| Typecheck | `tsc --noEmit` or equivalent | **Block** (auto-fix) |
| Lint | Detect and run existing linter | **Block** (auto-fix) |
| Bundle size | Snapshot before (main) vs after (branch) | **Warn** if >10% increase |
| Benchmarks (existing) | Run existing bench scripts | **Report** |
| Benchmarks (generated) | Create targeted micro-benchmarks | **Report** |
| Static analysis | Circular deps, unused exports, dead code | **Warn** |

"Block" triggers the auto-fix loop. "Warn" and "Report" are included in the final report but don't trigger auto-fix.

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
│   └── hooks.json                     # session state tracking
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
    │  Show summary │  - Present brief, user confirms or tweaks
    └──────┬──────┘
           │ user confirms
           ▼
    ┌─────────────┐
    │  RESEARCH    │  Sonnet x3+ (parallel subagents)
    │  Each agent   │  - Web search, docs, npm stats, GitHub
    │  researches   │  - One agent per candidate approach
    │  one option   │  - Results written to session state
    └──────┬──────┘
           │
           ▼
    ┌─────────────┐
    │  EVALUATE    │  Sonnet (evaluator subagent)
    │  Synthesize   │  - Compare options on user's priorities
    │  + rank       │  - Generate comparison table
    │  Present 3+1  │  - Top 3 options + "build custom"
    └──────┬──────┘
           │ user picks option
           ▼
    ┌─────────────┐
    │  IMPLEMENT   │  Opus high-effort (implementer subagent)
    │  Full auto    │  - Creates branch (autoresearch/<task>-<date>)
    │  on branch    │  - Makes all changes in isolated worktree
    │               │  - Commits incrementally
    └──────┬──────┘
           │
           ▼
    ┌─────────────┐
    │  VERIFY      │  Sonnet (verifier subagent)
    │  Multi-layer  │  - Tests, typecheck, lint
    │  checks       │  - Bundle analysis (before/after)
    │               │  - Auto-generated benchmarks
    │               │  - Static analysis
    └──────┬──────┘
           │
      pass? ──── yes ──▶ Present results + report
           │
           no
           │
           ▼
    ┌─────────────┐
    │  AUTO-FIX    │  Opus high-effort (implementer subagent)
    │  Fix + retry  │  - Analyze failure from verifier output
    │  (max 5)      │  - Fix and re-verify
    │               │  - Escalate to user after 5 attempts
    └──────┬──────┘
           │
           ▼
      Present results + report
```

---

## Session State & Persistence

Like pi-autoresearch, the plugin persists state so it survives context resets.
Files live in the project root on the research branch.

**Key principle (from pi-autoresearch):** A fresh agent with zero context can read `autoresearch.md` + `autoresearch.jsonl` and pick up exactly where the last session left off.

### `autoresearch.md` — Living Session Document

```markdown
# Autoresearch: <task summary>

## Objective
<What we're doing and why>

## Brief
- **Scope**: files affected, packages involved
- **Priorities**: bundle size, performance, API compat, etc.
- **Constraints**: TS required, license restrictions, etc.

## Research Findings
<Updated by research agents — candidate options with pros/cons>

## Selected Approach
<What the user chose and why>

## Implementation Log
<What's been done, what worked, what didn't>

## Verification Results
<Test results, bundle analysis, benchmark data>
```

### `autoresearch.jsonl` — Append-Only Structured Log

One line per event. Enables any agent to reconstruct the full history:

```jsonl
{"type":"brief","timestamp":1711100000,"scope":["src/utils/date.ts"],"priorities":["bundle-size","api-compat"]}
{"type":"research","timestamp":1711100060,"agent":"researcher-1","option":"date-fns","summary":"...","scores":{...}}
{"type":"research","timestamp":1711100062,"agent":"researcher-2","option":"dayjs","summary":"...","scores":{...}}
{"type":"decision","timestamp":1711100120,"selected":"dayjs","reason":"user choice"}
{"type":"implement","timestamp":1711100300,"commit":"a1b2c3d","description":"replaced moment imports","files_changed":12}
{"type":"verify","timestamp":1711100400,"tests":"pass","typecheck":"pass","bundle_before":"245kb","bundle_after":"198kb"}
```

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
- Present brief summary, wait for user confirmation
- Dispatch parallel researcher subagents
- Dispatch evaluator subagent to synthesize findings
- Present options (top 3 + "build custom"), wait for user selection
- Dispatch implementer subagent
- Dispatch verifier subagent
- If verification fails, re-dispatch implementer with failure context (up to 5x)
- Present final report

### 2. Researcher Agent

```yaml
---
name: researcher
model: sonnet
tools: WebSearch, WebFetch, Read, Grep, Glob, Bash
maxTurns: 30
---
```

Spawned 3+ times in parallel. Each instance researches one candidate solution.

**Evaluates:**
- npm download trends, GitHub stars, last commit, open issues/CVEs
- Documentation quality and completeness
- API surface area and ergonomics
- Bundle size (bundlephobia data)
- TypeScript support quality
- Migration path complexity from current solution
- Community health (contributors, release cadence)

**Output:** Structured findings written to `autoresearch.jsonl`.

### 3. Evaluator Agent

```yaml
---
name: evaluator
model: sonnet
tools: Read, Grep, Glob
maxTurns: 15
---
```

Reads all research findings, scores each option against user's priorities, generates:
- Comparison table with weighted scores
- Pros/cons per option
- Clear recommendation with reasoning
- The "build custom" option with effort estimate

### 4. Implementer Agent

```yaml
---
name: implementer
model: opus
effort: high
tools: Read, Write, Edit, Bash, Grep, Glob
maxTurns: 100
isolation: worktree
---
```

The workhorse. Key behaviors:
- Runs in an **isolated git worktree** (can't corrupt main branch)
- Creates branch `autoresearch/<task-slug>-<date>`
- Makes incremental commits with clear messages
- Updates `autoresearch.md` implementation log as it works
- Appends to `autoresearch.jsonl` after each significant change
- High turn budget (100) for complex multi-file changes

### 5. Verifier Agent

```yaml
---
name: verifier
model: sonnet
tools: Read, Bash, Grep, Glob
maxTurns: 30
---
```

Runs the multi-layer verification pipeline:

1. **Correctness**: existing tests, typecheck, lint
2. **Bundle analysis**: snapshot main vs branch, compute delta
3. **Benchmarks**: run existing scripts + generate targeted micro-benchmarks
4. **Static analysis**: circular deps, unused imports/exports, dead code

Produces structured pass/fail/warn report appended to `autoresearch.jsonl`.

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

**`session-resume.mjs`**: On session start/resume, checks if `autoresearch.md` exists in the project. If so, injects a reminder that a research session is in progress with a summary of current state. This enables seamless resume after context compaction or session restart.

---

## Installation

```
/plugin marketplace add zain/autoresearch
```

Then select and install. The plugin provides:
- `/research` slash command
- 4 specialized subagents (researcher, evaluator, implementer, verifier)
- Session hooks for resume support
- Verification scripts

---

## Future Considerations (not in v1)

- **Task-type detection**: Infer whether task is dependency replacement, refactor, feature build, etc. and adapt strategy per type
- **Parallel implementation**: Try multiple options simultaneously in separate worktrees, compare results
- **Learning from history**: Use `autoresearch.jsonl` across sessions to improve research quality
- **Custom verification plugins**: Let users define project-specific verification checks
- **Dashboard/status widget**: Rich progress display during long-running research
- **Multiple research commands**: Specialized variants like `/research:replace`, `/research:refactor`, etc.
