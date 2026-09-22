# 项目级 Agent 规则

> 工具会强制其中大部分规则。写在这里是为了让你知道为什么会被拒绝，而不是靠自觉。

1. 先读 `docs/product.md`、`docs/architecture.md`、`docs/progress.md`、相关 ADR、任务验收条件和本文件。中断恢复先跑 `orchestrator show --task <ID>`。
2. 只领取 `backlog.json` 中状态为 `ready` / `rework` / `interrupted` 的一个任务，且必须由协调器分派（工具会检查协调器租约）。
3. 只改任务 `paths` 内、且属于本 role 的文件。`ownership.json` 的 `exclusive` 路径（契约、共享类型、迁移、CI、基础设施）只能由 `contract-owner` 改——工具会在送审时按实际 diff 拦截。
4. 不提交密钥、真实数据，不动生产环境。支付、权限、隐私、破坏性迁移、外部付费资源、需求冲突一律 `block`，并把选项/影响/推荐方案写进 `docs/decisions.md`。
5. **完成定义**：代码已提交 + `orchestrator verify --task <ID>` 全绿 + 每条验收条件有具体证据 + `handoff.md` 已写 + `orchestrator complete` 通过。
   手写 `result: pass` 会被拒绝：只有 `verify` 写入的退出码算数。
6. `done` 不等于"我写完了"，而是"审查通过且已合入集成分支"。集成由 `orchestrator integrate` 依据 Git 祖先关系确认。
7. 每 10--15 分钟或每个里程碑跑一次 `heartbeat`；租约过期任务会被 `recover` 回收为 `interrupted`，分支与工件保留，下一个 Agent 接着干，不重写。
8. 每轮结束前把事实写进 `handoff.md`。判断标准：下一个 Agent 只看仓库和工件，能不能继续。
9. 不自审、不自合。Reviewer 与实施者必须是不同 Agent；合并走正常 PR 与 CI。
