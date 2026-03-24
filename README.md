# ai-plugins

> **Early work-in-progress.** These plugins work and produce high-quality output, but the experience is rough around the edges. Expect lots of permission prompts to accept, some UI jank, and a workflow that isn't yet polished. The results, however, are genuinely good.

A monorepo of [Claude Code](https://docs.anthropic.com/en/docs/claude-code) plugins that make Claude research before it codes.

## Plugins

### `/research` — autoresearch

Autonomous research-driven coding. Instead of jumping straight to implementation, Claude researches multiple options, scores them, presents you with a ranked comparison, and only implements after you pick a winner.

**Inspired by** [Andrej Karpathy](https://github.com/karpathy)'s autoresearch concept and [pi-autoresearch](https://github.com/davebcn87/pi-autoresearch) by [davebcn87](https://github.com/davebcn87).

**Pipeline:**
1. **Brief** — Scans your codebase, discovers 3-5 candidate approaches, presents a brief for confirmation
2. **Research** — Dispatches parallel research agents (one per candidate) that deep-dive into docs, bundle size, maintenance health, API design, community activity
3. **Evaluate** — Synthesizes all research into a ranked recommendation with trade-off analysis
4. **Decide** — You pick the winner (or accept the recommendation)
5. **Implement** — Executes in an isolated git worktree so your working tree stays clean
6. **Verify** — Runs tests, typecheck, lint, bundle analysis
7. **Auto-fix** — If verification fails, automatically retries (up to 3 attempts)
8. **Report** — Final summary with the branch ready to merge

**Example:**
```
/research replace moment.js with a lighter alternative
```

### `/spec` — autospec

Spec-driven coding. Paste a spec from anywhere — Google Docs, Jira, Slack, an email from your boss — and Claude will review it for gaps, ask clarifying questions, then implement it.

**Pipeline:**
1. **Intake** — Analyzes the spec, classifies it as prescriptive / directional / open-ended, identifies gaps
2. **Interrogation** — Asks you targeted questions to fill gaps (skipped if spec is airtight)
3. **Routing** — Based on prescriptiveness:
   - *Prescriptive* → straight to implementation
   - *Directional* → light research on specific technical questions
   - *Open-ended* → full research pipeline (delegates to autoresearch agents)
4. **Plan** — Presents an implementation plan for approval
5. **Implement** — Executes in an isolated git worktree
6. **Verify** — Tests, typecheck, lint, bundle analysis, auto-fix on failure

**Example:**
```
/spec Here's the PRD my PM sent: [paste spec]
```

## Installation

### Prerequisites

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI installed and working
- A Claude Code plan that supports plugins (Pro, Team, or Enterprise)

### Install the plugins

From your terminal:

```bash
# Install autoresearch
claude plugin add /path/to/ai-plugins/autoresearch

# Install autospec
claude plugin add /path/to/ai-plugins/autospec
```

Or if published to a registry:

```bash
claude plugin add autoresearch
claude plugin add autospec
```

After installing, the `/research` and `/spec` slash commands become available in any Claude Code session.

### Verify installation

```bash
# Should list both plugins
claude plugin list
```

## Usage

### Basic usage

```bash
# Start a Claude Code session in your project
claude

# Run autoresearch
/research replace our REST client with something better

# Run autospec
/spec implement user authentication with OAuth2 and refresh tokens
```

### What to expect (honest version)

1. **Lots of permission prompts.** The plugins dispatch multiple subagents that read files, search the web, write to disk, create git branches, and run shell commands. You'll be accepting tool permissions frequently. This is the biggest UX pain point right now.

2. **It takes a while.** A full research pipeline with 4 candidates can take 5-10+ minutes. It's doing real work — web searches, documentation analysis, codebase scanning — but it's not instant.

3. **The UI can be noisy.** You'll see agent dispatches, state file writes, and structured log updates scrolling by. The intermediate output isn't pretty, but it's transparent.

4. **The output is genuinely good.** Despite the rough experience, the final implementation quality is high. Research is thorough, trade-off analysis is real, and implementation happens in isolated branches so nothing breaks your working tree.

### Session management

Both plugins maintain state in their respective directories (`.autoresearch/` and `.autospec/`). Sessions are resumable — if Claude Code crashes or you close the terminal, the plugin picks up where it left off on next launch.

```bash
# Clear a session and start fresh
/research clear
/spec clear
```

### Configuration (optional)

Create a config file to override defaults:

```bash
# For autoresearch
echo '{"maxRetries": 5, "maxResearchers": 6}' > .autoresearch/config.json

# For autospec
echo '{"maxRetries": 5, "maxInterrogationRounds": 3}' > .autospec/config.json
```

## Architecture

```
ai-plugins/
├── autoresearch/
│   ├── .claude-plugin/plugin.json    # Plugin manifest
│   ├── skills/research/SKILL.md      # Orchestrator (the brain)
│   ├── agents/
│   │   ├── researcher/               # Parallel research (Sonnet)
│   │   ├── evaluator/                # Synthesis + ranking (Sonnet)
│   │   ├── implementer/              # Code execution (Opus)
│   │   └── verifier/                 # Test/lint/typecheck (Sonnet)
│   └── hooks/                        # Session resume on startup
├── autospec/
│   ├── .claude-plugin/plugin.json    # Plugin manifest
│   ├── skills/spec/SKILL.md          # Orchestrator (the brain)
│   ├── agents/
│   │   ├── analyzer/                 # Spec review + gap detection (Sonnet)
│   │   ├── interrogator/             # Question generation (Sonnet)
│   │   ├── researcher/               # Targeted research (Sonnet)
│   │   ├── implementer/              # Code execution (Opus)
│   │   └── verifier/                 # Test/lint/typecheck (Sonnet)
│   └── hooks/                        # Session resume on startup
└── docs/                             # Design specs (reference only)
```

**Key design decisions:**
- **Skills ARE the orchestrators.** The `SKILL.md` files contain the full pipeline logic — they're not just descriptions, they're the actual prompts Claude follows step-by-step.
- **Subagents are specialized.** Research and verification use Sonnet (fast, cheap). Implementation uses Opus (best code quality).
- **Isolated worktrees.** Implementation happens in git worktrees so your working directory is never touched until you merge.
- **Resumable sessions.** All state is written to `.autoresearch/` or `.autospec/` as structured JSONL, so sessions survive crashes.

## Known Issues & Limitations

- **Permission fatigue** — You'll accept a lot of tool permissions. There's no "allow all" for plugin subagents yet.
- **No streaming UI** — Subagent output isn't streamed back in real-time; you see results when each phase completes.
- **Web search optional** — Research quality is significantly better with WebSearch/WebFetch permissions enabled. Without them, the plugin falls back to local analysis only.
- **Single session per directory** — Each plugin tracks one active session per project directory. Use `/research clear` or `/spec clear` to start over.
- **Git worktree cleanup** — If a session is interrupted, orphaned worktrees may need manual cleanup (`git worktree prune`).

## Contributing

This is early-stage work. If you're interested in improving these plugins, the most impactful areas are:

1. **Reducing permission prompts** — Finding ways to batch or pre-authorize tool calls
2. **Better progress UI** — Surfacing subagent progress in a cleaner way
3. **More agent types** — Security auditor, performance profiler, accessibility checker
4. **Test coverage** — The plugins themselves have no tests yet

## License

MIT
