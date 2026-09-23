export interface DialogueRule {
  keywords: string[];
  reply: string;
}

export interface NpcDefinition {
  name: string;
  rules: DialogueRule[];
  fallback: string;
}

export const NPCS: Record<string, NpcDefinition> = {
  "npc-mira": {
    name: "Mira",
    rules: [
      {
        keywords: ["hello", "hi", "hey"],
        reply: "Hi there! I'm Mira. Welcome to Maple Street.",
      },
      {
        keywords: ["bye", "goodbye", "see you"],
        reply: "Bye for now! Come back and chat anytime.",
      },
      {
        keywords: ["name", "who are you"],
        reply: "I'm Mira — I run the flower stand just down the street.",
      },
    ],
    fallback: "Hmm, I'm not quite sure what you mean. Could you try saying that another way?",
  },
};

export const UNKNOWN_NPC_REPLY =
  "I don't think I know anyone by that name around here.";
