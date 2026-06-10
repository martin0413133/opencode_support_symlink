import type { Plugin } from "@opencode-ai/plugin"

export const GrepHook: Plugin = async () => {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool !== "bash") return

      const cmd = output.args.command

      // Replace bare `grep` with `grep -r --follow`
      // Matches at command start or after `|`, `;`, `&&`, `||`
      // But NOT `grep -` (already has flags) or `git grep`
      let updated = cmd.replace(
        /(^|\|\s*|;\s*|&&\s*|\|\|\s*)grep (?!-)/gm,
        "$1grep -r --follow "
      )

      // Replace bare `find` with `find -L` (follow symlinks)
      // Matches at command start or after `|`, `;`, `&&`, `||`
      // But NOT `find -` (already has flags) or `xargs find`
      // Also skip if `-L` or `-follow` already present
      updated = updated.replace(
        /(^|\|\s*|;\s*|&&\s*|\|\|\s*)find (?!(-|L|follow))/gm,
        "$1find -L "
      )

      if (updated !== cmd) {
        output.args.command = updated
      }
    },
  }
}
