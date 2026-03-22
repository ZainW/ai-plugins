# autoresearch

Autonomous research-driven coding for Claude Code.

---

## Examples

```bash
# Add a new feature
/research add stripe subscription billing with webhook handling

# Fix a bug
/research fix the race condition in the WebSocket reconnect logic

# Refactor existing code
/research refactor the auth middleware to use JWT refresh tokens
```

---

## How It Works

autoresearch runs a six-step pipeline before writing a single line of production code:

| Step | Agent | What Happens |
|------|-------|--------------|
| 1. **Brief** | Orchestrator (Sonnet) | Parses the task, writes `.autoresearch/session.md` with goals and constraints |
| 2. **Research** | Researcher × 3–5 (Sonnet) | Spawns parallel subagents, each deep-diving one candidate approach via web search and codebase analysis |
| 3. **Evaluate** | Evaluator (Sonnet) | Synthesizes all research findings, ranks approaches, outputs a structured recommendation |
| 4. **Implement** | Implementer (Opus) | Receives the top-ranked approach and implements it with full context, high effort |
| 5. **Verify** | Verifier (Sonnet) | Detects the project's toolchain and runs type-checks, tests, linting, and build |
| 6. **Auto-fix** | Implementer (Opus) | If verification fails, receives the error report and auto-fixes up to `maxRetries` times |

All state is written to `.autoresearch/` in append-only logs. If the session is interrupted, it resumes automatically on the next Claude Code startup.

---

## Installation

```bash
/plugin marketplace add ZainW/autoresearch
```

---

## Usage

Start a research task:

```bash
/research <task description>
```

Clear session state (start fresh):

```bash
/research clear
```

---

## Configuration

Create `.autoresearch/config.json` in your project root to override defaults:

```json
{
  "maxRetries": 3,
  "maxImplementerTurns": 50,
  "maxResearchers": 5
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `maxRetries` | `3` | Max auto-fix attempts if verification fails |
| `maxImplementerTurns` | `50` | Max turns for the implementer subagent per attempt |
| `maxResearchers` | `5` | Number of parallel researcher subagents (3–5 recommended) |

---

## Model Allocation

| Step | Model | Reason |
|------|-------|--------|
| Brief | Claude Sonnet | Fast, structured parsing |
| Research | Claude Sonnet | Parallel — cost-efficient at scale |
| Evaluate | Claude Sonnet | Synthesis and ranking, no code generation |
| Implement | Claude Opus | Highest-quality code generation |
| Verify | Claude Sonnet | Toolchain detection and test execution |
| Auto-fix | Claude Opus | Bug fixes require the same quality as implementation |

---

## Requirements

- **Claude Max** subscription recommended — the implementation and auto-fix steps use Opus with high turn counts
- **WebSearch** and **WebFetch** permissions enabled for full research capability (the researcher agents will degrade gracefully to codebase-only research if these are unavailable)
- Node.js (for the session-resume hook)

---

## Credits & Inspiration

This plugin would not exist without the work of two people:

- **[Andrej Karpathy](https://github.com/karpathy)** — for the autoresearch concept: the idea of autonomously researching multiple approaches before committing to an implementation.

- **[davebcn87](https://github.com/davebcn87)** — for **[pi-autoresearch](https://github.com/davebcn87/pi-autoresearch)**, which established the implementation pattern this plugin is built on: persistent session state, append-only logging, and session resumability across interruptions.

This plugin adapts that pattern for Claude Code's native subagent architecture — replacing custom process orchestration with Claude Code's built-in agent dispatch, hooks system, and model-routing capabilities.

---

## License

MIT. See [LICENSE](./LICENSE).
