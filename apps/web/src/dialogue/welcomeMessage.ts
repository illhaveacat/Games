export interface NpcProfile {
  id: string;
  name: string;
}

// 开场关卡（咖啡馆点单，STAGE-001）的默认 NPC：咖啡师 Jamie。
// id/name 跟 content/npcs/barista.json 的 id/name 保持一致（那是后端对话逻辑的事实来源），
// apps/web 目前没有直接读取 content/ JSON（避免引入跨 workspace 的构建期文件依赖/Vite fs 访问范围问题），
// 这里是有意的小重复；如果以后 barista.json 的名字改了，这里也要跟着改。
export const DEFAULT_NPC: NpcProfile = { id: "npc-barista", name: "Jamie" };

export function getWelcomeMessage(npc: NpcProfile = DEFAULT_NPC): string {
  return `Welcome to Maple Street Cafe! I'm ${npc.name}, the barista here — say hi and let me know if you'd like anything.`;
}
