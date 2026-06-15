# 项目工作约定（agent 阅读）

## 仓库结构

本仓库使用 `workspace/` 作为 agent 的**精选视图**。原则：

- `workspace/` 下都是**相对符号链接**，目标在本仓库的其他目录
- 真实源码在规范路径下（如 `src/`、`packages/`、`services/`）
- agent 进入 `workspace/` 子目录工作；规范路径下的代码同样可读可写

## 必须遵守

1. **路径表达用规范路径**：写 commit message、PR 描述、错误信息、跟用户对话时，用真实目录路径（如 `src/auth/login.c`），不用 view 路径（`workspace/auth/login.c`）。
2. **改动通过任意路径都行**，但 `git status` / `git diff` 只显示规范路径下的变化 —— 这是同一份文件的两个名字，git 不会重复显示。
3. **workspace/ 下不创建真文件**：新增文件直接放规范路径，再视情况加链接进 workspace/。
4. **不要把链接改成绝对路径**：保持相对，否则别人 clone 后链接会断。
5. **不要让 workspace/ 出现在 LSP 索引里**：本仓库的 LSP 配置已把它 exclude，跟着配置走，不要绕过。

## 工具

| 命令 / 工具 | 行为 |
|------------|------|
| Bash 里的 `grep` / `find` / `rg` | `.claude/hooks/rewrite-bash.mjs` 自动加 `-R` / `-L` / `--follow` |
| 内置 `Grep` 工具 | 被 deny；改用 Bash `rg --follow` |
| Read / Edit / Write | 跟随符号链接，无需特别处理 |
| Glob | fast-glob 默认跟随符号链接 |

## 健康检查

```sh
./scripts/check-symlinks.sh workspace
```

启动前跑一下，确保 view 配置没漂移（链接没断、没环）。

## 构建 / 测试

任何会落地产物（`.o`、`build/`、`dist/`、`node_modules/` 等）的命令 **`cd` 到规范路径下跑**。
不要在 `workspace/` 里 `make`、`cargo build`、`npm install` —— 产物路径会乱。

## 文件清单

| 文件 | 作用 |
|------|------|
| `.claude/settings.json` | Hook 注册 |
| `.claude/hooks/rewrite-bash.mjs` | Bash 命令重写 |
| `.claude/hooks/deny-grep.mjs` | Deny 内置 Grep |
| `.claude/hooks/rewrite-bash.test.mjs` | Hook 单测 |
| `scripts/check-symlinks.sh` | 符号链接健康检查 |
| `workspace/` | 精选视图（只放相对链接） |
