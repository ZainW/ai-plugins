# Autoresearch Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `autoresearch` Claude Code plugin — an autonomous research-driven coding workflow triggered by `/research <task>`.

**Architecture:** Claude Code plugin with one skill (orchestrator), four subagents (researcher, evaluator, implementer, verifier), a session-resume hook, and persistent state files. The skill dispatches subagents with different model assignments and manages all state writes.

**Tech Stack:** Claude Code plugin system (SKILL.md, agent .md files, hooks.json), Node.js (session-resume hook), Bash (verification scripts)

**Spec:** `docs/superpowers/specs/2026-03-22-autoresearch-design.md`

---

## File Map

```
autoresearch/
├── .claude-plugin/
│   └── plugin.json                    # Plugin manifest with credits
├── skills/
│   └── research/
│       └── SKILL.md                   # Orchestrator skill — the entire flow logic
├── agents/
│   ├── researcher/
│   │   └── researcher.md              # Sonnet parallel research agent
│   ├── evaluator/
│   │   └── evaluator.md               # Sonnet synthesis + ranking agent
│   ├── implementer/
│   │   └── implementer.md             # Opus high-effort coding agent
│   └── verifier/
│       └── verifier.md                # Sonnet verification pipeline agent
├── hooks/
│   ├── hooks.json                     # Hook event registrations
│   └── session-resume.mjs             # SessionStart hook — detect/resume sessions
├── LICENSE                            # MIT license
└── README.md                          # Installation, usage, credits
```

**Note:** The `scripts/` directory from the spec (bundle-analysis.sh, benchmark-runner.sh, static-analysis.sh) is removed. The verifier agent generates and runs these commands inline — shipping static bash scripts would make them brittle across different project setups. The verifier detects the project's toolchain and runs appropriate commands.

---

## Task 1: Plugin Scaffold + Manifest

**Files:**
- Create: `autoresearch/.claude-plugin/plugin.json`
- Create: `autoresearch/LICENSE`

- [ ] **Step 1: Create plugin directory structure**

```bash
mkdir -p autoresearch/.claude-plugin autoresearch/skills/research autoresearch/agents/researcher autoresearch/agents/evaluator autoresearch/agents/implementer autoresearch/agents/verifier autoresearch/hooks
```

- [ ] **Step 2: Write plugin.json manifest**

Create `autoresearch/.claude-plugin/plugin.json`:

```json
{
  "name": "autoresearch",
  "description": "Autonomous research-driven coding for Claude Code. Research options, present choices, implement with full verification. Inspired by Andrej Karpathy's autoresearch concept and pi-autoresearch by davebcn87.",
  "version": "0.1.0",
  "author": {
    "name": "Zain"
  },
  "homepage": "https://github.com/zain/autoresearch",
  "repository": "https://github.com/zain/autoresearch",
  "license": "MIT"
}
```

- [ ] **Step 3: Write MIT LICENSE file**

Create `autoresearch/LICENSE` with standard MIT license text, copyright 2026 Zain.

- [ ] **Step 4: Verify directory structure**

```bash
find autoresearch -type f | sort
```

Expected output shows plugin.json and LICENSE.

- [ ] **Step 5: Commit**

```bash
git add autoresearch/
git commit -m "feat: scaffold autoresearch plugin with manifest and license"
```

---

## Task 2: Researcher Agent

**Files:**
- Create: `autoresearch/agents/researcher/researcher.md`

The researcher is spawned 3-5 times in parallel. Each instance deep-dives one candidate solution. Must return structured findings (not write to files).

- [ ] **Step 1: Write researcher agent definition**

Create `autoresearch/agents/researcher/researcher.md`:

