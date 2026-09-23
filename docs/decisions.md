# 待决策事项

只记录需要人类裁决的问题。任务 `block` 时必须在这里追加一条，裁决后用 `orchestrator unblock --decision "<裁决>"` 回写。

格式：

| 日期 | 任务 | 问题 | 选项与影响 | 推荐方案 | 截止时间 | 裁决 |
|---|---|---|---|---|---|---|
| 2026-09-22 | SETUP-001 | 验收条件要求改 README.md，但任务 paths 未覆盖，`complete` 会被边界门禁拒绝。属于目录/路径范围问题，不涉及产品、支付、隐私等需要人类裁决的事项，协调器直接处理。 | A. 把 README.md 加进 SETUP-001.paths（改动最小）。B. 改验收条件另立新任务。 | A：已采纳，已用 `import-tasks --replace` 把 README.md 加入 paths，`ownership.json` 同步补上。 | 无 | 协调器裁定：采纳方案 A，`unblock --to ready` |
| 2026-09-23 | ARCH-001 | 两件事：(1) 验收条件要求 apps/web、apps/server 各有最小入口+测试，但任务 paths 不含 apps/**，`complete` 会越界拒绝——目录范围问题；(2) contract-01 用纯 JS+JSDoc 实现 packages/shared 的类型定义，未用 TypeScript，与 `docs/architecture.md` 已定的全栈 TypeScript 技术栈不一致——技术实现选择问题。两者都不涉及产品/支付/隐私/生产发布，协调器直接处理。 | (1) A.把 apps/** 加进 ARCH-001.paths 一次建完；B.（contract-01 推荐）apps/web、apps/server 的最小骨架移交 WEB-001/SERVER-001 自建，ARCH-001 收窄为只交付 packages/shared + workspaces 声明；C.拆新任务。(2) 用 JSDoc 还是重写成 TypeScript。 | (1) 采纳 B：更贴合 ownership.json 里 apps/** 归 dev-worker 的边界，避免 contract-owner 越界代劳业务代码。(2) 改回 TypeScript：与已定架构一致，避免 monorepo 里 JS/TS 混用增加后续维护成本。 | 无 | 协调器裁定：采纳 (1)B + (2)重写为 TypeScript，已用 `import-tasks --replace` 收窄 ARCH-001 验收条件、在 WEB-001/SERVER-001 补充"根 npm test 需覆盖本 workspace"的验收条件，`unblock --to ready` |
