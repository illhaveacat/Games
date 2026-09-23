import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PlayerStatus } from "./PlayerStatus";

afterEach(() => {
  cleanup();
});

describe("PlayerStatus", () => {
  it("renders nothing while progress hasn't loaded yet", () => {
    const { container } = render(<PlayerStatus progress={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the player's level and points", () => {
    render(
      <PlayerStatus progress={{ level: 2, xp: 100, points: 25, completedQuestIds: ["q1"], unlocks: [] }} />,
    );

    expect(screen.getByTestId("player-status-level")).toHaveTextContent("Level 2");
    expect(screen.getByTestId("player-status-points")).toHaveTextContent("25 pts");
  });
});
