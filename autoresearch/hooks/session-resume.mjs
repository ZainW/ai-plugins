#!/usr/bin/env node

/**
 * Session Resume Hook
 *
 * Fires on SessionStart to detect in-progress autoresearch sessions
 * and inject context so the agent can offer resumption.
 *
 * Input (stdin): JSON with session_id, cwd, hook_event_name, etc.
 * Output (stdout): JSON with additionalContext if a session is found.
 * Exit: always 0 — hook failures must never break Claude Code startup.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

async function main() {
  // ── 1. Read hook input from stdin ──────────────────────────────────
  let input = {};
  try {
    const raw = readFileSync(0, "utf-8"); // fd 0 = stdin
    if (raw.trim()) {
      input = JSON.parse(raw);
    }
  } catch {
    // Malformed or missing stdin — not fatal, just proceed with defaults.
  }

  const cwd = input.cwd;
  if (!cwd) {
    // No working directory provided — nothing to check.
    process.exit(0);
  }

  // ── 2. Check for .autoresearch/session.md ──────────────────────────
  const stateDir = join(cwd, ".autoresearch");
  const sessionPath = join(stateDir, "session.md");

  if (!existsSync(sessionPath)) {
    // No active session — exit silently.
    process.exit(0);
  }

  // ── 3. Read session.md ─────────────────────────────────────────────
  let sessionContent = "";
  try {
    sessionContent = readFileSync(sessionPath, "utf-8");
  } catch {
    // Can't read the file — bail cleanly.
    process.exit(0);
  }

  // Truncate to 2000 chars to keep context lean.
  if (sessionContent.length > 2000) {
    sessionContent = sessionContent.slice(0, 2000) + "\n...(truncated)";
  }

  // ── 4. Read last 5 log entries ─────────────────────────────────────
  const logPath = join(stateDir, "log.jsonl");
  let lastEntries = [];
  let lastPhase = "unknown";
  try {
    if (existsSync(logPath)) {
      const logRaw = readFileSync(logPath, "utf-8");
      const lines = logRaw
        .split("\n")
        .filter((l) => l.trim())
        .slice(-5);
      for (const line of lines) {
        try {
          lastEntries.push(JSON.parse(line));
        } catch {
          // Skip malformed log lines.
        }
      }
      if (lastEntries.length > 0) {
        const last = lastEntries[lastEntries.length - 1];
        lastPhase = last.type || last.phase || "unknown";
      }
    }
  } catch {
    // Log reading is best-effort.
  }

  // ── 5. Detect orphaned autoresearch worktrees ──────────────────────
  let worktreeInfo = [];
  try {
    const raw = execFileSync("git", ["worktree", "list", "--porcelain"], {
      cwd,
      encoding: "utf-8",
      timeout: 5000,
    });
    const blocks = raw.split("\n\n").filter((b) => b.trim());
    for (const block of blocks) {
      const lines = block.split("\n");
      const wtPath = lines
        .find((l) => l.startsWith("worktree "))
        ?.replace("worktree ", "");
      const branch = lines
        .find((l) => l.startsWith("branch "))
        ?.replace("branch ", "");
      if (branch && branch.includes("autoresearch")) {
        worktreeInfo.push({ path: wtPath, branch });
      }
    }
  } catch {
    // Not a git repo, or git not available — skip.
  }

  // ── 6. Reconcile state: check autoresearch/* branches ──────────────
  let branches = [];
  try {
    const raw = execFileSync(
      "git",
      ["branch", "--list", "autoresearch/*", "--format=%(refname:short)"],
      { cwd, encoding: "utf-8", timeout: 5000 }
    );
    branches = raw
      .split("\n")
      .map((b) => b.trim())
      .filter(Boolean);
  } catch {
    // Best-effort.
  }

  const implementationLogged = lastEntries.some(
    (e) =>
      e.type === "implementation" ||
      e.phase === "implementation" ||
      e.type === "implement"
  );

  let reconciliation = "";
  if (implementationLogged && branches.length === 0) {
    reconciliation =
      "WARNING: Log shows implementation phase but no autoresearch/* branches found — state may be stale.";
  } else if (branches.length > 0) {
    reconciliation = `Active branches: ${branches.join(", ")}`;
  }

  // ── 7. Build context summary and emit ──────────────────────────────
  const parts = [
    "## Autoresearch Session Detected",
    "",
    `**Last phase:** ${lastPhase}`,
  ];

  if (worktreeInfo.length > 0) {
    parts.push(
      `**Orphaned worktrees:** ${worktreeInfo.map((w) => w.branch).join(", ")}`
    );
  }

  if (reconciliation) {
    parts.push(`**State:** ${reconciliation}`);
  }

  if (lastEntries.length > 0) {
    parts.push("");
    parts.push("**Recent log entries:**");
    for (const entry of lastEntries) {
      const ts = entry.timestamp
        ? new Date(entry.timestamp * 1000).toISOString()
        : "?";
      parts.push(`- [${ts}] ${entry.type || "unknown"}`);
    }
  }

  parts.push("");
  parts.push("**Session file:**");
  parts.push("```");
  parts.push(sessionContent);
  parts.push("```");

  const summary = parts.join("\n");

  const output = JSON.stringify({ additionalContext: summary });
  process.stdout.write(output + "\n");
}

main().catch(() => {
  // Final safety net — never crash the hook.
  process.exit(0);
});
