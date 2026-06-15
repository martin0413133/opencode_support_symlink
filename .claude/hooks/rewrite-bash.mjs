#!/usr/bin/env node
// Auto-inject symlink-following flags into Bash commands so grep / find / rg
// can search into directories reached via symlinks. Each command segment in a
// multi-line / piped script is rewritten independently.
import { readFileSync, appendFileSync } from "node:fs";

const LOG = process.env.CLAUDE_BASH_HOOK_LOG || "";

const raw = readFileSync(0, "utf8");
let input;
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0);
}

const cmd = input?.tool_input?.command ?? "";
if (!cmd) process.exit(0);

// Segment boundaries: start-of-string, newline, ;, &&, ||, |.
const BOUNDARY = "(?:^|\\n|;|&&|\\|\\||\\|)";
// For grep specifically, exclude the bare `|` — `grep` after a pipe is a stdin
// filter, and adding -R causes grep to ignore stdin and search the filesystem.
const GREP_BOUNDARY = "(?:^|\\n|;|&&|\\|\\|)";

function rewriteOne(s, name, transform, boundary = BOUNDARY) {
  const re = new RegExp(
    `(${boundary}\\s*)${name}(\\s+)([^|;&\\n]*)`,
    "g",
  );
  return s.replace(re, (_m, pre, ws, rest) => pre + name + ws + transform(rest));
}

// grep: ensure -R (follow all symlinks). Upgrade -r to -R, or prepend -R.
function fixGrep(rest) {
  if (/(?:^|\s)-[A-Za-z]*R/.test(rest)) return rest;
  const rUp = rest.replace(/((?:^|\s)-[A-Za-z]*)r/, "$1R");
  if (rUp !== rest) return rUp;
  return "-R " + rest;
}

// find: ensure -L (follow symlinks). Must come before path expressions.
function fixFind(rest) {
  if (/(?:^|\s)(-L|-follow)\b/.test(rest)) return rest;
  return "-L " + rest;
}

// rg: ensure --follow or -L flag.
function fixRg(rest) {
  if (/--follow\b/.test(rest) || /(?:^|\s)-[A-Za-z]*L/.test(rest)) return rest;
  return "--follow " + rest;
}

let updated = cmd;
updated = rewriteOne(updated, "grep", fixGrep, GREP_BOUNDARY);
updated = rewriteOne(updated, "find", fixFind);
updated = rewriteOne(updated, "rg", fixRg);

if (LOG) {
  try {
    const tag = updated !== cmd ? "REWRITE" : "no-op";
    appendFileSync(
      LOG,
      `[${new Date().toISOString()}] ${tag}\nCMD: ${cmd}\nNEW: ${updated}\n---\n`,
    );
  } catch {}
}

if (updated !== cmd) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        updatedInput: { command: updated },
      },
    }),
  );
}
