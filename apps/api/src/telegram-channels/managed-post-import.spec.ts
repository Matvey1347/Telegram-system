import { normalizeManagedPostImportRows } from './managed-post-import';

describe('normalizeManagedPostImportRows', () => {
  it('normalizes valid rows and keeps import order', () => {
    const result = normalizeManagedPostImportRows([
      { title: 'Second', emoji: '2', text: 'Body 2', order: 2 },
      {
        title: 'First',
        emoji: '🔥',
        text: 'Body 1',
        urls: ['https://example.com/a.png'],
        order: 1,
      },
    ]);

    expect(result.skippedRows).toEqual([]);
    expect(result.validRows).toMatchObject([
      {
        sourceIndex: 2,
        title: 'First',
        icon: '🔥',
        imageUrls: ['https://example.com/a.png'],
      },
      { sourceIndex: 1, title: 'Second', icon: '2', imageUrls: [] },
    ]);
  });

  it('skips rows without required text or with invalid image urls', () => {
    const result = normalizeManagedPostImportRows([
      { title: '', text: 'Body' },
      { title: 'No body', text: '' },
      { title: 'Bad image', text: 'Body', urls: ['ftp://example.com/a.png'] },
      { title: 'Good', text: 'Body' },
    ]);

    expect(result.validRows).toHaveLength(1);
    expect(result.skippedRows).toEqual([
      { index: 1, error: 'Title is required.' },
      { index: 2, title: 'No body', error: 'Text is required.' },
      {
        index: 3,
        title: 'Bad image',
        error: 'Image URL must start with http:// or https://: ftp://example.com/a.png',
      },
    ]);
  });
});
