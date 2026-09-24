# 架构：Games

## 技术栈

- **前端**：TypeScript + React + Vite（应用外壳、路由、UI、i18n）+ Phaser 3（2D 剧情场景演出与交互）。
- **语音**：浏览器原生 Web Speech API（`SpeechRecognition` 做语音转文字，`SpeechSynthesis` 供 NPC 朗读）。前端直接调用，不经后端代理，不引入付费云端 ASR。
- **后端**：Node.js + TypeScript（Express）。负责 NPC 对话逻辑、剧情/词汇内容接口、玩家进度存储；对话逻辑先用规则/模板实现，接口预留未来接入 LLM 的扩展点。
- **数据**：剧情/场景/对话/词汇内容用版本受控的 JSON 内容包（`content/`）；玩家进度用轻量本地数据库（SQLite），避免过度设计。
- **国际化**：前端接入 i18n 框架（如 react-i18next）驱动 UI 文案多语言；学习内容语言固定为英语。
- **仓库形态**：npm workspaces 单仓库（monorepo）。

## 目录结构

```
Games/
  apps/
    web/            # React + Vite + Phaser 前端
    server/         # Node.js + TS 后端 API
  packages/
    shared/         # 前后端共用类型/契约（NPC 对话、内容包 schema 等）
  content/          # 剧情/场景/对话/词汇数据（JSON，非代码）
  docs/
  scripts/
  control/
```

## 模块边界

| 角色 | 可改路径 | 说明 |
|---|---|---|
| `contract-owner` | 根配置（`package.json`、`tsconfig*.json`）、`scripts/**`、`.github/**`、`packages/shared/**` | 独占：build 配置、CI、前后端共用契约，避免多人同时改导致冲突 |
| `dev-worker` | `apps/web/**`、`apps/server/**`、`content/**` | 前端、后端、内容数据的业务实现 |
| `qa-worker` | `tests/**` | 跨模块集成/端到端测试 |

## 约定

- 语音识别/合成走浏览器原生 API，后端不做语音代理，避免引入外部付费依赖。
- NPC 对话初期用规则/模板逻辑，返回结构需与 `packages/shared` 中定义的对话契约一致，方便后续替换为 LLM 驱动而不改前端调用方式。
- 根 `package.json` 的 `test` 脚本用 `--workspaces --if-present`（或等效方式）聚合各 workspace 测试（`npm test` 是 `agents.json.verifyCommands` 里配置的验证命令，必须保持可跑通），这样某个 workspace 还没建好时不会拖垮整体验证。
- 所有 workspace（含 `packages/shared`）一律用真正的 TypeScript（`.ts` + `tsconfig.json`）编写，不用 JSDoc 注释代替类型定义，避免 monorepo 里 JS/TS 混用增加维护成本。
- 遵循 `docs/product.md` 的设计原则：学习内容即玩法本身、失败低成本即时反馈、NPC 有长期记忆、情境先于孤立词汇、语音是及格线。
- 任务/等级/积分系统（2026-09-23 补充）：`packages/shared` 定义 Quest、QuestProgress、PlayerProgress 等共享类型；玩家进度（等级、积分、任务完成状态）用 SQLite 落盘持久化（而不是内存占位），具体驱动库由实现时选定，保持轻量、同步 API 优先，不引入需要额外部署的数据库服务。
- 角色与场景美术统一用代码/矢量绘制的占位美术（Phaser Graphics 或代码生成纹理 + tween 动画表现待机、眨眼、说话等状态），必须是可辨认的卡通人物和可辨认的场景，不是抽象几何块；不接入第三方文生图 API、不购买素材包，保持零外部成本。角色绘制与场景绘制各自封装成独立模块，风格可以后续整体替换（2026-09-24 按人类试玩反馈修订）。
