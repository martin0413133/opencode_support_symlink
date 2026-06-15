#!/usr/bin/env node
// Built-in Grep tool does not expose a --follow flag, and ripgrep (its backing
// engine) does not follow symlinks by default. In a project that exposes
// content via symlinked directories the Grep tool will silently miss matches.
// Deny it and route the model to Bash, where the companion rewrite-bash hook
// injects --follow / -R / -L automatically.
process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason:
        "This project surfaces source code via symlinked directories. The built-in Grep tool uses ripgrep without --follow and will miss content inside symlinks. Use Bash with `rg --follow <pattern>` (or `grep -R <pattern>` / `find -L`) instead — the project's PreToolUse Bash hook auto-injects the symlink-follow flag.",
    },
  }),
);