```markdown
---
name: researcher
description: >
  Deep-dive research on a single candidate solution. Evaluates library/approach
  quality, maintenance health, API design, bundle size, TypeScript support,
  and migration complexity. Returns structured findings.
model: sonnet
tools: WebSearch, WebFetch, Read, Grep, Glob, Bash
maxTurns: 30
---

# Researcher Agent

You are researching a single candidate solution for a coding task. You have been given:
- A **candidate name** (e.g., "date-fns", "dayjs", or an approach like "custom implementation using Intl API")
- The **task context** (what problem is being solved, what's being replaced/refactored)
- The **user's priorities** (e.g., bundle size, performance, API compatibility, maintenance health)
- The **current codebase usage patterns** (how the existing solution is used)

## Your Job

Research this ONE candidate thoroughly. Use web search and documentation to gather real data.

## Research Checklist

Evaluate each of these dimensions. Skip dimensions that don't apply (e.g., npm stats don't apply to a "use native APIs" approach):

1. **Package Health**
   - npm weekly downloads (search npmjs.com or bundlephobia)
   - GitHub stars, open issues, last commit date
   - Release cadence (how often are new versions published?)
   - Known CVEs or security advisories

2. **Bundle Impact**
   - Total bundle size (check bundlephobia.com)
   - Tree-shaking support
   - ESM/CJS dual publishing

3. **API Quality**
   - TypeScript support (built-in types vs @types package vs none)
   - API surface area relative to the current solution
   - Documentation quality and completeness
   - Learning curve for developers familiar with the current solution

4. **Migration Complexity**
   - API compatibility with current usage patterns
   - How many usage patterns need to change?
   - Are there codemods or migration guides available?
   - Breaking changes risk

5. **Performance**
   - Any published benchmarks?
   - Runtime performance characteristics
   - Memory footprint

6. **Community & Ecosystem**
   - Active maintainers count
   - Plugin/extension ecosystem
   - Stack Overflow presence
   - Used by notable projects?

## Output Format

End your research with a structured summary in this exact format:

## RESEARCH FINDINGS: [candidate name]

### Scores (1-10, where 10 is best)
- Package Health: X/10
- Bundle Impact: X/10
- API Quality: X/10
- Migration Complexity: X/10 (10 = easiest migration)
- Performance: X/10
- Community: X/10

### Key Stats
- npm downloads/week: [number]
- Bundle size (minified+gzip): [size]
- GitHub stars: [number]
- Last release: [date]
- TypeScript: [built-in | @types | none]

### Pros
- [bullet points]

### Cons
- [bullet points]

### Migration Notes
[Brief description of what changes would be needed to migrate from current solution]

## Important Rules

- Use REAL data from web searches. Do not guess or make up statistics.
- If a web search fails, note "unable to verify" rather than fabricating numbers.
- Be honest about cons — the evaluator needs accurate data to rank options.
- If WebSearch/WebFetch are not available, fall back to inspecting local node_modules, lock files, and package.json for whatever data you can find. Note that your analysis is based on local data only.
- Do NOT write to any files. Return your findings as text output.
```

- [ ] **Step 2: Verify the agent file is valid markdown with frontmatter**

```bash
head -10 autoresearch/agents/researcher/researcher.md
```

Expected: YAML frontmatter with `name: researcher`, `model: sonnet`.

- [ ] **Step 3: Commit**

```bash
git add autoresearch/agents/researcher/
git commit -m "feat: add researcher agent — Sonnet-powered parallel research"
```

---

## Task 3: Evaluator Agent

**Files:**
- Create: `autoresearch/agents/evaluator/evaluator.md`

The evaluator synthesizes all research findings into a ranked comparison with top 3 + "build custom" option.

- [ ] **Step 1: Write evaluator agent definition**

Create `autoresearch/agents/evaluator/evaluator.md`:

