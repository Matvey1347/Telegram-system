import {
  extractInternalPostLinkIds,
  replaceInternalPostLinks,
} from './internal-post-links';

describe('internal post links', () => {
  it('extracts unique managed post ids', () => {
    expect(
      extractInternalPostLinkIds(
        '[First](tg-post:post_1) [Second](tg-post:post-2) [Again](tg-post:post_1)',
      ),
    ).toEqual(['post_1', 'post-2']);
  });

  it('replaces internal links while preserving labels and external links', () => {
    expect(
      replaceInternalPostLinks(
        '[First](tg-post:post_1) [Site](https://example.com)',
        new Map([['post_1', 'https://t.me/example/10']]),
      ),
    ).toBe('[First](https://t.me/example/10) [Site](https://example.com)');
  });

  it('leaves unresolved internal links unchanged', () => {
    expect(
      replaceInternalPostLinks(
        '[First](tg-post:post_1)',
        new Map<string, string>(),
      ),
    ).toBe('[First](tg-post:post_1)');
  });
});
