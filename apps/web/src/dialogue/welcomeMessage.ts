export interface NpcProfile {
  id: string;
  name: string;
}

export const DEFAULT_NPC: NpcProfile = { id: "npc-mira", name: "Mira" };

export function getWelcomeMessage(npc: NpcProfile = DEFAULT_NPC): string {
  return `Hi, I'm ${npc.name}! Welcome to Maple Street — ask me anything to get started.`;
}