```markdown
---
name: evaluator
description: >
  Synthesize research findings from multiple researcher agents into a ranked
  comparison. Produces a weighted scoring table, pros/cons, and recommendation
  with top 3 options plus a "build custom" assessment.
model: sonnet
tools: Read, Grep, Glob
maxTurns: 15
---

# Evaluator Agent

You are synthesizing research findings from multiple researcher agents. You have been given:
- **Research findings** from 3-5 researcher agents, each covering one candidate
- The **user's priorities** (ordered by importance, e.g., ["bundle-size", "api-compat", "performance"])
- The **task context** (what problem is being solved)
- The **current codebase usage patterns**

## Your Job

Rank the candidates, produce a comparison table, and present the top 3 options plus a "build custom" assessment.

## Process

1. **Weight the scoring dimensions** based on user priorities:
   - First priority: 3x weight
   - Second priority: 2x weight
   - All others: 1x weight

2. **Calculate weighted scores** for each candidate using the researcher scores (1-10 per dimension)

3. **Generate comparison table** with all candidates ranked by weighted score

4. **Assess "build custom" option**: Based on the task complexity and what you've seen in the research, estimate:
   - Effort level (Low / Medium / High / Very High)
   - Lines of code estimate
   - Key risks of building custom
   - What the custom solution would look like architecturally

## Output Format

Return your evaluation in this exact format:

## EVALUATION RESULTS

### Comparison Table

| Candidate | [Priority 1] | [Priority 2] | [Other dims...] | Weighted Score |
|-----------|-------------|-------------|-----------------|---------------|
| [name]    | X/10        | X/10        | ...             | XX.X          |

### Option 1: [Top Candidate] (RECOMMENDED)
**Weighted Score: XX.X**
- Why: [2-3 sentences on why this is the best choice given user's priorities]
- Pros: [key pros]
- Cons: [key cons]
- Migration effort: [Low/Medium/High]

### Option 2: [Second Candidate]
**Weighted Score: XX.X**
- Why: [when you'd choose this over #1]
- Pros: [key pros]
- Cons: [key cons]
- Migration effort: [Low/Medium/High]

### Option 3: [Third Candidate]
**Weighted Score: XX.X**
- Why: [when you'd choose this over #1 and #2]
- Pros: [key pros]
- Cons: [key cons]
- Migration effort: [Low/Medium/High]

### Option 4: Build Custom
**Effort: [Low/Medium/High/Very High]**
- Approach: [what you'd build and how]
- Estimated scope: [lines of code, files affected]
- Risks: [key risks]
- When to choose this: [circumstances where custom is better than any library]

## Important Rules

- Be opinionated — clearly recommend your top choice and explain why.
- If two options are very close, say so and explain what would tip the decision.
- The "build custom" option should be honest — sometimes it IS the right choice.
- Base everything on the researcher data. Don't fabricate new scores.
- Do NOT write to any files. Return your evaluation as text output.
```

- [ ] **Step 2: Commit**

```bash
git add autoresearch/agents/evaluator/
git commit -m "feat: add evaluator agent — Sonnet-powered option ranking"
```

---

## Task 4: Implementer Agent

**Files:**
- Create: `autoresearch/agents/implementer/implementer.md`

The implementer runs as Opus high-effort in an isolated worktree. It does the actual coding work.

- [ ] **Step 1: Write implementer agent definition**

Create `autoresearch/agents/implementer/implementer.md`:

