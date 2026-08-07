export type ResolvedEmoji =
  | {
      type: 'unicode';
      value: string;
      name?: string | null;
    }
  | {
      type: 'image';
      id: string;
      url: string;
      name?: string | null;
    };
