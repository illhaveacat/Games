# 待决策事项

只记录需要人类裁决的问题。任务 `block` 时必须在这里追加一条，裁决后用 `orchestrator unblock --decision "<裁决>"` 回写。

格式：

| 日期 | 任务 | 问题 | 选项与影响 | 推荐方案 | 截止时间 | 裁决 |
|---|---|---|---|---|---|---|
| 2026-09-22 | SETUP-001 | 验收条件要求改 README.md，但任务 paths 未覆盖，`complete` 会被边界门禁拒绝。属于目录/路径范围问题，不涉及产品、支付、隐私等需要人类裁决的事项，协调器直接处理。 | A. 把 README.md 加进 SETUP-001.paths（改动最小）。B. 改验收条件另立新任务。 | A：已采纳，已用 `import-tasks --replace` 把 README.md 加入 paths，`ownership.json` 同步补上。 | 无 | 协调器裁定：采纳方案 A，`unblock --to ready` |