```markdown
---
name: implementer
description: >
  Execute the chosen implementation approach. Makes all code changes in an
  isolated git worktree, commits frequently, handles complex multi-file
  refactors. Used for both initial implementation and auto-fix retries.
model: opus
effort: high
tools: Read, Write, Edit, Bash, Grep, Glob
maxTurns: 50
isolation: worktree
---

# Implementer Agent

You are implementing a coding task that has been researched and evaluated. You have been given:
- The **selected approach** (a library to adopt, or "build custom")
- The **evaluation summary** (why this was chosen, pros/cons)
- The **task context** (what problem is being solved, files in scope)
- The **current codebase usage patterns** (how the existing solution is used)
- The **user's priorities and constraints**

If this is an **auto-fix retry**, you also have:
- The **verification failure report** (what tests failed, what checks didn't pass)
- The **previous implementation attempt** (via git log on this branch)

## Your Job

Make ALL the code changes needed to complete the task. Work in the isolated worktree — you cannot corrupt the main branch.

## Process

1. **Understand the codebase**: Read the relevant files. Understand how the current solution is used before changing anything.

2. **Create the branch** (first run only):
   ```bash
   git checkout -b autoresearch/<task-slug>-<date>
   ```

3. **Implement incrementally**: Make changes in logical chunks. After each chunk:
   - Verify the change makes sense in isolation
   - Commit with a clear message
   - This preserves progress even if context is exhausted

4. **Handle the "build custom" path**: If implementing a custom solution:
   - Design the API first (types/interfaces)
   - Implement core functionality
   - Write tests alongside the implementation
   - Document the custom solution

5. **After all changes are complete**: Return a summary of what was done.

## Commit Strategy

Commit after EVERY significant change. Examples:
- "feat: add dayjs as dependency, remove moment"
- "refactor: replace moment imports with dayjs in src/utils/"
- "refactor: update date formatting in components"
- "fix: handle timezone edge cases in migration"
- "test: update test fixtures for new date library"

## Output Format

End with a structured summary:

## IMPLEMENTATION SUMMARY

### Changes Made
- [file]: [what changed]

### Commits
- [hash]: [message]

### Notes
- [Any important notes about decisions made, edge cases found, etc.]

### Files Changed: [count]
### Commits Made: [count]

## Important Rules

- **Commit frequently.** Every logical change gets its own commit.
- **Don't break things incrementally.** Each commit should leave the codebase in a compilable state if possible.
- **Follow existing code style.** Match indentation, naming conventions, import patterns.
- **Don't over-engineer.** Make the minimal changes needed to accomplish the task.
- If you're doing an auto-fix retry, focus ONLY on what the verification report flagged. Don't redo work that already passed.
```

- [ ] **Step 2: Commit**

```bash
git add autoresearch/agents/implementer/
git commit -m "feat: add implementer agent — Opus high-effort coding in worktree"
```

---

## Task 5: Verifier Agent

**Files:**
- Create: `autoresearch/agents/verifier/verifier.md`

The verifier runs the multi-layer verification pipeline and returns structured results.

- [ ] **Step 1: Write verifier agent definition**

Create `autoresearch/agents/verifier/verifier.md`:

```markdown
---
name: verifier
description: >
  Run multi-layer verification on implemented changes: tests, typecheck, lint,
  bundle analysis, benchmarks, and static analysis. Returns structured
  pass/fail/warn report.
model: sonnet
tools: Read, Bash, Grep, Glob
maxTurns: 30
---

# Verifier Agent

You are verifying code changes made by the implementer agent. You are running in the same worktree where the changes were made. You have been given:
- The **implementation summary** (what was changed, which files)
- The **task context** (what the changes accomplish)
- The **worktree path** (where to run commands)

## Your Job

Run a comprehensive verification pipeline and return structured results.

## Verification Pipeline

Run these checks IN ORDER. Stop early if a blocking check fails — the auto-fix loop needs clear failure info.

### 1. Correctness Checks (BLOCKING)

**Detect and run existing test command:**
```bash
# Check package.json for test scripts
cat package.json | grep -E '"test":|"test:"|"vitest"|"jest"'
```

Try in order: `npm test`, `npx vitest run`, `npx jest`, `pnpm test`, `yarn test`.
Use whichever is configured in the project.

**Typecheck:**
```bash
# Check if TypeScript is configured
[ -f tsconfig.json ] && npx tsc --noEmit
```

**Lint:**
```bash
# Check for lint config and run
[ -f .eslintrc* ] || [ -f eslint.config* ] && npx eslint . --max-warnings 0
# Or check package.json for lint script
npm run lint 2>/dev/null
```

If ANY correctness check fails, record the failure and STOP. Return the failure report immediately — the auto-fix loop needs to know exactly what broke.

### 2. Bundle Analysis (WARN)

Only run if the project has a build step:

```bash
# Detect build script
grep -q '"build"' package.json
```

If build exists:
1. Note current branch
2. Run build, record output size: `du -sb dist/ build/ .next/ out/ 2>/dev/null`
3. Checkout main in a temp directory: `git worktree add /tmp/autoresearch-baseline main`
4. Run build there, record baseline size
5. Clean up: `git worktree remove /tmp/autoresearch-baseline`
6. Compare and report delta

If no build script exists, skip and note "Bundle analysis: skipped (no build step detected)".

### 3. Benchmarks (REPORT)

**Existing benchmarks:**
```bash
# Check for benchmark scripts
grep -E '"bench"|"benchmark"' package.json
ls bench/ benchmark/ benchmarks/ 2>/dev/null
```

Run any existing benchmark scripts and capture output.

**Generated micro-benchmarks:**
Create a targeted benchmark for the specific change. Write it to /tmp/ and run it. For example, if replacing a date library, benchmark the common date operations.

### 4. Static Analysis (WARN)

```bash
# Check for circular dependencies
npx madge --circular --extensions ts,tsx,js,jsx src/ 2>/dev/null

