# 待决策事项

只记录需要人类裁决的问题。任务 `block` 时必须在这里追加一条，裁决后用 `orchestrator unblock --decision "<裁决>"` 回写。

格式：

| 日期 | 任务 | 问题 | 选项与影响 | 推荐方案 | 截止时间 | 裁决 |
|---|---|---|---|---|---|---|
| 2026-09-22 | SETUP-001 | 验收条件要求改 README.md，但任务 paths 未覆盖，`complete` 会被边界门禁拒绝。属于目录/路径范围问题，不涉及产品、支付、隐私等需要人类裁决的事项，协调器直接处理。 | A. 把 README.md 加进 SETUP-001.paths（改动最小）。B. 改验收条件另立新任务。 | A：已采纳，已用 `import-tasks --replace` 把 README.md 加入 paths，`ownership.json` 同步补上。 | 无 | 协调器裁定：采纳方案 A，`unblock --to ready` |
| 2026-09-23 | ARCH-001 | 两件事：(1) 验收条件要求 apps/web、apps/server 各有最小入口+测试，但任务 paths 不含 apps/**，`complete` 会越界拒绝——目录范围问题；(2) contract-01 用纯 JS+JSDoc 实现 packages/shared 的类型定义，未用 TypeScript，与 `docs/architecture.md` 已定的全栈 TypeScript 技术栈不一致——技术实现选择问题。两者都不涉及产品/支付/隐私/生产发布，协调器直接处理。 | (1) A.把 apps/** 加进 ARCH-001.paths 一次建完；B.（contract-01 推荐）apps/web、apps/server 的最小骨架移交 WEB-001/SERVER-001 自建，ARCH-001 收窄为只交付 packages/shared + workspaces 声明；C.拆新任务。(2) 用 JSDoc 还是重写成 TypeScript。 | (1) 采纳 B：更贴合 ownership.json 里 apps/** 归 dev-worker 的边界，避免 contract-owner 越界代劳业务代码。(2) 改回 TypeScript：与已定架构一致，避免 monorepo 里 JS/TS 混用增加后续维护成本。 | 无 | 协调器裁定：采纳 (1)B + (2)重写为 TypeScript，已用 `import-tasks --replace` 收窄 ARCH-001 验收条件、在 WEB-001/SERVER-001 补充"根 npm test 需覆盖本 workspace"的验收条件，`unblock --to ready` |
| 2026-09-23 | （第二批完成后，未建任务） | NPC 对话理解方式与产品要求有差距：`docs/product.md` 要求"能听懂玩家说的话并给出针对性反馈，不是简单关键词匹配"，但目前开场关卡是规则/关键词匹配（架构文档里是"先规则，预留接入 LLM"）。rev-01 审 STAGE-001 时指出：正确回答如 "No, thanks"、"I don't want sugar" 会被漏判，关键词表覆盖面窄，单个关键词在不相关语境也会推进。继续提升理解能力可能涉及外部付费 AI 服务，属于人类决策 | A. 继续用规则，在 content 里扩充短语/同义说法：免费、可控、可离线，但"听懂"的上限低，达不到产品要求的"不是简单关键词匹配"。B. 接入大模型（LLM）做意图理解，规则只作为兜底：对话最自然、最接近产品要求，但每次对话有调用费用，需要 API 密钥和费用上限，玩家输入会发给第三方（涉及隐私说明）。C. 先 A 把开场关卡体验补好，同时单独立一个"LLM 接入评估"任务，费用和隐私方案给人类确认后再上 | C：先低成本修好当前关卡的漏判，不阻塞后续内容；LLM 涉及费用和玩家数据外发，等人类看过费用估算和隐私方案再决定 | 人类下一次回复 | 2026-09-24 人类裁决：采纳 C。先用规则扩充修好开场关卡（DIALOG-001）；协调器另出 LLM 接入的费用与隐私方案（docs/llm-evaluation.md）供人类决定是否接入。人类同时选择先亲自试玩第一关再定后续方向 |
| 2026-09-28 | DIALOG-001 | dev-01 claim 时 baseCommit 记成了 f18c57c（其旧分支 agent/dev-01 的位置），落后 main 57 个提交，工作树里没有 STAGE-001 的对话服务与 content 数据，若快进到 main 会被边界门禁把 57 个提交误判为越界。纯分支基线问题，不涉及产品/支付/隐私/发布，协调器直接处理。 | A. unblock 回 ready，dev-01 分支已快进到 main（0ee86d8）后重新 claim，基线随之重置。B. 另换分支名重新 claim。 | A：改动最小，已核实 agent/dev-01 已包含 main 0ee86d8。 | 无 | 协调器裁定：采纳 A，`unblock --to ready` |
