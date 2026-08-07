export type ManagedPostImportInputRow = {
  title?: string;
  emoji?: string | null;
  text?: string | null;
  urls?: string[];
  order?: number;
};

export type NormalizedManagedPostImportRow = {
  sourceIndex: number;
  title: string;
  icon: string | null;
  text: string | null;
  imageUrls: string[];
  order: number;
};

export type ManagedPostImportSkippedRow = {
  index: number;
  title?: string;
  error: string;
};

function clean(value: string | null | undefined) {
  const trimmed = String(value ?? '').trim();
  return trimmed || null;
}

function normalizeImageUrls(row: ManagedPostImportInputRow) {
  const urls = (Array.isArray(row.urls) ? row.urls : [])
    .flatMap((value) => String(value || '').split(/[,\n]/))
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set(urls)];
}

function isSupportedImageUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function normalizeManagedPostImportRows(
  rows: ManagedPostImportInputRow[],
): {
  validRows: NormalizedManagedPostImportRow[];
  skippedRows: ManagedPostImportSkippedRow[];
} {
  const validRows: NormalizedManagedPostImportRow[] = [];
  const skippedRows: ManagedPostImportSkippedRow[] = [];

  rows.forEach((row, index) => {
    const sourceIndex = index + 1;
    const title = clean(row.title);
    if (!title) {
      skippedRows.push({ index: sourceIndex, error: 'Title is required.' });
      return;
    }
    const text = clean(row.text);
    if (!text) {
      skippedRows.push({
        index: sourceIndex,
        title,
        error: 'Text is required.',
      });
      return;
    }
    const imageUrls = normalizeImageUrls(row);
    const invalidImageUrl = imageUrls.find((url) => !isSupportedImageUrl(url));
    if (invalidImageUrl) {
      skippedRows.push({
        index: sourceIndex,
        title,
        error: `Image URL must start with http:// or https://: ${invalidImageUrl}`,
      });
      return;
    }
    const order = Number(row.order);
    validRows.push({
      sourceIndex,
      title,
      icon: clean(row.emoji),
      text,
      imageUrls,
      order: Number.isFinite(order) ? order : sourceIndex,
    });
  });

  validRows.sort((a, b) => a.order - b.order || a.sourceIndex - b.sourceIndex);
  return { validRows, skippedRows };
}
