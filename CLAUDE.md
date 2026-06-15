# 项目说明

这是个 wrapper 仓库，本身不含源码。所有源码通过符号链接挂在 `ln/`：

```
.
├── ln  -> ../bsc_str_lib    # 符号链接：真实源码所在
├── .claude/                 # Claude Code 适配（hook + 文档）
├── .opencode/               # opencode 适配（plugin + tool）
└── CLAUDE.md (本文件)
```

## 工作约定

1. **`ln/` 是 view，不是真实目录** — 任何 Edit/Write 到 `ln/...` 实际写入 `../bsc_str_lib/...`，那是**另一个 git 仓库**。
2. **commit / PR 在 target 仓库做**，不在 wrapper 仓库做：
   - `cd $(readlink -f ln)` 后再 `git commit`，确保改动进的是 `bsc_str_lib` 的历史
   - 本 wrapper 仓库的 `git status` 看不到 `ln/` 里的修改 —— 看不到 ≠ 没改
3. **路径表达**：写 commit message / PR 描述 / 回复用户时，用 **target 仓库的规范路径**（如 `bsc_str_lib/foo.c`），不要用 `ln/foo.c`。
4. **搜索和遍历**：grep / find / rg 在 Bash 里调用即可，`.claude/hooks/rewrite-bash.mjs` 会自动加 `-R` / `-L` / `--follow`。详见 `.claude/README.md`。
5. **健康检查**：开始工作前可以跑 `.claude/scripts/check-symlinks.sh` 确认 `ln/` 没断、没成环。

## 不要做

- 不要往 `ln/` 里塞新文件（约定上它是 view，不是工作目录）— 新文件直接放 target 仓库
- 不要在 wrapper 仓库 commit `ln/` 里的内容 — 那些文件本就不在 wrapper 仓库的 tracked 集合里
- 不要用 `ln/.git` 当作 wrapper 仓库的 `.git` —— 它们指向两个完全不同的仓库

## 适配层

| 文件 | 作用 |
|------|------|
| `.claude/settings.json` | Hook 注册 |
| `.claude/hooks/rewrite-bash.mjs` | Bash 命令补 follow flag |
| `.claude/hooks/deny-grep.mjs` | Deny 内置 Grep 工具，引导走 Bash |
| `.claude/hooks/rewrite-bash.test.mjs` | Hook 单测（32 cases） |
| `.claude/scripts/check-symlinks.sh` | 符号链接健康检查 |
| `.claude/README.md` | 适配层完整说明 |
