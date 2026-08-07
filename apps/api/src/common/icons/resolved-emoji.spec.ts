import { iconToResolvedEmoji } from './resolved-emoji';

describe('iconToResolvedEmoji', () => {
  it('resolves emoji icons to unicode presentation', () => {
    expect(
      iconToResolvedEmoji({
        id: 'icon-1',
        type: 'emoji',
        name: 'rocket',
        emoji: '🚀',
        imageUrl: null,
      }),
    ).toEqual({ type: 'unicode', value: '🚀', name: 'rocket' });
  });

  it('resolves image icons to image presentation', () => {
    expect(
      iconToResolvedEmoji({
        id: 'icon-2',
        type: 'image',
        name: 'logo',
        emoji: null,
        imageUrl: 'https://example.com/logo.png',
      }),
    ).toEqual({
      type: 'image',
      id: 'icon-2',
      url: 'https://example.com/logo.png',
      name: 'logo',
    });
  });

  it('returns null for incomplete icons', () => {
    expect(
      iconToResolvedEmoji({
        id: 'icon-3',
        type: 'image',
        name: 'broken',
        imageUrl: null,
      }),
    ).toBeNull();
  });
});
