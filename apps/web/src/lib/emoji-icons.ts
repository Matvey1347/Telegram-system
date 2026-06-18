import data from '@emoji-mart/data';

export type EmojiCategory = 'people' | 'nature' | 'food' | 'activity' | 'travel' | 'objects' | 'symbols' | 'flags';

export type EmojiIcon = {
  name: string;
  emoji: string;
  keywords: string[];
  category: EmojiCategory;
};

export const emojiCategoryLabels: Record<EmojiCategory, string> = {
  people: 'People',
  nature: 'Nature',
  food: 'Food',
  activity: 'Activity',
  travel: 'Travel',
  objects: 'Objects',
  symbols: 'Symbols',
  flags: 'Flags',
};

const categoryMap: Record<string, EmojiCategory> = {
  people: 'people',
  nature: 'nature',
  foods: 'food',
  activity: 'activity',
  places: 'travel',
  objects: 'objects',
  symbols: 'symbols',
  flags: 'flags',
};

type EmojiMartSkin = {
  native?: string;
};

type EmojiMartEmoji = {
  id?: string;
  name?: string;
  keywords?: unknown;
  skins?: EmojiMartSkin[];
};

type EmojiMartCategory = {
  id: string;
  emojis: string[];
};

type EmojiMartData = {
  categories: EmojiMartCategory[];
  emojis: Record<string, EmojiMartEmoji>;
};

function toKeywords(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item).toLowerCase()) : [];
}

function normalizeName(value: string) {
  return value.replace(/_/g, ' ').toLowerCase();
}

const emojiMartData = data as EmojiMartData;

export const emojiIcons: EmojiIcon[] = emojiMartData.categories.flatMap((categoryEntry) => {
  const category = categoryMap[categoryEntry.id];
  if (!category) return [];
  return categoryEntry.emojis.flatMap((emojiId) => {
    const emoji = emojiMartData.emojis[emojiId];
    const native = emoji?.skins?.[0]?.native;
    if (!native) return [];
    const name = normalizeName(String(emoji?.name ?? emoji?.id ?? emojiId));
    const keywords = Array.from(
      new Set([
        ...toKeywords(emoji?.keywords),
        normalizeName(String(emoji?.id ?? emojiId)),
        name,
      ].filter(Boolean)),
    );
    return [{ name, emoji: native, keywords, category }];
  });
}).sort((left, right) => {
  if (left.category !== right.category) return left.category.localeCompare(right.category);
  return left.name.localeCompare(right.name);
});
