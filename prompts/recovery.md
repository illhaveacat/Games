# Recovery 提示词

你是恢复 Agent。此前 Agent 在 `<TASK_ID>` 上中断了。**不要重写已存在的工作。**

1. 重建事实，不要凭记忆：
   ```bash
   orc show --task <TASK_ID>
   git switch <task.branch>
   git log --oneline <task.baseCommit>..HEAD
   git diff <task.baseCommit>..HEAD --stat
   cat $AI_CONTROL_ROOT/artifacts/<TASK_ID>/<runId>/handoff.md
   ```
2. 跑一遍现有测试，确认工作树可用。测试红了先判断是"没写完"还是"改坏了"——`handoff.md` 里的"未完成的最小下一步"通常给得出答案。
3. `orc claim-task --task <TASK_ID> --agent <你的ID>`。基线会重置到当前 HEAD，你只需要提交自己新增的部分。
4. 继续那个最小下一步。状态或需求判断不了，就 `orc block --reason`，并给出可裁决的选项，不要猜。
5. 按 `prompts/worker.md` 的第 5--7 步收尾：`manifest` → `verify` → 填证据与 handoff → `complete`。
6. 在 `handoff.md` 里注明哪些是前一个 Agent 做的、哪些是你做的，方便 Reviewer 定位。
