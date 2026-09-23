# @games/shared

前后端共用的类型与最小工厂函数，供 `apps/web`、`apps/server` 引用。

## 导出

- `DialogueRequest { speakerId: string; text: string }`
- `DialogueResponse { speakerId: string; text: string; timestamp: number }`
- `createDialogueRequest(input)` / `createDialogueResponse(input)`：按上述接口构造，`speakerId`/`text` 为空时抛错。

## 开发

```bash
npm run build   # tsc -p tsconfig.json，产物在 dist/
npm test        # 先 build，再 node --test dist/index.test.js
```
