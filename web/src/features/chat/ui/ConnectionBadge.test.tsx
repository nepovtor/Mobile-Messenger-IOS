import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConnectionBadge } from "@/features/chat/ui/ConnectionBadge";

describe("ConnectionBadge", () => {
  it.each([
    ["connected", "Connected"],
    ["connecting", "Connecting"],
    ["reconnecting", "Reconnecting"],
    ["disconnected", "Offline"],
    ["failed", "Connection issue"],
  ] as const)("renders %s state label", (state, label) => {
    render(<ConnectionBadge state={state} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