# Check for unused exports (if ts-unused-exports is available)
npx ts-unused-exports tsconfig.json 2>/dev/null
```

## Output Format

Return your verification in this exact format:

## VERIFICATION REPORT

### Overall: [PASS | FAIL | WARN]

### Correctness
- Tests: [PASS | FAIL] — [details]
- Typecheck: [PASS | FAIL | SKIPPED] — [details]
- Lint: [PASS | FAIL | SKIPPED] — [details]

### Bundle Analysis
- Status: [PASS | WARN | SKIPPED]
- Before: [size or "N/A"]
- After: [size or "N/A"]
- Delta: [+/-size, +/-percentage or "N/A"]

### Benchmarks
- Existing: [results or "none found"]
- Generated: [results or "skipped"]

### Static Analysis
- Circular deps: [PASS | WARN] — [details]
- Unused exports: [PASS | WARN | SKIPPED] — [details]

### Blocking Issues (must fix)
- [list of issues that failed correctness checks, empty if all pass]

### Warnings (informational)
- [list of non-blocking warnings]

## Important Rules

- Run commands from the worktree directory.
- If a correctness check fails, STOP and return immediately with clear error output.
- Include actual error messages in the report — the implementer needs them to fix issues.
- For bundle analysis, always clean up temporary worktrees.
- Do NOT modify any code. You are read-only + bash execution.
- Do NOT write to any files in the project. Only write to /tmp/ for benchmarks.
```

- [ ] **Step 2: Commit**

```bash
git add autoresearch/agents/verifier/
git commit -m "feat: add verifier agent — Sonnet-powered multi-layer verification"
```

---

## Task 6: Session Resume Hook

**Files:**
- Create: `autoresearch/hooks/hooks.json`
- Create: `autoresearch/hooks/session-resume.mjs`

The hook detects in-progress autoresearch sessions and injects context on session start/resume.

- [ ] **Step 1: Write hooks.json**

Create `autoresearch/hooks/hooks.json`:

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

- [ ] **Step 2: Write session-resume.mjs**

Create `autoresearch/hooks/session-resume.mjs`. This hook:
- Reads hook input JSON from stdin
- Checks for `.autoresearch/session.md` in the project
- If found, reads session state and last log entries
- Detects orphaned autoresearch worktrees via `git worktree list`
- Reconciles log state vs actual git branches
- Outputs JSON with `additionalContext` to stdout

Key implementation notes:
- Use `readFileSync` for file reads, `execFileSync` (not `execSync`) for git commands to avoid shell injection
- Parse stdin with try/catch for robustness
- Truncate session content to 2000 chars to keep context lean
- Exit cleanly (code 0) if no session found
- Handle all errors gracefully — a hook failure shouldn't break the session

- [ ] **Step 3: Verify the hook script runs without errors**

```bash
echo '{}' | node autoresearch/hooks/session-resume.mjs
```

Expected: exits cleanly with no output (no .autoresearch/ directory exists yet).

- [ ] **Step 4: Test with mock state**

