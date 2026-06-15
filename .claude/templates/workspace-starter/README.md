# Workspace Starter

巨型项目 agent view 模板。结构：

```
<your-repo>/
├── workspace/              # agent 的工作面（只放符号链接，不放真文件）
│   ├── <view-1> -> ../path/to/relevant/dir/1
│   ├── <view-2> -> ../path/to/relevant/dir/2
│   └── ...
├── src/  packages/  ...    # 真实源码（按实际项目布局）
├── scripts/
│   └── check-symlinks.sh   # CI / 启动时跑
├── .claude/
│   ├── settings.json       # Bash + Grep hook 注册
│   └── hooks/              # 自动加 follow flag、deny 内置 Grep
└── CLAUDE.md               # 工作约定
```

## 关键约束（同仓库 + 相对链接）

1. **目标必须在同一个 git 仓库内** —— 链接进 workspace/ 的所有目录都属于本仓库，而不是外部仓库
2. **必须用相对链接** —— `ln -sr <target> workspace/<view-name>` 或手写 `../`，**不要用绝对路径**，否则别人 clone 后链接会断
3. **workspace/ 只放链接，不放真文件** —— `git diff` 看到 workspace/ 下的真实文件改动算异常
4. **commit message / PR 描述用规范路径**（如 `src/auth/foo.c`），不用 `workspace/auth/foo.c`

## 安装到你的项目

```sh
# 1. 拷贝模板进你的仓库（假设当前在你的项目根）
cp -r .claude/templates/workspace-starter/.claude  .
cp -r .claude/templates/workspace-starter/scripts  .
cp .claude/templates/workspace-starter/CLAUDE.md   .

# 2. 创建 workspace/ 并加入第一个 view（相对链接）
mkdir -p workspace
ln -sr src/auth workspace/auth        # GNU coreutils: ln -sr 自动算相对路径
ln -sr packages/billing workspace/billing
# ... 按需添加

# 3. 健康检查
./scripts/check-symlinks.sh workspace

# 4. 自测 hook
node .claude/hooks/rewrite-bash.test.mjs

# 5. 把 workspace/ 的链接 commit 进库
git add workspace .claude scripts CLAUDE.md
git commit -m "chore: add agent workspace view"

# 6. agent 启动时 cd workspace（或在 wrapper 里 cd 也行；CLAUDE.md 会指引）
```

## 多 view 策略

巨型项目里**每个任务一个 view** 比"一个大 workspace 装所有东西"更聚焦：

```
workspace-auth/      → 链入 auth 相关目录
workspace-billing/   → 链入 billing
workspace-infra/     → 链入 infra
```

每个 view 配自己的 `CLAUDE.md`（写明本 view 覆盖哪些规范路径、当前任务焦点）。
开 agent 时 `--cwd workspace-auth/` 或类似方式指定。

## 进 CI

在 CI pipeline 加一步：

```yaml
- name: validate workspace symlinks
  run: ./scripts/check-symlinks.sh workspace
```

防止有人偷偷把链接改成绝对路径、删了目标目录但忘删链接、或环引用进 workspace。

## LSP 索引（C/C++ / Python / TS 大项目）

LSP 默认会把符号链接两侧都索引一遍，巨型项目里这会让索引时间和内存翻倍。

二选一：

- **只索引规范路径**：在 LSP 配置里把 `workspace/` 加入 exclude
  - clangd: `.clangd` 加 `If: { PathExclude: ["workspace/.*"] }`
  - pyright: `pyrightconfig.json` 加 `"exclude": ["workspace"]`
  - TS: `tsconfig.json` 的 `exclude` 加 `"workspace"`
- **只索引 workspace 视图**：反之，让 LSP 只看 workspace/ 下的链接，规范路径里某些目录加入 exclude

推荐第一种 —— 工具看到的是同一份代码，避免"go to definition"出现两条结果。

## 构建产物

不要在 workspace/ 里跑会落地 artifact 的命令。Build / test 永远 `cd` 到规范路径下跑，产物落在 `build/` `target/` `dist/` 等规范目录，方便 cache 和 CI。
