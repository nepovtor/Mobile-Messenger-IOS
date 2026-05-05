import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DemoAccountCard } from "./DemoAccountCard";

describe("DemoAccountCard", () => {
  it("renders demo account details and quick sign-in action", () => {
    render(
      <DemoAccountCard
        name="Анна Demo"
        phone="+15551230011"
        code="demo1111"
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("Анна Demo")).toBeInTheDocument();
    expect(screen.getByText("+15551230011")).toBeInTheDocument();
    expect(screen.getByText("demo1111")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /войти/i })).toBeInTheDocument();
  });
});
