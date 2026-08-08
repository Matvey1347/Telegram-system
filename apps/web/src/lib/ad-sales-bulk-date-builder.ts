export type BulkDateSelection =
  | { id: string; type: "single"; date: string }
  | { id: string; type: "range"; from: string; to: string };

export type BulkDateValidationResult = {
  dates: string[];
  errors: string[];
};

export type BulkDateExpansionOptions = {
  preserveDuplicates?: boolean;
};

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDateKey(dateKey: string) {
  if (!DATE_KEY_PATTERN.test(dateKey)) return null;
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function formatDateKey(date: Date) {
  const year = date.getUTCFullYear().toString().padStart(4, "0");
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = date.getUTCDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function expandBulkDateSelections(
  selections: BulkDateSelection[],
  maxDays = 400,
  options: BulkDateExpansionOptions = {},
): BulkDateValidationResult {
  const dates: string[] = [];
  const uniqueDates = new Set<string>();
  const errors: string[] = [];
  const addDate = (dateKey: string) => {
    if (options.preserveDuplicates) {
      dates.push(dateKey);
      return dates.length;
    }
    uniqueDates.add(dateKey);
    return uniqueDates.size;
  };
  const toSortedDates = () => {
    const expandedDates = options.preserveDuplicates ? dates : [...uniqueDates];
    return expandedDates.sort();
  };
  for (const selection of selections) {
    if (selection.type === "single") {
      const parsed = parseDateKey(selection.date);
      if (!parsed) {
        errors.push("Single date is invalid.");
        continue;
      }
      if (addDate(formatDateKey(parsed)) > maxDays) {
        errors.push(`Select ${maxDays} days or fewer.`);
        return { dates: toSortedDates(), errors };
      }
      continue;
    }

    const from = parseDateKey(selection.from);
    const to = parseDateKey(selection.to);
    if (!from || !to) {
      errors.push("Date range is invalid.");
      continue;
    }
    if (from.getTime() > to.getTime()) {
      errors.push("Date range start must be before the end.");
      continue;
    }
    const cursor = new Date(from);
    while (cursor.getTime() <= to.getTime()) {
      if (addDate(formatDateKey(cursor)) > maxDays) {
        errors.push(`Select ${maxDays} days or fewer.`);
        return { dates: toSortedDates(), errors };
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
  return { dates: toSortedDates(), errors };
}
