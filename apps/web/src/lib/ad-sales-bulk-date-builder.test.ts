import { describe, expect, it } from "vitest";
import { expandBulkDateSelections } from "./ad-sales-bulk-date-builder";

describe("ad-sales bulk date builder", () => {
  it("expands ranges and singles into sorted unique local date keys", () => {
    const result = expandBulkDateSelections([
      { id: "range-1", type: "range", from: "2026-08-16", to: "2026-08-20" },
      { id: "range-2", type: "range", from: "2026-08-20", to: "2026-08-21" },
      { id: "single-1", type: "single", date: "2026-09-12" },
      { id: "range-3", type: "range", from: "2026-09-01", to: "2026-09-02" },
    ]);

    expect(result.errors).toEqual([]);
    expect(result.dates).toEqual([
      "2026-08-16",
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
      "2026-09-01",
      "2026-09-02",
      "2026-09-12",
    ]);
  });

  it("can preserve duplicate dates for repeated ad placements", () => {
    const result = expandBulkDateSelections(
      [
        { id: "range-1", type: "range", from: "2026-07-27", to: "2026-07-31" },
        { id: "single-1", type: "single", date: "2026-07-31" },
      ],
      400,
      { preserveDuplicates: true },
    );

    expect(result.errors).toEqual([]);
    expect(result.dates).toEqual([
      "2026-07-27",
      "2026-07-28",
      "2026-07-29",
      "2026-07-30",
      "2026-07-31",
      "2026-07-31",
    ]);
  });

  it("handles month and year boundaries without timezone conversion", () => {
    const result = expandBulkDateSelections([
      { id: "year", type: "range", from: "2026-12-30", to: "2027-01-02" },
    ]);

    expect(result.dates).toEqual([
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ]);
  });

  it("reports invalid ranges and limits very large batches", () => {
    const invalid = expandBulkDateSelections([
      { id: "bad", type: "range", from: "2026-02-31", to: "2026-03-01" },
      { id: "reverse", type: "range", from: "2026-03-03", to: "2026-03-01" },
    ]);
    expect(invalid.errors).toHaveLength(2);

    const tooLarge = expandBulkDateSelections(
      [{ id: "large", type: "range", from: "2026-01-01", to: "2026-01-10" }],
      3,
    );
    expect(tooLarge.errors).toEqual(["Select 3 days or fewer."]);
  });
});
