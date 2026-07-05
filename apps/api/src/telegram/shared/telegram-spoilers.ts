export type TelegramSpoilerEntity = {
  type: 'spoiler';
  offset: number;
  length: number;
};

export type ParsedTelegramText = {
  text: string;
  entities: TelegramSpoilerEntity[];
};

export function parseTelegramSpoilers(input: string): ParsedTelegramText {
  let cursor = 0;
  let text = '';
  const entities: TelegramSpoilerEntity[] = [];

  while (cursor < input.length) {
    const opening = input.indexOf('||', cursor);
    if (opening < 0) {
      text += input.slice(cursor);
      break;
    }
    const closing = input.indexOf('||', opening + 2);
    if (closing < 0) {
      text += input.slice(cursor);
      break;
    }

    text += input.slice(cursor, opening);
    const hidden = input.slice(opening + 2, closing);
    if (!hidden.length) {
      // Empty pairs stay literal and never become zero-length Telegram entities.
      text += '||||';
    } else {
      const offset = text.length;
      text += hidden;
      entities.push({ type: 'spoiler', offset, length: hidden.length });
    }
    cursor = closing + 2;
  }

  return { text, entities };
}
