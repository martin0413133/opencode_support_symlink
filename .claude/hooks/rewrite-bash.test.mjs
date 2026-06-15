#!/usr/bin/env node
// Test suite for rewrite-bash.mjs. Run with:
//   node .claude/hooks/rewrite-bash.test.mjs
// Exits 0 on success, 1 on any failure.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "rewrite-bash.mjs");

function runHook(command) {
  const r = spawnSync("node", [HOOK], {
    input: JSON.stringify({ tool_input: { command } }),
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(`hook exit ${r.status}: ${r.stderr}`);
  if (!r.stdout.trim()) return null; // no rewrite
  return JSON.parse(r.stdout).hookSpecificOutput.updatedInput.command;
}

const cases = [
  // --- grep ---
  { in: "grep foo .",            out: "grep -R foo .",            desc: "bare grep prepends -R" },
  { in: "grep -n foo .",         out: "grep -R -n foo .",         desc: "grep -n (no R/r) prepends -R" },
  { in: "grep -r foo .",         out: "grep -R foo .",            desc: "grep -r upgrades to -R" },
  { in: "grep -rn foo .",        out: "grep -Rn foo .",           desc: "grep -rn upgrades r→R inside bundle" },
  { in: "grep -nr foo .",        out: "grep -nR foo .",           desc: "grep -nr upgrades inner r→R" },
  { in: "grep -Rn foo .",        out: null,                       desc: "grep -Rn already correct (no-op)" },
  { in: "grep -R foo .",         out: null,                       desc: "grep -R already correct (no-op)" },
  { in: "grep --include='*.c' foo .", out: "grep -R --include='*.c' foo .", desc: "grep with long flag prepends -R" },

  // --- find ---
  { in: "find . -name '*.c'",    out: "find -L . -name '*.c'",    desc: "find prepends -L before path" },
  { in: "find /tmp -name x",     out: "find -L /tmp -name x",     desc: "find with absolute path prepends -L" },
  { in: "find -L . -name x",     out: null,                       desc: "find -L already correct (no-op)" },
  { in: "find -follow . -name x",out: null,                       desc: "find -follow already correct (no-op)" },
  { in: "find .",                out: "find -L .",                desc: "find with only path prepends -L" },

  // --- rg ---
  { in: "rg foo",                out: "rg --follow foo",          desc: "bare rg prepends --follow" },
  { in: "rg -n foo",             out: "rg --follow -n foo",       desc: "rg -n (no follow) prepends --follow" },
  { in: "rg --files",            out: "rg --follow --files",      desc: "rg --files prepends --follow" },
  { in: "rg --follow foo",       out: null,                       desc: "rg --follow already correct (no-op)" },
  { in: "rg -L foo",             out: null,                       desc: "rg -L (short follow) already correct (no-op)" },
  { in: "rg -Ln foo",            out: null,                       desc: "rg -Ln (bundled L) already correct (no-op)" },

  // --- segment boundaries ---
  // grep AFTER A PIPE is a stdin filter, not a directory search. Adding -R
  // would make grep ignore stdin and recurse cwd — harmful. So we deliberately
  // do NOT rewrite grep after `|`. find / rg are still safe to rewrite.
  { in: "ls | grep foo",         out: null,                       desc: "grep after pipe NOT rewritten (stdin filter)" },
  { in: "cat x | grep -v skip",  out: null,                       desc: "grep -v after pipe NOT rewritten" },
  { in: "find . | grep -v node_modules | sort", out: "find -L . | grep -v node_modules | sort", desc: "pipeline: find rewritten, downstream grep left alone" },
  // grep after non-pipe boundaries (statement separators) IS rewritten.
  { in: "echo a; grep foo .",    out: "echo a; grep -R foo .",    desc: "grep after semicolon" },
  { in: "true && grep foo .",    out: "true && grep -R foo .",    desc: "grep after &&" },
  { in: "false || grep foo .",   out: "false || grep -R foo .",   desc: "grep after ||" },
  { in: "true && rg foo",        out: "true && rg --follow foo",  desc: "rg after &&" },
  { in: "false || find . -name x", out: "false || find -L . -name x", desc: "find after ||" },

  // --- multi-line scripts (the regression fixed) ---
  {
    in: "echo a\nfind . -name x\nrg foo\ngrep -n bar .",
    out: "echo a\nfind -L . -name x\nrg --follow foo\ngrep -R -n bar .",
    desc: "multi-line: each line rewritten independently",
  },

  // --- words that contain but don't equal the command name ---
  { in: "echo 'grep is great'",  out: null,                       desc: "grep inside string literal not rewritten" },
  { in: "egrep foo .",           out: null,                       desc: "egrep not matched as grep" },
  { in: "myrg foo",              out: null,                       desc: "myrg not matched as rg" },

  // --- pipeline with multiple commands ---
  {
    in: "find . -name '*.c' | xargs grep foo",
    out: "find -L . -name '*.c' | xargs grep foo",
    desc: "pipeline: find rewritten; grep after xargs NOT rewritten (stdin)",
  },
  {
    in: "ls | grep foo | wc -l",
    out: null,
    desc: "pipeline: all grep are stdin filters → no rewrite",
  },

  // --- known limitations (documented; current implementation does not rewrite) ---
  {
    in: "result=$(grep foo .)",
    out: null,
    desc: "limitation: grep inside $(...) subshell not rewritten",
  },

  // --- empty / weird input ---
  { in: "",                      out: null,                       desc: "empty command (no-op)" },
  { in: "ls",                    out: null,                       desc: "command without matched tool (no-op)" },
];

let pass = 0, fail = 0;
for (const c of cases) {
  const got = runHook(c.in);
  const ok = got === c.out;
  if (ok) {
    pass++;
    console.log(`  PASS  ${c.desc}`);
  } else {
    fail++;
    console.log(`  FAIL  ${c.desc}`);
    console.log(`        in:  ${JSON.stringify(c.in)}`);
    console.log(`        out: ${JSON.stringify(got)}`);
    console.log(`        exp: ${JSON.stringify(c.out)}`);
  }
}

console.log(`\n${pass} passed, ${fail} failed, ${cases.length} total`);
process.exit(fail === 0 ? 0 : 1);
