# 方案设计与权衡

本文档记录"**git 单仓库 + workspace/ 子目录 + 相对符号链接**"这套 agent 工作面方案的适用场景、利弊和实操注意事项。

## 适用场景

**是这套方案的目标场景**：

- 巨型项目（monorepo / 几百万行 / 几十个服务），agent 直接面对项目根目录会因为上下文噪声而效率低
- 想给 agent 一个**精选视图**：把当前任务相关的若干目录拼成一个稳定工作面
- 不依赖 Windows 原生支持（Linux / macOS / WSL 都 OK）
- 链接目标都在**同一个 git 仓库**内

**不是目标场景**：

- 小项目 —— 直接 `cd` 到子目录工作即可，引入这层抽象是过度设计
- 需要真正的隔离（防止 agent 越界访问）—— 这套方案是**约定级**，不是强制级；要强制隔离请用容器 / chroot / sandbox
- Windows 主战场 —— 符号链接在 Windows 上需要 Developer Mode 或管理员，CI / Docker layer 缓存也容易掉链接
- 链接目标在外部仓库 —— 那会引入 git 边界问题（详见"对比"一节）

## 与替代方案对比

| 方案 | 解决什么 | 不解决什么 |
|------|---------|----------|
| **本方案**（workspace + 同仓库 + 相对链接） | 上下文裁剪、稳定工作面、适配层归属、多 view 任务切换 | 不做硬隔离、不减少 disk 占用 |
| 裸符号链接到外部仓库（`ln -> ../other-repo`） | 临时拼接 | git 边界、bootstrap、写穿透混淆 — **多数问题本方案已解决** |
| Claude `permissions.additionalDirectories` | 让 agent 能读 sibling 目录 | 不提供工作面、不裁剪上下文、不解决适配层归属 |
| `git sparse-checkout` | 缩小盘上文件、加快 clone | 不提供 view 抽象 — **与本方案互补** |
| `git submodule` / `subtree` | 把外部代码纳入仓库历史 | 重量级，写工作流复杂；不解决上下文噪声 |
| 容器 / chroot | 真正的硬隔离 | 重，开发体验差；非必需场景下杀鸡用牛刀 |

## 利

1. **上下文裁剪**：agent 的根目录就是 `workspace/`，`ls` / glob / 跨文件搜索的噪声减少一两个数量级。这是巨型项目里最大的收益。
2. **适配层有家**：hook、CLAUDE.md、健康检查脚本都跟着仓库走，新人 clone 就有，CI 也能跑。
3. **稳定工作目录**：agent 永远从 `workspace/` 起步，工具默认根、`additionalDirectories`、IDE 工作区等设置都不用按任务切。
4. **任务级 view**：`workspace-auth/`、`workspace-billing/` 等多个 view 共存，每个配独立 CLAUDE.md 聚焦特定任务上下文。
5. **git status 正确**：链接目标在本仓库内，改动通过任何路径触发，`git status` / `git diff` 都能正常显示（用规范路径）。
6. **零 bootstrap**：相对链接 commit 进库，clone 出来直接可用。无需 `setup.sh`。
7. **PR / code review 清晰**：diff 永远显示规范路径，reviewer 看到的就是真实修改位置，不会因为 view 路径而迷惑。
8. **可移植性局限于 Linux/macOS 而非 git 版本**：所有现代 git 都正确处理符号链接 commit/checkout。

## 弊

### 仍然存在、需要持续防范的

1. **路径同一性双面孔**：同一文件可叫 `workspace/auth/foo.c` 也可叫 `src/auth/foo.c`。agent 容易在 commit message、错误信息、回复用户时混用两种路径。
   - **缓解**：CLAUDE.md 明确规定"对外表达永远用规范路径"。

2. **LSP 索引重复**：clangd / pyright / TS LSP 默认会把符号链接两侧都索引一遍，巨型项目里 RAM 和索引时间翻倍。
   - **缓解**：LSP 配置里 exclude `workspace/`，只索引规范路径。详见 README.md。

3. **构建产物路径漂移**：在 `workspace/` 下跑 `make` / `cargo build` / `npm install`，产物的落地位置依赖于工具是否做了 `realpath`，可能在 view 路径下也可能在规范路径下。
   - **缓解**：硬性约定"build 永远 `cd` 到规范路径下跑"，写进 CLAUDE.md。

4. **工具兼容性**：grep / find / rg / fast-glob / 编辑器搜索 / lint 等工具默认是否跟随符号链接各不相同。新引入工具时要重新评估。
   - **缓解**：本仓库的 `.claude/hooks/rewrite-bash.mjs` 已经处理了 Bash 里的 grep/find/rg。新工具一旦发现问题，按同样模式加 hook 或文档约定。

5. **环引用**：如果不小心把 view 的目标又链回 workspace/，部分工具会陷入死循环。
   - **缓解**：`scripts/check-symlinks.sh` 启动 / CI 时跑一遍。

6. **"隐藏"只是约定**：agent `cd ..` 或用绝对路径仍能访问被"隐藏"的目录。
   - **缓解**：接受这是约定级方案；真要硬隔离请用容器。绝大多数场景里，agent 不会主动越界，约定级足够。

### 已被本方案解决（写下来避免重复讨论）

