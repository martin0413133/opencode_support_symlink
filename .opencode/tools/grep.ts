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
    let cmd = `rg --follow -n`
    if (args.include) cmd += ` -g '${args.include}'`
    cmd += ` '${args.pattern}' "${dir}"`
    const result = await Bun.$`${cmd}`.text()
    return result || "No matches found"
  },
})
