import { tool } from "@opencode-ai/plugin"

export default tool({
  description: "Search file contents using regex (follows symlinks)",
  args: {
    pattern: tool.schema.string().describe("Regex pattern to search for"),
    path: tool.schema.string().optional().describe("Path to search in"),
    include: tool.schema.string().optional().describe("File pattern to include"),
  },
  async execute(args, context) {
    const dir = args.path || context.directory
    let cmd = `grep -R -n -a -E`
    if (args.include) cmd += ` --include='${args.include}'`
    cmd += ` '${args.pattern}' "${dir}"`

    const proc = Bun.spawn(["sh", "-c", cmd], {
      stdout: "pipe",
      stderr: "pipe",
    })
    const stdout = await new Response(proc.stdout).text()
    await proc.exited
    const exitCode = proc.exitCode

    if (exitCode === 1) return "No matches found"
    if (exitCode === 0) return stdout || "No matches found"
    if (stdout) return stdout
    throw new Error(`grep failed (exit ${exitCode})`)
  },
})
