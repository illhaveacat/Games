import { describe, expect, it } from "vitest";
import { DEFAULT_NPC, getWelcomeMessage } from "./welcomeMessage";

describe("getWelcomeMessage", () => {
  it("returns a non-empty greeting that names the NPC", () => {
    const text = getWelcomeMessage(DEFAULT_NPC);

    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain(DEFAULT_NPC.name);
  });

  it("defaults to the default NPC when no profile is given", () => {
    expect(getWelcomeMessage()).toBe(getWelcomeMessage(DEFAULT_NPC));
  });

  it("greets a different NPC by name when one is provided", () => {
    const other = { id: "npc-theo", name: "Theo" };

    expect(getWelcomeMessage(other)).toContain("Theo");
  });
});
