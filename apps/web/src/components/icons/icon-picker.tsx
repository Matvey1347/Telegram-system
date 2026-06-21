'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock3, Dumbbell, Flag, Grid2x2, ImagePlus, Leaf, Package, Plane, Plus, Search, Shapes, Smile, Upload, Utensils } from 'lucide-react';
import { iconsApi } from '@/lib/api';
import { emojiCategoryLabels, emojiIcons, type EmojiCategory, type EmojiIcon } from '@/lib/emoji-icons';
import { Button, Input } from '@/components/ui/primitives';
import { IconAvatar } from './icon-avatar';

type IconPickerProps = {
  iconId?: string | null;
  onChange: (iconId: string | null) => void;
  buttonLabel?: string;
  className?: string;
  compact?: boolean;
  bare?: boolean;
};

type UploadState = {
  imageUrl: string;
  fileName: string;
};

type RecentStandardIcon = {
  kind: 'standard';
  name: string;
  emoji: string;
  category: EmojiCategory;
  keywords: string[];
};

type RecentSavedIcon = {
  kind: 'saved';
  icon: {
    id: string;
    type: 'emoji' | 'image';
    name: string;
    emoji?: string | null;
    imageUrl?: string | null;
  };
};

type RecentIcon = RecentStandardIcon | RecentSavedIcon;

const tabOrder = ['icons', 'upload'] as const;
type Tab = (typeof tabOrder)[number];

type IconSection = 'recent' | EmojiCategory | 'custom';

const sectionTabs = [
  { section: 'recent', icon: Clock3, label: 'Recent' },
  { section: 'people', icon: Smile, label: 'People' },
  { section: 'nature', icon: Leaf, label: 'Nature' },
  { section: 'food', icon: Utensils, label: 'Food' },
  { section: 'activity', icon: Dumbbell, label: 'Activity' },
  { section: 'travel', icon: Plane, label: 'Travel' },
  { section: 'objects', icon: Package, label: 'Objects' },
  { section: 'symbols', icon: Shapes, label: 'Symbols' },
  { section: 'flags', icon: Flag, label: 'Flags' },
  { section: 'custom', icon: Grid2x2, label: 'Custom' },
] as const;

function stripExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '');
}

const RECENT_KEY = 'telegram-system-recent-icons';
const RECENT_LIMIT = 12;

function loadRecentIcons(): RecentIcon[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentIcon[];
    return Array.isArray(parsed) ? parsed.slice(0, RECENT_LIMIT) : [];
  } catch {
    return [];
  }
}

function isStandardRecent(icon: RecentIcon): icon is RecentStandardIcon {
  return icon.kind === 'standard';
}

function matchesSearch(icon: EmojiIcon, search: string) {
  if (!search) return true;
  const haystack = `${icon.name} ${icon.keywords.join(' ')} ${emojiCategoryLabels[icon.category]}`.toLowerCase();
  return haystack.includes(search);
}

function matchesRecentStandard(item: RecentStandardIcon, search: string) {
  if (!search) return true;
  const haystack = `${item.name} ${item.keywords.join(' ')} ${emojiCategoryLabels[item.category]}`.toLowerCase();
  return haystack.includes(search);
}

function matchesRecentSaved(item: RecentSavedIcon, search: string) {
  if (!search) return true;
  return item.icon.name.toLowerCase().includes(search);
}

