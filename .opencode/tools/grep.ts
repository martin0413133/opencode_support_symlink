import { tool } from "@opencode-ai/plugin"

export default tool({
  description: "Search file contents using regex (follows symlinks)",
  args: {
    pattern: tool.schema.string().describe("Regex pattern to search for in file contents"),
    path: tool.schema.string().optional().describe("The directory to search in. Defaults to the current working directory."),
    include: tool.schema.string().optional().describe('File pattern to include in the search (e.g. "*.js", "*.{ts,tsx}")'),
  },
  async execute(args, context) {
    const dir = args.path || context.directory
    const rgArgs = [
      "--no-config",
      "--hidden",
      "--no-messages",
      "--follow",
    ]
    if (args.include) rgArgs.push(`--glob=${args.include}`)
    rgArgs.push("--glob=!**/.git/**")
    rgArgs.push("--", args.pattern, dir)

    const proc = Bun.spawn(["rg", ...rgArgs], {
      stdout: "pipe",
      stderr: "pipe",
    })
    const stdout = await new Response(proc.stdout).text()
    await proc.exited
    const exitCode = proc.exitCode

    if (exitCode === 1) return "No matches found"
    if (exitCode === 0) return stdout || "No matches found"
    throw new Error(`rg failed (exit ${exitCode}): ${await new Response(proc.stderr).text()}`)
  },
})
