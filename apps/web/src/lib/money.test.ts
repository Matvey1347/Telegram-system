import { describe, expect, it } from "vitest";
import { formatMoneyPreview, getMoneyPreview } from "./money";

const rates = [
  { id: "1", baseCurrency: "USD", targetCurrency: "EUR", rate: 0.5, date: "2026-08-08" },
  { id: "2", baseCurrency: "USD", targetCurrency: "UAH", rate: 40, date: "2026-08-08" },
  { id: "3", baseCurrency: "USD", targetCurrency: "PLN", rate: 3.639732, date: "2026-08-08" },
];

describe("money preview", () => {
  it("renders primary and secondary first, then tertiary currency on the next line", () => {
    const settings = {
      primaryCurrency: "USD",
      secondaryCurrency: "EUR",
      tertiaryCurrency: "UAH",
      currencyDisplayMode: "code" as const,
    };

    expect(formatMoneyPreview({ amount: 100, currency: "USD", settings, rates })).toBe(
      "100.00 USD / 50.00 EUR\n4,000.00 UAH",
    );
  });

  it("keeps preview currencies unique when UAH is already secondary", () => {
    const settings = {
      primaryCurrency: "USD",
      secondaryCurrency: "UAH",
      tertiaryCurrency: "UAH",
      currencyDisplayMode: "code" as const,
    };

    expect(getMoneyPreview({ amount: 100, currency: "USD", settings, rates })).toHaveLength(2);
  });

  it("converts secondary currency through a shared base rate", () => {
    const settings = {
      primaryCurrency: "USD",
      secondaryCurrency: "PLN",
      tertiaryCurrency: "UAH",
      currencyDisplayMode: "symbol" as const,
    };

    expect(formatMoneyPreview({ amount: 4000, currency: "UAH", settings, rates })).toBe(
      "$ 100.00 / zł 363.97\n₴ 4,000.00",
    );
  });
});
