import type { Plugin } from "@opencode-ai/plugin"
import { appendFileSync } from "fs"

const LOG = "/tmp/grep-hook-debug.log"

const GrepHook: Plugin = async () => {
  appendFileSync(LOG, `[${new Date().toISOString()}] GrepHook loaded\n`)
  return {
    "tool.execute.before": async (input, output) => {
      const cmd = output.args.command ?? ""
      appendFileSync(LOG, `[${new Date().toISOString()}] tool=${input.tool} cmd="${cmd}"\n`)

      if (input.tool !== "bash") return

      let updated = cmd.replace(
        /(^|\|\s*|;\s*|&&\s*|\|\|\s*)grep (?!-)/gm,
        "$1grep -R "
      )

      updated = updated.replace(
        /(^|\|\s*|;\s*|&&\s*|\|\|\s*)find (?!(-|L|follow))/gm,
        "$1find -L "
      )

      if (updated !== cmd) {
        appendFileSync(LOG, `[${new Date().toISOString()}] UPDATED="${updated}"\n`)
        output.args.command = updated
      } else {
        appendFileSync(LOG, `[${new Date().toISOString()}] NO CHANGE\n`)
      }
    },
  }
}

export default GrepHook