export function IconPicker({ iconId, onChange, buttonLabel = 'Add icon', className = '', compact = false, bare = false }: IconPickerProps) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('icons');
  const [search, setSearch] = useState('');
  const [upload, setUpload] = useState<UploadState | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [recentIcons, setRecentIcons] = useState<RecentIcon[]>(() => loadRecentIcons());
  const [activeSection, setActiveSection] = useState<IconSection>('recent');
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Partial<Record<IconSection, HTMLDivElement | null>>>({});

  const { data: selectedIcon } = useQuery({
    queryKey: ['icon', iconId],
    queryFn: () => iconsApi.get(iconId as string),
    enabled: Boolean(iconId),
  });

  const iconsQuery = useQuery({
    queryKey: ['icons', search],
    queryFn: () => iconsApi.list(search || undefined),
    enabled: open && tab === 'icons',
  });

  const customIcons = useMemo(
    () => (iconsQuery.data ?? []).filter((icon) => icon.type === 'image'),
    [iconsQuery.data],
  );

  const createEmojiMutation = useMutation({
    mutationFn: async (payload: EmojiIcon) => ({
      icon: await iconsApi.createEmoji({ name: payload.name, emoji: payload.emoji }),
      payload,
    }),
    onSuccess: ({ icon, payload }) => {
      const recentItem: RecentStandardIcon = {
        kind: 'standard',
        name: payload.name,
        emoji: payload.emoji,
        category: payload.category,
        keywords: payload.keywords,
      };
      setRecentIcons((prev) => [recentItem, ...prev.filter((item) => !(item.kind === 'standard' && item.emoji === payload.emoji))].slice(0, RECENT_LIMIT));
      onChange(icon.id);
      setOpen(false);
      setSearch('');
      qc.invalidateQueries({ queryKey: ['icons'] });
    },
  });

  const createCustomMutation = useMutation({
    mutationFn: iconsApi.createCustom,
    onSuccess: (icon) => {
      const recentItem: RecentSavedIcon = {
        kind: 'saved',
        icon: { id: icon.id, type: icon.type, name: icon.name, emoji: icon.emoji, imageUrl: icon.imageUrl },
      };
      setRecentIcons((prev) => [recentItem, ...prev.filter((item) => !(item.kind === 'saved' && item.icon.id === icon.id))].slice(0, RECENT_LIMIT));
      onChange(icon.id);
      setOpen(false);
      setUpload(null);
      setUploadName('');
      setSearch('');
      qc.invalidateQueries({ queryKey: ['icons'] });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: iconsApi.upload,
    onSuccess: (result, file) => {
      setUpload({ imageUrl: result.imageUrl, fileName: stripExtension(file.name || 'icon') });
      setUploadName(stripExtension(file.name || 'icon'));
      setTab('upload');
    },
  });

  const filteredStandardIcons = useMemo(() => {
    const value = search.trim().toLowerCase();
    return emojiIcons.filter((item) => matchesSearch(item, value));
  }, [search]);

  const normalizedSearch = search.trim().toLowerCase();
  const isSearching = normalizedSearch.length > 0;

  const emojiByCategory = useMemo(() => {
    const value = search.trim().toLowerCase();
    const grouped: Record<EmojiCategory, EmojiIcon[]> = {
      people: [],
      nature: [],
      food: [],
      activity: [],
      travel: [],
      objects: [],
      symbols: [],
      flags: [],
    };
    for (const icon of emojiIcons) {
      if (!matchesSearch(icon, value)) continue;
      grouped[icon.category].push(icon);
    }
    return grouped;
  }, [search]);

  const currentIcon = selectedIcon ?? null;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(RECENT_KEY, JSON.stringify(recentIcons.slice(0, RECENT_LIMIT)));
  }, [recentIcons]);

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const triggerRect = triggerRef.current?.getBoundingClientRect();
      if (!triggerRect) return;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = 360;
      const height = 360;
      const gap = 8;
      const left = Math.min(Math.max(16, triggerRect.left), Math.max(16, viewportWidth - width - 16));
      const spaceBelow = viewportHeight - triggerRect.bottom;
      const spaceAbove = triggerRect.top;
      const openUp = spaceBelow < height && spaceAbove > spaceBelow;
      const top = openUp
        ? Math.max(16, triggerRect.top - height - gap)
        : Math.min(viewportHeight - height - 16, triggerRect.bottom + gap);
      setPanelStyle({
        position: 'fixed',
        top,
        left,
        width,
        maxHeight: height,
      });
    };
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  const handleFile = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    uploadMutation.mutate(file);
  };

  useEffect(() => {
    if (!open || tab !== 'upload') return;

    const onPaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((item) => item.type.startsWith('image/'));
      if (file) {
        event.preventDefault();
        handleFile(file);
      }
    };

    window.addEventListener('paste', onPaste as any);
    return () => window.removeEventListener('paste', onPaste as any);
  }, [open, tab]);

  const uploadDisabled = uploadMutation.isPending || createCustomMutation.isPending;

  const standardRecent = useMemo(
    () => recentIcons.filter(isStandardRecent).filter((item) => matchesRecentStandard(item, normalizedSearch)),
    [normalizedSearch, recentIcons],
  );
  const savedRecent = useMemo(
    () => recentIcons.filter((icon): icon is RecentSavedIcon => icon.kind === 'saved').filter((item) => matchesRecentSaved(item, normalizedSearch)),
    [normalizedSearch, recentIcons],
  );
  const hasRecentItems = standardRecent.length > 0 || savedRecent.length > 0;
  const totalSearchResults = filteredStandardIcons.length + customIcons.length;

  const selectRecentStandard = (item: RecentStandardIcon) => {
    createEmojiMutation.mutate(item);
  };

  const selectRecentSaved = (item: RecentSavedIcon) => {
    onChange(item.icon.id);
    setRecentIcons((prev) => [
      item,
      ...prev.filter((current) => !(current.kind === 'saved' && current.icon.id === item.icon.id)),
    ].slice(0, RECENT_LIMIT));
    setOpen(false);
  };

  const scrollToSection = (section: IconSection) => {
    setActiveSection(section);
    sectionRefs.current[section]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    if (!open || tab !== 'icons') return;

    const root = scrollAreaRef.current;
    if (!root) return;

    const updateActiveSection = () => {
      const entries = (Object.entries(sectionRefs.current) as Array<[IconSection, HTMLDivElement | null]>)
        .filter(([, node]) => Boolean(node))
        .map(([section, node]) => ({
          section,
          top: Math.abs((node?.offsetTop ?? 0) - root.scrollTop - 12),
        }))
        .sort((a, b) => a.top - b.top);

      if (entries[0]) setActiveSection(entries[0].section);
    };

    updateActiveSection();
    root.addEventListener('scroll', updateActiveSection, { passive: true });
    return () => root.removeEventListener('scroll', updateActiveSection);
  }, [open, tab, standardRecent.length, savedRecent.length, filteredStandardIcons.length, customIcons.length]);

  const closePicker = () => {
    setOpen(false);
    setTab('icons');
    setSearch('');
    setUpload(null);
    setUploadName('');
    setActiveSection('recent');
  };

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        onClick={() => setOpen(true)}
        className={bare
          ? `inline-flex items-center justify-center text-neutral-100 hover:opacity-80 ${className}`
          : compact
            ? `flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900 text-neutral-100 hover:bg-neutral-800 ${className}`
            : `flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 hover:bg-neutral-800 ${className}`}
      >
        {currentIcon ? <IconAvatar icon={currentIcon} label={currentIcon.name} size={compact ? 'sm' : 'xs'} bordered={!(compact || bare)} className={bare ? '!h-5 !w-5 !bg-transparent !border-0 !rounded-none !text-base' : ''} /> : <Plus size={bare ? 14 : 16} />}
        {!compact && !bare ? <span>{currentIcon ? 'Change icon' : buttonLabel}</span> : null}
      </button>

      {open && typeof document !== 'undefined' ? createPortal(
        <div
          ref={panelRef}
          style={panelStyle}
          className="z-50 flex overflow-hidden rounded-2xl border border-neutral-700 bg-neutral-900 shadow-2xl"
        >
          <div className="flex min-h-0 flex-1 flex-col px-3 py-3">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-1 rounded-lg border border-neutral-800 bg-neutral-950 p-1">
                  {tabOrder.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setTab(item)}
                      className={`rounded-md px-2.5 py-1 text-sm capitalize ${tab === item ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'}`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onChange(null);
                    closePicker();
                  }}
                  className="mr-1 text-sm text-neutral-400 hover:text-white"
                >
                  Remove
                </button>
              </div>

              <div className="mb-1.5 flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={tab === 'upload' ? 'Enter a name for the new icon' : 'Search icon by name'}
                    className="pl-9 py-2"
                  />
                </div>
                {tab === 'upload' ? (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleFile(e.target.files?.[0])}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <span className="flex items-center gap-2"><Upload size={14} />Upload</span>
                    </Button>
                  </>
                ) : null}
              </div>
            </div>

            {tab === 'icons' ? (
              <>
                <div ref={scrollAreaRef} className="min-h-0 flex-1 overflow-y-auto rounded-xl bg-neutral-950 px-4 py-2 [scrollbar-gutter:stable] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {isSearching ? (
                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <p className="text-sm font-medium text-neutral-300">Results</p>
                        <p className="text-xs text-neutral-500">{totalSearchResults} items</p>
                      </div>
                      {iconsQuery.isLoading ? <p className="text-sm text-neutral-400">Loading icons...</p> : null}
                      {totalSearchResults ? (
                        <div className="grid grid-cols-8 justify-items-center gap-1 sm:grid-cols-10">
                          {filteredStandardIcons.map((item) => (
                            <button
                              key={`${item.category}-${item.name}-${item.emoji}`}
                              type="button"
                              className="group flex h-10 w-10 items-center justify-center rounded-xl border border-transparent text-[20px] leading-none hover:border-neutral-700 hover:bg-neutral-900"
                              title={item.name}
                              onClick={() => createEmojiMutation.mutate(item)}
                            >
                              {item.emoji}
                            </button>
                          ))}
                          {customIcons.map((icon) => (
                            <button
                              key={icon.id}
                              type="button"
                              className="group flex h-10 w-10 items-center justify-center rounded-xl border border-transparent hover:border-neutral-700 hover:bg-neutral-900"
                              title={icon.name}
                              onClick={() => {
                                const recentItem: RecentSavedIcon = {
                                  kind: 'saved',
                                  icon: { id: icon.id, type: icon.type, name: icon.name, emoji: icon.emoji, imageUrl: icon.imageUrl },
                                };
                                setRecentIcons((prev) => [recentItem, ...prev.filter((current) => !(current.kind === 'saved' && current.icon.id === icon.id))].slice(0, RECENT_LIMIT));
                                onChange(icon.id);
                                setOpen(false);
                              }}
                            >
                              <IconAvatar icon={icon} label={icon.name} size="xs" bordered={false} className="!h-[20px] !w-[20px] !rounded-none !bg-transparent !border-0" />
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-neutral-400">No icons found.</p>
                      )}
                    </div>
                  ) : (
                    <>
                      {hasRecentItems ? (
                        <div ref={(node) => { sectionRefs.current.recent = node; }} className="scroll-mt-3">
                          <div className="mb-1.5 flex items-center justify-between">
                            <p className="text-sm font-medium text-neutral-300">Recent</p>
                            <p className="text-xs text-neutral-500">{standardRecent.length + savedRecent.length} items</p>
                          </div>
                          <div className="grid grid-cols-8 justify-items-center gap-1 sm:grid-cols-10">
                            {standardRecent.map((item) => (
                              <button
                                key={`recent-${item.kind}-${item.emoji}`}
                                type="button"
                                className="group flex h-10 w-10 items-center justify-center rounded-xl border border-transparent text-[20px] leading-none hover:border-neutral-700 hover:bg-neutral-900"
                                title={item.name}
                                onClick={() => selectRecentStandard(item)}
                              >
                                {item.emoji}
                              </button>
                            ))}
                            {savedRecent.map((item) => (
                              <button
                                key={`recent-${item.kind}-${item.icon.id}`}
                                type="button"
                                className="group flex h-10 w-10 items-center justify-center rounded-xl border border-transparent hover:border-neutral-700 hover:bg-neutral-900"
                                title={item.icon.name}
                                onClick={() => selectRecentSaved(item)}
                              >
                                <IconAvatar icon={item.icon} label={item.icon.name} size="xs" bordered={false} className="!h-[20px] !w-[20px] !rounded-none !bg-transparent !border-0" />
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      <div className={hasRecentItems ? 'mt-3' : ''}>
                        <div className="mb-1.5 flex items-center justify-between">
                          <p className="text-sm font-medium text-neutral-300">Standard</p>
                          <p className="text-xs text-neutral-500">{filteredStandardIcons.length} results</p>
                        </div>
                        {filteredStandardIcons.length ? (
                          Object.entries(emojiCategoryLabels).map(([category, label]) => {
                            const items = emojiByCategory[category as EmojiCategory];
                            if (!items.length) return null;
                            return (
                              <div
                                key={category}
                                ref={(node) => {
                                  sectionRefs.current[category as IconSection] = node;
                                }}
                                className={`scroll-mt-3 ${standardRecent.length ? 'pt-2' : ''}`}
                              >
                                <div className="mb-1 flex items-center justify-between">
                                  <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
                                  <p className="text-xs text-neutral-500">{items.length}</p>
                                </div>
                                <div className="mt-2 grid grid-cols-8 justify-items-center gap-1 sm:grid-cols-10">
                                  {items.map((item) => (
                                    <button
                                      key={`${item.category}-${item.name}-${item.emoji}`}
                                      type="button"
                                      className="group flex h-10 w-10 items-center justify-center rounded-xl border border-transparent text-[20px] leading-none hover:border-neutral-700 hover:bg-neutral-900"
                                      title={item.name}
                                      onClick={() => createEmojiMutation.mutate(item)}
                                    >
                                      {item.emoji}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <p className="mt-3 text-sm text-neutral-400">No standard icons found.</p>
                        )}
                      </div>

                      <div ref={(node) => { sectionRefs.current.custom = node; }} className="mt-3 scroll-mt-3 border-t border-neutral-800/70 pt-2.5">
                        <div className="mb-1.5 flex items-center justify-between">
                          <p className="text-sm font-medium text-neutral-300">Custom</p>
                          <p className="text-xs text-neutral-500">{customIcons.length} results</p>
                        </div>
                        {iconsQuery.isLoading ? <p className="text-sm text-neutral-400">Loading custom icons...</p> : null}
                        <div className="grid grid-cols-8 justify-items-center gap-1 sm:grid-cols-10">
                          {customIcons.map((icon) => (
                            <button
                              key={icon.id}
                              type="button"
                              className="group flex h-10 w-10 items-center justify-center rounded-xl border border-transparent hover:border-neutral-700 hover:bg-neutral-900"
                              title={icon.name}
                              onClick={() => {
                                const recentItem: RecentSavedIcon = {
                                  kind: 'saved',
                                  icon: { id: icon.id, type: icon.type, name: icon.name, emoji: icon.emoji, imageUrl: icon.imageUrl },
                                };
                                setRecentIcons((prev) => [recentItem, ...prev.filter((current) => !(current.kind === 'saved' && current.icon.id === icon.id))].slice(0, RECENT_LIMIT));
                                onChange(icon.id);
                                setOpen(false);
                              }}
                            >
                              <IconAvatar icon={icon} label={icon.name} size="xs" bordered={false} className="!h-[20px] !w-[20px] !rounded-none !bg-transparent !border-0" />
                            </button>
                          ))}
                        </div>
                        {!iconsQuery.isLoading && !customIcons.length ? (
                          <p className="mt-3 text-sm text-neutral-400">No custom icons yet.</p>
                        ) : null}
                      </div>
                    </>
                  )}
                </div>

                {!isSearching ? (
                <div className="mt-2 shrink-0 bg-neutral-900/95 py-1 backdrop-blur">
                    <div className="flex items-center gap-1.5 overflow-x-auto overflow-y-hidden whitespace-nowrap">
                      {sectionTabs.map(({ section, icon: Icon, label }) => {
                        const disabled =
                          section === 'recent'
                            ? !hasRecentItems
                            : section === 'custom'
                              ? !customIcons.length
                              : false;
                        return (
                          <button
                            key={section}
                            type="button"
                            disabled={disabled}
                            title={label}
                            aria-label={label}
                            onClick={() => scrollToSection(section)}
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition ${
                              activeSection === section
                                ? 'border-blue-500 bg-blue-500/15 text-blue-200'
                                : 'border-neutral-800 bg-neutral-900 text-neutral-400 hover:border-neutral-700 hover:text-white'
                            } disabled:cursor-not-allowed disabled:opacity-40`}
                          >
                            <Icon size={14} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            {tab === 'upload' ? (
              <div
                className="min-h-0 flex-1 rounded-xl border border-dashed border-neutral-700 bg-neutral-950 p-3"
                onDragOver={(event) => {
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  handleFile(event.dataTransfer.files?.[0]);
                }}
              >
                {!upload ? (
                  <button
                    type="button"
                    className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-8 text-neutral-300 hover:bg-neutral-800"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImagePlus size={20} />
                    <span>Upload an image</span>
                    <span className="text-xs text-neutral-500">Paste or drag and drop works too</span>
                  </button>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
                      <p className="mb-3 text-sm text-neutral-400">Preview</p>
                      <div className="flex items-center gap-4">
                        <img src={upload.imageUrl} alt="" className="h-20 w-20 rounded-xl border border-neutral-700 object-cover" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-neutral-300">Ready to save as reusable icon</p>
                          <p className="truncate text-xs text-neutral-500">{upload.fileName}</p>
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm text-neutral-300">Icon name</label>
                      <Input value={uploadName} onChange={(e) => setUploadName(e.target.value)} placeholder="e.g. office logo" />
                    </div>
                    <div className="flex justify-between gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setUpload(null)}
                      >
                        Back
                      </Button>
                      <Button
                        type="button"
                        disabled={uploadDisabled || !uploadName.trim()}
                        onClick={() => {
                          if (!upload) return;
                          createCustomMutation.mutate({
                            name: uploadName.trim(),
                            imageUrl: upload.imageUrl,
                          });
                        }}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
