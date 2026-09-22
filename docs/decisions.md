# 待决策事项

只记录需要人类裁决的问题。任务 `block` 时必须在这里追加一条，裁决后用 `orchestrator unblock --decision "<裁决>"` 回写。

格式：

| 日期 | 任务 | 问题 | 选项与影响 | 推荐方案 | 截止时间 | 裁决 |
|---|---|---|---|---|---|---|
| 2026-09-22 | SETUP-001 | 验收条件 1「项目能一键启动，README 写明怎么跑」要求编辑根目录 `README.md`，但 backlog.json 里本任务的 `paths` = `["package.json","pyproject.toml","*.csproj","*.sln","scripts/**",".github/**","src/**"]`，不含 `README.md`（也不含 `docs/**`）。`scripts/orchestrator.mjs` 的 `fileAllowed()` 按 `task.paths` 做严格 glob 匹配，没有根文档豁免，`complete` 时改动 README.md 会被边界门禁拒绝为越界。其余两条验收条件（verify 命令真实存在且通过、最小测试用例）已完成并验证通过，见 `artifacts/SETUP-001/run-20260922-123703-d22998/`。 | A. 把 `README.md` 加进 SETUP-001.paths（`orc import-tasks --replace` 或等效状态机命令），语义最贴合验收条件，改动最小。<br>B. 改验收条件，把"README 写明怎么跑"换成 paths 内某文件（如新增 `scripts/README.md`）承载运行说明。<br>C. 拆一个新任务单独负责 README.md，SETUP-001 只交付骨架+verify+测试三项中已可验证的部分。 | A：直接扩大 SETUP-001.paths 补一个字段，无需拆任务或改验收语义，最快让当前任务收尾。 | 阻塞中，等下一协调周期处理即可（无外部硬性 deadline） | |
