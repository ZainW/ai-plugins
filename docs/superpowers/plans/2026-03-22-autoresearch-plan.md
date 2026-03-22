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

This is the core of the plugin — the orchestrator that manages the entire flow. This is the largest and most important file. The full content is provided below — copy verbatim.

**Note on agent directory nesting:** The spec shows agents as flat files (`agents/researcher.md`) but this plan nests them (`agents/researcher/researcher.md`). This is intentional — allows future expansion with supporting files per agent.

- [ ] **Step 1: Write the SKILL.md orchestrator**

Create `autoresearch/skills/research/SKILL.md` with the COMPLETE content below. This is the verbatim file — do not summarize or abbreviate:

~~~markdown
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

3. **Discover candidates**: Use WebSearch to find 3-5 candidate approaches. For dependency replacement, search for alternatives. For refactoring, search for patterns/best practices.

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
~~~

- [ ] **Step 2: Verify the skill file has valid frontmatter**

```bash
head -15 autoresearch/skills/research/SKILL.md
```

Expected: YAML frontmatter with `name: research`, `user-invocable: true`.

- [ ] **Step 3: Verify the skill covers all 8 phases**

```bash
grep -c "## Phase" autoresearch/skills/research/SKILL.md
```

Expected: 8

- [ ] **Step 4: Commit**

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
