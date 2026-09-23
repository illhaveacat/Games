import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DialogueBubble } from "./DialogueBubble";
import { DEFAULT_NPC, getWelcomeMessage } from "../dialogue/welcomeMessage";

describe("DialogueBubble", () => {
  it("renders the NPC's welcome line instead of a blank or placeholder", () => {
    const text = getWelcomeMessage(DEFAULT_NPC);
    render(<DialogueBubble npc={DEFAULT_NPC} text={text} />);

    const bubble = screen.getByTestId("dialogue-bubble");
    expect(bubble).toHaveTextContent(DEFAULT_NPC.name);
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(bubble.textContent?.trim().length).toBeGreaterThan(0);
    expect(bubble.textContent?.toLowerCase()).not.toContain("placeholder");
    expect(bubble.textContent?.toLowerCase()).not.toContain("todo");
  });

  it("re-renders with new dialogue text when the text prop changes", () => {
    const { rerender } = render(<DialogueBubble npc={DEFAULT_NPC} text="First line." />);
    expect(screen.getByText("First line.")).toBeInTheDocument();

    rerender(<DialogueBubble npc={DEFAULT_NPC} text="Second line." />);
    expect(screen.getByText("Second line.")).toBeInTheDocument();
    expect(screen.queryByText("First line.")).not.toBeInTheDocument();
  });
});
