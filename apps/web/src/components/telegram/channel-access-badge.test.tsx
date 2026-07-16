import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ChannelAccessBadge,
  telegramChannelAccessLabel,
} from "@/components/telegram/channel-access-badge";

describe("ChannelAccessBadge", () => {
  it("shows the public label for public channels", () => {
    render(<ChannelAccessBadge accessMode="PUBLIC" />);
    expect(screen.getByText("Public")).toBeInTheDocument();
  });

  it("shows join requests for private channels that require approval", () => {
    render(<ChannelAccessBadge accessMode="PRIVATE_JOIN_REQUEST" />);
    expect(screen.getByText("Private · Join requests")).toBeInTheDocument();
  });

  it("falls back to Unknown when access mode is not resolved yet", () => {
    expect(telegramChannelAccessLabel(undefined)).toBe("Unknown");
  });
});