```bash
mkdir -p /tmp/test-autoresearch/.autoresearch
echo "# Autoresearch: test session" > /tmp/test-autoresearch/.autoresearch/session.md
echo '{"type":"brief","timestamp":1711100000}' > /tmp/test-autoresearch/.autoresearch/log.jsonl
echo '{"cwd": "/tmp/test-autoresearch"}' | node autoresearch/hooks/session-resume.mjs
rm -rf /tmp/test-autoresearch
```

Expected: JSON output with `additionalContext` containing session summary.

- [ ] **Step 5: Commit**

```bash
git add autoresearch/hooks/
git commit -m "feat: add session resume hook — detect and inject in-progress sessions"
```

---

## Task 7: Research Skill (Orchestrator)

**Files:**
- Create: `autoresearch/skills/research/SKILL.md`

This is the core of the plugin — the orchestrator that manages the entire flow. This is the largest and most important file.

- [ ] **Step 1: Write the SKILL.md orchestrator**

Create `autoresearch/skills/research/SKILL.md` with:

**Frontmatter:**
```yaml
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
```

**Body content must cover these sections:**

1. **Credits**: Link to Andrej Karpathy, pi-autoresearch, davebcn87
2. **Quick Reference**: State file paths, branch naming, config location
3. **Resume Check**: How to detect and resume an existing session. `/research clear` cleanup logic.
4. **Phase 1 — Brief + Candidate Discovery**: Parse task, scan codebase (Grep/Glob for relevant files, check package.json), discover candidates via WebSearch, read optional config.json, present brief summary to user, wait for confirmation, initialize `.autoresearch/` state directory (add to .gitignore)
5. **Phase 2 — Parallel Research**: Dispatch 3-5 `researcher` agents in PARALLEL (multiple Agent calls in single response), collect results, handle failures (proceed if 2+ succeed, offer retry if <2), update state files
6. **Phase 3 — Evaluation + Ranking**: Dispatch `evaluator` agent with all findings, present top 3 + "build custom" to user, wait for selection, update state
7. **Phase 4 — Cost Estimate**: Show estimated cost (~$5-15 for Opus implementation), user confirms
8. **Phase 5 — Implementation**: Dispatch `implementer` agent with selected approach + context (different prompt for "build custom" vs library adoption, different prompt for auto-fix retry), collect summary, update state
9. **Phase 6 — Verification**: Dispatch `verifier` agent in same worktree, evaluate PASS/FAIL/WARN results, update state
10. **Phase 7 — Auto-Fix Loop**: If FAIL, re-dispatch implementer with failure context, re-verify, max 3 retries (configurable), escalate to user if stuck
11. **Phase 8 — Final Report**: Present comprehensive results (verification, changes, bundle impact, benchmarks, next steps for merge/discard)
12. **Rules**: Only skill writes state files, dispatch researchers in parallel, two user checkpoints + cost estimate, log everything to log.jsonl

- [ ] **Step 2: Verify the skill file has valid frontmatter**

```bash
head -15 autoresearch/skills/research/SKILL.md
```

Expected: YAML frontmatter with `name: research`, `user-invocable: true`.

- [ ] **Step 3: Commit**

```bash
git add autoresearch/skills/research/
git commit -m "feat: add research skill — orchestrator for the full autoresearch flow"
```

---

## Task 8: README with Credits + Installation

**Files:**
- Create: `autoresearch/README.md`

- [ ] **Step 1: Write README.md**

