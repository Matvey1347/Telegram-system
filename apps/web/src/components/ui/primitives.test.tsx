import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  canonicalizeTimeInputValue,
  CustomSelect,
  isValidTimeInputValue,
  Tooltip,
} from "@/components/ui/primitives";

describe("CustomSelect", () => {
  it("renders the dropdown in a fixed overlay layer above surrounding layout", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <CustomSelect
        value="draft"
        onChange={() => {}}
        searchable={false}
        options={[
          { value: "draft", label: "Draft" },
          { value: "publish", label: "Publish" },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /draft/i }));

    const option = await screen.findByRole("button", { name: /publish/i });
    expect(container).not.toContainElement(option);
    expect(option.closest("div")?.className).toContain("z-[120]");
  });
});

describe("Tooltip", () => {
  it("renders content through a portal and closes on Escape", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div className="overflow-hidden">
        <Tooltip content="Helpful tab description">
          <button type="button">Info</button>
        </Tooltip>
      </div>,
    );

    await user.hover(screen.getByRole("button", { name: "Info" }));

    const tooltip = await screen.findByText("Helpful tab description");
    expect(container).not.toContainElement(tooltip);

    await user.keyboard("{Escape}");
    expect(screen.queryByText("Helpful tab description")).toBeNull();
  });
});

describe("time input helpers", () => {
  it("accepts single-digit hours and canonicalizes them for saving", () => {
    expect(canonicalizeTimeInputValue("8:15")).toBe("08:15");
    expect(isValidTimeInputValue("8:15")).toBe(true);
  });

  it("rejects incomplete or out-of-range times", () => {
    expect(canonicalizeTimeInputValue("8:1")).toBeNull();
    expect(canonicalizeTimeInputValue("24:00")).toBeNull();
    expect(isValidTimeInputValue("24:00")).toBe(false);
  });
});
