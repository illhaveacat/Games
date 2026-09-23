# @games/shared

前后端共用的类型与最小工厂函数，供 `apps/web`、`apps/server` 引用。

## 导出

### 对话

- `DialogueRequest { speakerId: string; text: string }`
- `DialogueResponse { speakerId: string; text: string; timestamp: number }`
- `createDialogueRequest(input)` / `createDialogueResponse(input)`：按上述接口构造，`speakerId`/`text` 为空时抛错。

### 任务

- `Quest { id, npcId, title, completionCriteria, rewardXp, rewardPoints }`：一条任务的静态定义——`id` 任务唯一标识，`npcId` 发布任务的 NPC，`title` 任务标题，`completionCriteria` 人类可读的完成条件描述，`rewardXp`/`rewardPoints` 完成后发放的经验/积分（均须 ≥ 0）。
- `QuestStatus`：`"not_started" | "in_progress" | "completed"`。
- `QuestProgress { questId, status }`：玩家对某条任务的进度。
- `createQuest(input)`：校验并构造 `Quest`，任一必填字段为空或奖励为负数时抛错。
- `createQuestProgress(input)`：校验并构造 `QuestProgress`，`status` 省略时默认 `"not_started"`，非法 `status` 抛错。

### 等级与玩家进度

- `LevelThreshold { level, minXp }` / `LEVEL_THRESHOLDS`：等级->经验阈值表，`xp` 达到某档 `minXp`（含边界）即视为该等级，超过最高档后维持最高等级。
- `getLevelForXp(xp)`：按 `LEVEL_THRESHOLDS` 把经验值换算成等级的纯函数，`xp` 为负数时抛错。
- `PlayerProgress { level, xp, points, completedQuestIds }`：玩家整体进度——`level` 恒由 `xp` 派生（不单独接受外部传入，避免和 `xp` 不一致），`points` 为积分，`completedQuestIds` 为已完成任务 id 列表。
- `createPlayerProgress(input?)`：校验并构造 `PlayerProgress`，所有字段可省略（默认 `xp`/`points` 为 0、`completedQuestIds` 为 `[]`），`level` 由传入的 `xp` 自动计算。

## 开发

```bash
npm run build   # tsc -p tsconfig.json，产物在 dist/
npm test        # 先 build，再 node --test dist/index.test.js
```