Must include:
- Title and one-line description
- Example commands (3 examples showing different task types)
- "How It Works" section (6-step flow: Brief, Research, Evaluate, Implement, Verify, Auto-fix)
- Installation instructions (`/plugin marketplace add zain/autoresearch`)
- Usage section (`/research <task>` and `/research clear`)
- Configuration section (`.autoresearch/config.json` with maxRetries, maxImplementerTurns, maxResearchers)
- Model allocation table
- Requirements (Claude Max recommended, WebSearch/WebFetch permissions)
- **Credits & Inspiration section** — must credit:
  - [Andrej Karpathy](https://github.com/karpathy) for the autoresearch concept
  - [pi-autoresearch](https://github.com/davebcn87/pi-autoresearch) by [davebcn87](https://github.com/davebcn87) for the implementation pattern (persistent state, append-only logging, session resumability)
  - Note that this plugin adapts the pattern for Claude Code's subagent architecture
- MIT license

- [ ] **Step 2: Commit**

```bash
git add autoresearch/README.md
git commit -m "feat: add README with installation, usage, and credits"
```

---

## Task 9: Integration Test — Dry Run the Flow

**Files:**
- No new files. Validate existing files work together.

- [ ] **Step 1: Verify complete plugin structure**

```bash
find autoresearch -type f | sort
```

Expected:
```
autoresearch/.claude-plugin/plugin.json
autoresearch/LICENSE
autoresearch/README.md
autoresearch/agents/evaluator/evaluator.md
autoresearch/agents/implementer/implementer.md
autoresearch/agents/researcher/researcher.md
autoresearch/agents/verifier/verifier.md
autoresearch/hooks/hooks.json
autoresearch/hooks/session-resume.mjs
autoresearch/skills/research/SKILL.md
```

- [ ] **Step 2: Validate all YAML frontmatter parses correctly**

```bash
for f in autoresearch/agents/*/*.md autoresearch/skills/research/SKILL.md; do
  echo "=== $f ==="
  sed -n '/^---$/,/^---$/p' "$f" | head -20
  echo ""
done
```

Verify each file has valid frontmatter with `name` and `model` (for agents) or `name` and `user-invocable` (for skill).

- [ ] **Step 3: Validate JSON files**

```bash
python3 -c "import json; json.load(open('autoresearch/hooks/hooks.json')); print('hooks.json: Valid')"
python3 -c "import json; json.load(open('autoresearch/.claude-plugin/plugin.json')); print('plugin.json: Valid')"
```

- [ ] **Step 4: Test session-resume hook with no state**

```bash
echo '{"cwd": "/tmp"}' | node autoresearch/hooks/session-resume.mjs
echo "Exit code: $?"
```

Expected: exits with code 0, no output.

- [ ] **Step 5: Test session-resume hook with mock state**

```bash
mkdir -p /tmp/test-autoresearch/.autoresearch
echo "# Autoresearch: test session" > /tmp/test-autoresearch/.autoresearch/session.md
echo '{"type":"brief","timestamp":1711100000}' > /tmp/test-autoresearch/.autoresearch/log.jsonl
echo '{"cwd": "/tmp/test-autoresearch"}' | node autoresearch/hooks/session-resume.mjs
rm -rf /tmp/test-autoresearch
```

Expected: JSON output with `additionalContext` containing session summary.

- [ ] **Step 6: Commit any fixes**

```bash
git status
# If changes needed: git add and commit
# If clean: no commit needed
```

---

## Task 10: Final Commit + Tag

- [ ] **Step 1: Review git log**

```bash
git log --oneline
```

Verify all tasks committed cleanly.

- [ ] **Step 2: Tag v0.1.0**

```bash
git tag -a v0.1.0 -m "autoresearch v0.1.0 — initial plugin release"
```

- [ ] **Step 3: Verify final structure**

```bash
find autoresearch -type f | sort
cat autoresearch/.claude-plugin/plugin.json
```

---

## Summary

| Task | What | Key File(s) |
|------|------|-------------|
| 1 | Plugin scaffold | `.claude-plugin/plugin.json`, `LICENSE` |
| 2 | Researcher agent | `agents/researcher/researcher.md` |
| 3 | Evaluator agent | `agents/evaluator/evaluator.md` |
| 4 | Implementer agent | `agents/implementer/implementer.md` |
| 5 | Verifier agent | `agents/verifier/verifier.md` |
| 6 | Session resume hook | `hooks/hooks.json`, `hooks/session-resume.mjs` |
| 7 | Research skill (orchestrator) | `skills/research/SKILL.md` |
| 8 | README + credits | `README.md` |
| 9 | Integration validation | No new files |
| 10 | Final tag | v0.1.0 |
