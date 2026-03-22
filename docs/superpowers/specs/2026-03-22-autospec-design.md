# Autospec — Spec-Driven Coding Plugin for Claude Code

**Date:** 2026-03-22
**Status:** Design approved, pending implementation

## Overview

Autospec is a Claude Code plugin that takes freeform specs (from any source — Google Docs, Jira, Slack, markdown, email) and turns them into implemented, verified code. It reviews the spec for gaps, asks the user targeted questions to fill blanks, then routes to implementation based on how prescriptive the spec is.

Sits alongside autoresearch in the `ai-plugins` monorepo. Separate plugin, same architectural patterns.

## Plugin Structure

```
autospec/
├── .claude-plugin/plugin.json        # Plugin manifest
├── skills/spec/SKILL.md              # The /spec skill — orchestrator prompt
├── agents/
│   ├── analyzer/analyzer.md          # Reviews spec, classifies gaps + prescriptiveness (Sonnet)
│   ├── interrogator/interrogator.md  # Generates targeted questions from gap analysis (Sonnet)
│   ├── researcher/researcher.md      # Light research on specific technical questions (Sonnet)
│   ├── implementer/implementer.md    # Executes refined spec in isolated worktree (Opus)
│   └── verifier/verifier.md          # Runs verification pipeline (Sonnet)
├── hooks/
│   ├── hooks.json                    # SessionStart → detect in-progress sessions
│   └── session-resume.mjs            # Detects .autospec/ state, injects context
└── README.md
```

**Invocation:** `/spec <paste or describe the spec here>`

**State directory:** `.autospec/`
- `session.md` — human-readable session state
- `log.jsonl` — append-only structured log
- `config.json` — optional user overrides
- `spec.md` — the refined spec after gap-filling (primary artifact)

**Branch naming:** `autospec/<task-slug>-<date>`

## Pipeline

### Phase 1: Intake + Analysis

The analyzer agent receives the raw spec text and codebase scan results.

**Two outputs:**

1. **Prescriptiveness classification:**
   - **Prescriptive** — spec names specific technologies, has detailed acceptance criteria, leaves little room for interpretation. Example: "Add Stripe checkout using their embedded form, store subscription status in the users table, webhook at /api/webhooks/stripe"
   - **Directional** — spec describes what to build and gives some guidance but leaves technical choices open. Example: "Add a payment system, should support subscriptions, needs to work with our existing auth"
   - **Open-ended** — spec describes a problem or goal without prescribing an approach. Example: "Users need a way to upgrade to premium"

2. **Gap detection** across four categories:
   - **Technical gaps** — unspecified technologies, missing architecture decisions
   - **Criteria gaps** — unclear "done" state, missing edge cases, no error handling guidance
   - **Context gaps** — doesn't account for existing codebase patterns, conflicts with current code, missing integration points
   - **Scope gaps** — ambiguous boundaries, unclear what's in/out of scope

   Each gap is tagged with severity: `blocking` (must clarify before proceeding) or `nice-to-clarify` (can assume a smart default).

### Phase 2: Interrogation (User Checkpoint #1)

The interrogator agent turns the gap analysis into natural, conversational questions. Not a robotic checklist — it should feel like a sharp tech lead reviewing your spec.

Key behaviors:
- Groups related gaps into single questions where possible
- Proposes smart defaults for nice-to-clarify gaps ("I'll assume X unless you say otherwise")
- Asks blocking gaps directly ("The spec says 'add auth' — which provider?")
- References codebase context ("You're already using Prisma with a `users` table — should I add the subscription fields there?")

**Interrogation loop mechanism:**

1. Orchestrator dispatches the interrogator agent with the analyzer output
2. Interrogator returns a numbered list of questions (with smart defaults where applicable)
3. Orchestrator presents questions to user, collects answers
4. Orchestrator checks: are any blocking gaps still unresolved?
   - If yes: re-dispatch interrogator with the original analysis + user's answers so far, asking it to generate follow-up questions for remaining blocking gaps
   - If no: proceed to spec refinement
5. Max rounds controlled by `maxInterrogationRounds` config (default: 5). If exceeded, orchestrator proceeds with best-effort defaults and warns the user.

