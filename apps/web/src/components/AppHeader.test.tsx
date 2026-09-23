import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppHeader } from "./AppHeader";
import i18n from "../i18n";

afterEach(async () => {
  cleanup();
  await i18n.changeLanguage("en");
});

describe("AppHeader i18n", () => {
  it("renders English UI copy by default", () => {
    render(<AppHeader />);

    expect(screen.getByText(/practice english/i)).toBeInTheDocument();
  });

  it("switches UI copy to Chinese when 中文 is clicked, and back to English", async () => {
    render(<AppHeader />);

    fireEvent.click(screen.getByRole("button", { name: "中文" }));
    expect(await screen.findByText("通过和 NPC、物品对话来练习英语。")).toBeInTheDocument();
    expect(screen.queryByText(/practice english/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "English" }));
    expect(await screen.findByText(/practice english/i)).toBeInTheDocument();
  });

  it("marks the active language button with aria-pressed", async () => {
    render(<AppHeader />);

    expect(screen.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "中文" })).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: "中文" }));
    await screen.findByText("通过和 NPC、物品对话来练习英语。");

    expect(screen.getByRole("button", { name: "中文" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "false");
  });
});
