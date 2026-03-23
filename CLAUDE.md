# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A monorepo of Claude Code plugins. Currently contains two plugins:

- **autoresearch** — Autonomous research-driven coding. Runs a six-phase pipeline (brief → research → evaluate → implement → verify → auto-fix) before writing production code. Invoked via `/research`.
- **autospec** — Spec-driven coding. Takes freeform specs from any source, reviews for gaps, asks clarifying questions, routes to implementation based on prescriptiveness (prescriptive → direct implement, directional → light research, open-ended → full research). Invoked via `/spec`.

## Repository Structure

```
ai-plugins/
├── autoresearch/                  # The autoresearch plugin
│   ├── .claude-plugin/plugin.json # Plugin manifest (name, version, description)
│   ├── skills/research/SKILL.md   # The /research skill — orchestrator prompt with full pipeline logic
│   ├── agents/                    # Subagent system prompts (markdown with YAML frontmatter)
│   │   ├── researcher/            # Parallel research agents (Sonnet, web+codebase analysis)
│   │   ├── evaluator/             # Synthesizes research into ranked recommendations (Sonnet)
│   │   ├── implementer/           # Executes chosen approach in isolated worktree (Opus)
│   │   └── verifier/              # Runs tests, typecheck, lint, bundle analysis (Sonnet)
│   └── hooks/
│       ├── hooks.json             # Hook configuration (SessionStart → session-resume)
│       └── session-resume.mjs     # Detects in-progress sessions on startup, injects context
├── autospec/                      # The autospec plugin
│   ├── .claude-plugin/plugin.json # Plugin manifest
│   ├── skills/spec/SKILL.md       # The /spec skill — orchestrator prompt with full pipeline logic
│   ├── agents/                    # Subagent system prompts
│   │   ├── analyzer/              # Reviews spec, classifies prescriptiveness, finds gaps (Sonnet)
│   │   ├── interrogator/          # Converts gaps into targeted questions for user (Sonnet)
│   │   ├── researcher/            # Light research on specific technical questions (Sonnet)
│   │   ├── implementer/           # Executes refined spec in isolated worktree (Opus)
│   │   └── verifier/              # Runs tests, typecheck, lint, bundle analysis (Sonnet)
│   └── hooks/
│       ├── hooks.json             # Hook configuration (SessionStart → session-resume)
│       └── session-resume.mjs     # Detects in-progress sessions on startup, injects context
└── docs/superpowers/              # Design specs and plans (reference only, not shipped)
```

## Architecture

### Plugin System

Plugins use Claude Code's native extension points:
- **`.claude-plugin/plugin.json`** — Plugin manifest with metadata
- **`skills/`** — User-invocable skills (markdown files with YAML frontmatter). The skill's `SKILL.md` IS the orchestrator — it contains the full pipeline logic that Claude follows step-by-step
- **`agents/`** — Subagent definitions (markdown with frontmatter specifying `model`, `tools`, `maxTurns`, `isolation`). These are dispatched via the Agent tool by the orchestrator skill
- **`hooks/`** — `hooks.json` maps events (like `SessionStart`) to scripts

### Autoresearch Pipeline

The `/research` skill (in `skills/research/SKILL.md`) is the orchestrator. It:
1. Runs Phases 1-8 sequentially, dispatching subagents via the Agent tool
2. Writes ALL state to `.autoresearch/` (session.md + log.jsonl) — subagents return text, the orchestrator serializes
3. Dispatches researchers in PARALLEL (multiple Agent calls in one response)
4. Has two user checkpoints: brief confirmation (Phase 1) and option selection (Phase 3)
5. Resumes interrupted sessions by reading the last event type from `log.jsonl`

### Autospec Pipeline

The `/spec` skill (in `skills/spec/SKILL.md`) is the orchestrator. It:
1. Runs Phases 1-6: intake → interrogation → routing → plan → implement → verify
2. Writes ALL state to `.autospec/` (session.md + log.jsonl + spec.md) — subagents return text, the orchestrator serializes
3. Classifies specs as prescriptive/directional/open-ended and routes accordingly
4. Has two user checkpoints: interrogation (Phase 2) and implementation plan (Phase 4), plus routing choice (Phase 3)
5. Can delegate to autoresearch's agents for full research on open-ended specs
6. Resumes interrupted sessions by reading the last event type from `log.jsonl`

### Model Allocation Convention

Agent frontmatter declares the model (`model: sonnet` or `model: opus`). Research/evaluation/verification use Sonnet for cost efficiency. Implementation/auto-fix use Opus for code quality on hard tasks.

### State Files

**`.autoresearch/`** (autoresearch plugin):
- `session.md` — Human-readable session state, updated after each phase
- `log.jsonl` — Append-only structured log with typed events (brief, research, evaluation, decision, implement, verify, autofix, complete)
- `config.json` — Optional user overrides (maxRetries, maxImplementerTurns, maxResearchers)

**`.autospec/`** (autospec plugin):
- `session.md` — Human-readable session state, updated after each phase
- `log.jsonl` — Append-only structured log with typed events (intake, interrogation, spec_refined, routing, research, evaluation, research_routed, plan, implement, verify, autofix, complete)
- `spec.md` — The refined spec after gap-filling (primary artifact, fed to implementer)
- `config.json` — Optional user overrides (maxRetries, maxImplementerTurns, maxInterrogationRounds, maxResearchers)

## Key Conventions

- Agent markdown files use YAML frontmatter for config (`name`, `description`, `model`, `tools`, `maxTurns`, `isolation`)
- Subagents are read-only (no file writes) except the implementer, which works in an isolated git worktree
- Hooks must never crash Claude Code startup — all error paths exit 0
- The session-resume hook reads stdin JSON, emits stdout JSON with `additionalContext`
- Branch naming: `autoresearch/<task-slug>-<date>` or `autospec/<task-slug>-<date>`
