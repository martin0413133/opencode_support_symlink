# Claude Code 符号链接适配

让 Claude Code 在含有符号链接到目录的项目里能正常搜索代码。

## 背景

项目把部分源码挂在符号链接后面（典型场景：把外部库或子项目通过 `ln -s` 链入工作目录），但常见搜索命令默认**不跟随符号链接**：

| 命令 | 默认是否跟随 symlink | 跟随需要的 flag |
|------|---------------------|----------------|
| `grep -r` | 否 | `-R` |
| `find` | 否（命令行参数除外） | `-L` |
| `rg`（ripgrep） | 否 | `--follow` 或 `-L` |
| Claude Code 内置 `Grep` 工具 | 否（基于 ripgrep） | 不暴露 follow 参数 |

模型如果直接调用这些命令或工具，会得到空结果，误判项目里没有相关代码。

opencode 用 plugin + 自定义工具解决了同样问题。本目录是 Claude Code 的等价适配。

## 方案

### 1. PreToolUse Bash hook — 自动加 follow flag

`rewrite-bash.mjs` 在每次 Bash 调用前检查命令，按段（用 `;` `|` `||` `&&` 换行切分）查找 `grep` / `find` / `rg`，缺 follow flag 就自动加上：

- `grep ...` → `grep -R ...`（若有 `-r`，升级为 `-R`）
- `find ...` → `find -L ...`
- `rg ...` → `rg --follow ...`

幂等 — 已经带正确 flag 的命令不会被重复修改。

### 2. PreToolUse Grep hook — 引导到 Bash

`deny-grep.mjs` 拒绝调用内置 Grep 工具（因为它不暴露 `--follow`），在 deny reason 里告诉模型改用 Bash + `rg --follow`，然后 Bash hook 接力。

### 3. 不需要适配的工具

- **Read** — 本身跟随符号链接
- **Glob** — 实测 fast-glob 默认 `followSymbolicLinks: true`

## 文件结构

```
.claude/
├── settings.json                hook 配置
├── hooks/
│   ├── rewrite-bash.mjs         Bash 命令重写
│   ├── deny-grep.mjs            Grep 工具 deny
│   └── rewrite-bash.test.mjs    32 case 单元测试
├── scripts/
│   └── check-symlinks.sh        符号链接健康检查（悬空 / 环）
├── templates/
│   └── workspace-starter/       workspace 模式 starter 模板（可拷到其他项目）
└── README.md                    本文件

# 项目根另有
CLAUDE.md                        本仓库工作约定（agent 自动读取）
```

## 测试

```sh
node .claude/hooks/rewrite-bash.test.mjs
```

覆盖：

- 三个命令各自的「缺 flag 补全」「已有 flag 不重复加」
- `grep -r` → `-R` 升级、`-rn` / `-nr` 等组合 flag 内部升级
- 管道 / 分号 / `&&` / `||` / 换行作为段分隔符
- 多行脚本逐段处理
- 字符串字面量里的 `grep` 不被误改、`egrep` `myrg` 不匹配
- 已记录的限制：`$(...)` 子 shell 内嵌命令不处理

调试日志：将环境变量 `CLAUDE_BASH_HOOK_LOG` 设为某路径即可记录每次调用，例如：

```jsonc
// .claude/settings.json 的 hook 命令里加 env：
"command": "CLAUDE_BASH_HOOK_LOG=/tmp/claude-bash-hook.log node ${CLAUDE_PROJECT_DIR}/.claude/hooks/rewrite-bash.mjs"
```

默认不写日志。

## 实测发现

在 **Claude Code 自家的 Bash 工具**环境里：

- `find` 被 Claude Code wrap 成 `bfs`（默认跟随符号链接）→ `find -L` 重写**冗余但无害**
- `grep` 被 wrap 成 `ugrep`（自带符号链接处理）→ `grep -R` 重写**冗余但无害**
- `rg` 是原生 `/usr/bin/rg` → `rg --follow` 重写**必要**

保留全部三个重写是因为：
1. 可移植 — 其他 shell / CI / 容器里 `find` `grep` 是原生 GNU 版本，仍需要 hook
2. Fallback — 即便在 Claude Code 里，如果用 `command grep` / `\grep` / `/usr/bin/grep` 绕过 shell function wrap，hook 也能兜底

## 方案权衡（设计决策记录）

考虑过三种实现：

| 方案 | 工作方式 | 优劣 |
|------|---------|------|
| 纯 settings.json | `permissions.deny: ["Grep"]` + SessionStart 注入说明 | 最简但依赖模型自觉加 flag |
| deny + 提示 | hook 检测缺 flag 时拒绝并让模型重写 | 透明但每个 pattern 多一次往返 |
| **自动重写**（选定） | hook 检测缺 flag 时静默改写并继续 | 零往返、对模型零摩擦、对齐 opencode 行为 |

`deny + 提示` 需要的检测正则跟自动重写一样，复杂度相当，但要多一次往返；自动重写更优。

## 与 opencode 对照

| opencode | Claude Code |
|---|---|
| `.opencode/plugins/grep-hook.ts` | `.claude/hooks/rewrite-bash.mjs` + settings.json PreToolUse Bash |
| `.opencode/tools/grep.ts`（自定义 rg --follow 工具） | `.claude/hooks/deny-grep.mjs`（deny 内置 Grep 引导模型走 Bash） |

## Hook 激活注意事项

Claude Code 的 settings.json watcher 只监听**会话启动时已存在 settings 文件的目录**。新增 `.claude/settings.json` 后，hook 不会立即生效，需要二选一：

1. 在 Claude Code 里输入 `/hooks` 打开菜单（会强制 reload）
2. 完全 quit 后重启 `claude`（不是 `--resume`）

可以用本目录的测试套件验证 hook 脚本本身正确：

```sh
node .claude/hooks/rewrite-bash.test.mjs    # 32 passed, 0 failed
```

如果脚本测试通过但 Claude Code 不调用 hook，问题在 watcher，不在脚本。