| 风险 | 为什么不再是问题 |
|------|----------------|
| git 边界混乱（commit 进了别的仓库） | 链接目标都在本仓库内，commit 路径明确 |
| Bootstrap 成本（clone 后链接断） | 相对链接 commit 进库，clone 即可用 |
| 不可移植（链接含绝对路径） | 模板硬约束相对链接，CI 检查可加 |
| 写穿透到外部仓库 | 目标就在本仓库，"穿透"了也还在自己的版本管理下 |

## 实操硬约束

写进 CLAUDE.md，agent 必须遵守：

1. `workspace/` 下**只有相对符号链接**，没有真文件 —— 这条违反就是异常
2. 任何对外表达（commit message、PR 描述、错误信息、回复用户）用**规范路径**，不用 view 路径
3. 任何会落地产物的命令（build / test / install）**`cd` 到规范路径下跑**
4. LSP 配置 exclude `workspace/`，让索引只走规范路径
5. 启动时跑一次 `scripts/check-symlinks.sh`，确认 view 没漂移

## 决策清单

接入本方案前，确认以下问题答案都是"是"：

- [ ] 项目规模足够大，agent 直接面对项目根会有显著上下文噪声？
- [ ] 不需要支持 Windows 原生（WSL 可接受）？
- [ ] 不需要硬隔离（接受约定级，agent 越界用其他机制兜底）？
- [ ] 团队接受"对外表达用规范路径"的约定？
- [ ] LSP / build / lint 工具链可以配 exclude `workspace/`？
- [ ] CI 可以加一步符号链接健康检查？

任何一条是"否"，请重新评估方案。

## 演进路径

### 早期：单一 workspace 试水

一个 `workspace/` 装当前任务相关的几个目录。观察 agent 在裁剪后的视图里效率是否提升、commit message 路径表达是否乱、build 产物有没有跑偏。这是验证方案合不合适的阶段。

### 中期：拆出多个任务级 view

业务规模上来后，单一 workspace 又会变成新的"噪声集中地"。按任务 / 子系统拆 view：

```
workspace-auth/      → 链入 auth 相关目录
workspace-billing/   → 链入 billing
workspace-infra/     → 链入 infra
```

每个 view 配自己的 `CLAUDE.md`（写明覆盖哪些规范路径、当前焦点）。agent 启动时指定 cwd 进入对应 view。

### 长期：沉淀规范 + 子领域按需硬隔离

把 LSP exclude、build policy、CI 健康检查沉淀为团队规范。同时识别**少数确实需要硬隔离的子领域**单独上更强的边界 —— **不要全局上容器**。

#### 为什么不要全局容器化

整个 monorepo 大部分代码（业务逻辑、纯算法、UI 组件）压根不需要硬隔离。全局上容器会带来：开发循环慢、工具链要重装、网络限制破坏 build/test、IDE / LSP 接入复杂化。值得为它付出这些代价的是少数。

#### 哪些子领域值得硬隔离

| 子领域 | 不隔离的真实风险 |
|--------|----------------|
| `secrets/`、`.env*`、私钥目录 | agent 误读 → 凭据进 transcript / log / git history |
| `db/migrations/` 接生产 schema | agent 跑迁移 → 改坏生产库 |
| 调用外部 API key / 链上钱包的脚本 | 误调用 → 真扣费、不可逆 onchain 操作 |
| `infra/terraform/`、`ops/k8s/` | `apply` 一下 → 改了生产环境 |
| `experimental/`、`vendor/third-party/` 跑不可信代码 | `npm/cargo install` 拉恶意依赖污染工作目录 |

#### 隔离手段（从重到轻，按需选用）

1. **真容器（devcontainer / docker compose）**
   - 在 `workspace-migrations/` 这种敏感 view 下放 `devcontainer.json`
   - agent 进入该 view 时启动到容器里跑，bind mount 只挂这个 view，不挂整个仓库
   - 最重，但隔离最彻底（独立网络栈、独立 fs view、独立工具链）

2. **bwrap / firejail / nsjail**
   - 轻量 sandbox 工具，per-command 包装
   - 启动比容器快，配置简单，适合 CI 里跑高危命令

3. **Claude Code 自带 sandbox（最贴合本方案）**
   - 在敏感 view 目录里放 `.claude/settings.local.json`：
     ```json
     {
       "sandbox": {
         "enabled": true,
         "filesystem": {
           "denyRead":  ["secrets/**", "**/.env*"],
           "denyWrite": ["db/migrations/**", "infra/**"]
         },
         "network": { "deniedDomains": ["*"] }
       },
       "permissions": {
         "deny": ["Bash(terraform apply *)", "Bash(kubectl apply *)"]
       }
     }
     ```
   - 只对这一个 view 生效，主仓库正常工作不受影响
   - 跟着本方案的整体哲学（约定 + 适配层）走，引入成本最低

4. **PreToolUse hook 软拦截**
   - 写 hook 检测命令 / 路径，进入敏感目录时 deny 高危操作
   - 最轻，但属于约定级 —— agent 用绝对路径或绕道 shell function 仍可绕过
   - 适合"挡住意外"，挡不住有意越界

#### 实操推荐

业务代码用 workspace symlink + 软约定就够；上面 5 类敏感子领域**单独配 Claude Code sandbox（方式 3）**；真要更硬的就 devcontainer（方式 1）。不要为了"统一"把整个仓库塞进容器。