Each round is logged as an `interrogation` event with `gaps_remaining` count.

**Minimum input threshold:** If the raw spec is trivially short (under ~50 words with no concrete requirements), the orchestrator prompts the user for more detail before dispatching the analyzer: "That's pretty brief — can you paste the full spec or give me more detail on what needs to be built?"

After all gaps are filled, the orchestrator writes the refined spec to `.autospec/spec.md`.

### Phase 3: Routing Decision

Based on prescriptiveness classification + user answers, the orchestrator proposes a route:

| Classification | Route | What happens |
|---|---|---|
| Prescriptive | Direct to Phase 4 | No research. Spec dictates the approach. |
| Directional | Light research | 1-2 researcher agents (autospec's own `researcher` agent) validate approach + surface best patterns. Results folded into `spec.md` as addendum. |
| Open-ended | Full research | Orchestrator dispatches autoresearch's agents directly via the Agent tool (researcher, evaluator) rather than invoking `/research` as a skill. Results folded into `spec.md`. See "Cross-plugin research delegation" below. |

**The route is presented to the user, not silently decided:**

```
## Spec Classification: Directional

Your spec describes what to build but leaves some technical choices open.
I'd like to do a quick research pass on [specific topic] before implementing.

Options:
1. Quick research (recommended) — I'll check best approaches for [topic]
2. Skip research — just implement with [my best guess default]
3. Full research — run the complete /research pipeline on this

Which approach? (1/2/3)
```

**Cross-plugin research delegation:**

When routing to full research (open-ended specs), autospec does NOT invoke `/research` as a skill (skills can't invoke other skills programmatically). Instead, the orchestrator reads the agent definitions from `../autoresearch/agents/` and dispatches them directly via the Agent tool:

1. Orchestrator reads `../autoresearch/agents/researcher/researcher.md` to get the researcher prompt
2. Dispatches parallel researcher agents (same as autoresearch Phase 2)
3. Reads `../autoresearch/agents/evaluator/evaluator.md` to get the evaluator prompt
4. Dispatches evaluator agent with research findings (same as autoresearch Phase 3)
5. Presents ranked options to user for selection
6. Folds selected approach into `spec.md` as a "Research Addendum" section

All research results are logged to autospec's own `.autospec/log.jsonl` (using `research_routed` + additional `research` and `evaluation` events), NOT to `.autoresearch/`.

**Fallback:** If autoresearch is not installed (agent files not found at `../autoresearch/agents/`), the orchestrator falls back to autospec's own `researcher` agent for light research, warns the user: "Full research requires the autoresearch plugin. Running light research instead."

### Phase 4: Implementation Plan (User Checkpoint #2)

Before any code is written, the orchestrator presents a concrete plan:

- Files to create and modify
- Order of operations
- Key decisions derived from the spec
- Any assumptions being made

User approves or adjusts. This is the "here's what I'm going to build" gate.

### Phase 5: Implementation

The implementer agent executes in an isolated git worktree. Its primary input is `spec.md` — the refined spec is the source of truth.

Same patterns as autoresearch's implementer:
- Incremental commits
- Branch: `autospec/<task-slug>-<date>`
- Returns structured summary

Key difference: the implementer is *executing a reviewed spec*, not making architectural decisions. The prompt emphasizes fidelity to the spec.

### Phase 6: Verification + Auto-fix

Identical pattern to autoresearch:
- Verifier runs tests, typecheck, lint, bundle analysis, benchmarks, static analysis
- On FAIL: auto-fix loop (up to 3 retries, configurable via `config.json`)
- On PASS/WARN: final report

### Final Report

```
## Autospec Complete

**Spec:** [summary]
**Classification:** [prescriptive/directional/open-ended]
**Branch:** `autospec/<task-slug>-<date>`

### Refined Spec
See `.autospec/spec.md`

### Verification Results
[full verification report]

### Changes Summary
- Files changed: [count]
- Commits: [count]
- [key changes listed]

### Next Steps
- Review the changes: `git diff main...autospec/<branch>`
- Merge when ready: `git merge autospec/<branch>`
- Or discard: `git branch -D autospec/<branch>`
```

## Agents

### Analyzer (Sonnet)

- **Model:** Sonnet
- **Tools:** Read, Grep, Glob, WebSearch
- **Max turns:** 20
- **Input:** Raw spec text, codebase context
- **Output:** Classification + gap analysis (text, not file writes)

WebSearch is used to check if named technologies in the spec are current/deprecated (e.g., spec says "use @vercel/postgres" — analyzer flags it as sunset).

### Researcher (Sonnet)

- **Model:** Sonnet
- **Tools:** WebSearch, WebFetch, Read, Grep, Glob, Bash
- **Max turns:** 20
- **Input:** A specific technical question + codebase context
- **Output:** Findings with recommendation (text)

Used for the "directional" light research route. Simpler than autoresearch's researcher — no weighted scoring. Answers a focused question like "What's the best WebSocket library for this Next.js + Prisma stack?" rather than doing a full candidate evaluation.

For the "open-ended" full research route, autospec dispatches autoresearch's researcher and evaluator agents directly (see "Cross-plugin research delegation").

### Interrogator (Sonnet)

- **Model:** Sonnet
- **Tools:** Read, Grep, Glob
- **Max turns:** 15
- **Input:** Analyzer output + raw spec
- **Output:** Numbered questions with smart defaults (text)

### Implementer (Opus)

- **Model:** Opus
- **Effort:** High
- **Tools:** Read, Write, Edit, Bash, Grep, Glob
- **Max turns:** 50
- **Isolation:** Worktree
- **Input:** Refined `spec.md` + implementation plan

### Verifier (Sonnet)

- **Model:** Sonnet
- **Tools:** Read, Bash, Grep, Glob
- **Max turns:** 30
- **Input:** Implementation summary + worktree path

## JSONL Event Schema

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

## Resume Logic

Read last event from `log.jsonl`, jump to the appropriate phase:

| Last event | Resume at |
|---|---|
| `intake` | Phase 2 (interrogation) |
| `interrogation` | Phase 2 (continue questions) |
| `spec_refined` | Phase 3 (routing) |
| `routing` | Resume based on route: direct → Phase 4, light_research → dispatch researchers, full_research → dispatch autoresearch agents |
| `research` | Check if all researchers returned; if so dispatch evaluator, else re-run remaining |
| `evaluation` | Phase 4 (present plan) |
| `research_routed` | Check for `evaluation` event; if found Phase 4, else continue research |
| `plan` | Phase 5 (implementation) — plan was already approved in previous session |
| `implement` | Phase 6 (verification) |
| `verify` FAIL | Auto-fix loop |
| `verify` PASS | Final report |
| `autofix` | Continue from last retry |
| `complete` | Inform user session is done |

**`/spec clear`** removes `.autospec/`, branches, and worktrees.

## Config

Optional `.autospec/config.json` (all values shown are defaults):

```json
{
  "maxRetries": 3,
  "maxImplementerTurns": 50,
  "maxInterrogationRounds": 5,
  "maxResearchers": 3
}
```

- `maxRetries` — auto-fix retry limit before escalating to user
- `maxImplementerTurns` — max Agent turns for the implementer
- `maxInterrogationRounds` — max rounds of Q&A before proceeding with best-effort defaults
- `maxResearchers` — max parallel researcher agents for light/full research

## Key Design Decisions

1. **Separate plugin, not an extension of autoresearch.** Each plugin has a clear identity and can be installed independently. The "duplication" of implementer/verifier prompts is intentional — they'll diverge as the spec context differs from research context.

2. **Refined spec as first-class artifact.** `.autospec/spec.md` is the central document. Everything flows through it — interrogation refines it, research addends to it, the implementer executes from it.

3. **Adaptive routing, not fixed pipeline.** Prescriptive specs skip research entirely. Open-ended specs get full research. The user always sees and approves the routing decision.

4. **Cross-plugin delegation for research.** For open-ended specs, autospec dispatches autoresearch's researcher and evaluator agents directly via the Agent tool (not via `/research` skill invocation, since skills can't invoke other skills). Falls back to autospec's own researcher if autoresearch isn't installed.

5. **Implementation plan checkpoint.** Unlike autoresearch (which has a cost estimate gate), autospec shows "here's what I'm going to build" because the spec is an external contract and the user needs to confirm the interpretation before code is written.
