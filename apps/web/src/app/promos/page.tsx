'use client';

import { ChangeEvent, ClipboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { AppShell } from '@/components/layout/app-shell';
import { promosApi, telegramChannelsApi } from '@/lib/api';
import { Button, Card, ConfirmDeleteModal, CustomSelect, EmptyState, EntityCard, FormField, IconButton, Input, LoadingState, Modal, PageHeader, Textarea } from '@/components/ui/primitives';

export default function PromosPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<any | null>(null);
  const [channelFilter, setChannelFilter] = useState('');
  const { data: channels } = useQuery({ queryKey: ['telegram-channels'], queryFn: telegramChannelsApi.list });
  const ownChannels = useMemo(() => (channels ?? []).filter(isOwnTelegramChannel), [channels]);
  const channelOptions = useMemo(
    () => ownChannels.map((channel: any) => ({ value: channel.id, label: channel.title, iconUrl: channel.photoUrl, iconFallback: channel.title })),
    [ownChannels],
  );
  const { data, isLoading, error } = useQuery({
    queryKey: ['promos', channelFilter],
    queryFn: () => promosApi.list(channelFilter ? { telegramChannelId: channelFilter } : undefined),
  });
  const createMutation = useMutation({ mutationFn: promosApi.create, onSuccess: () => { qc.invalidateQueries({ queryKey: ['promos'] }); setCreateOpen(false); } });
  const updateMutation = useMutation({ mutationFn: ({ id, payload }: any) => promosApi.update(id, payload), onSuccess: () => { qc.invalidateQueries({ queryKey: ['promos'] }); setEditing(null); } });
  const deleteMutation = useMutation({ mutationFn: (id: string) => promosApi.remove(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['promos'] }); setDeleting(null); } });

  return <AppShell><PageHeader title="Promos" subtitle="Create and manage promo texts" action={<Button onClick={() => setCreateOpen(true)}>Create</Button>} />
    {ownChannels.length > 1 ? <Card className="mb-4"><FormField label="Channel">
      <CustomSelect
        value={channelFilter}
        onChange={setChannelFilter}
        placeholder="All channels"
        options={[
          { value: '', label: 'All channels', iconFallback: 'All channels' },
          ...channelOptions,
        ]}
      />
    </FormField></Card> : null}
    {isLoading ? <LoadingState /> : null}{error ? <div className="text-red-300">Failed to load promos</div> : null}
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{data?.map((p: any) => <EntityCard key={p.id} title={p.title} actions={<div className="flex gap-2"><IconButton onClick={() => setEditing(p)} /><IconButton kind="delete" onClick={() => setDeleting(p)} /></div>}>
      {p.telegramChannel ? <div className="mb-2 inline-flex items-center gap-2 text-sm text-neutral-300">{p.telegramChannel.photoUrl ? <img src={p.telegramChannel.photoUrl} alt="" className="h-5 w-5 rounded-full" /> : <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-neutral-700 text-[10px]">{String(p.telegramChannel.title || '?').slice(0, 1).toUpperCase()}</span>}<span>{p.telegramChannel.title}</span></div> : null}
      {p.imageData ? <div className="mb-2 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900"><Image src={p.imageData} alt={p.title} width={640} height={260} className="w-full object-contain" unoptimized /></div> : null}
      {String(p.text || '').trim() ? <p>Notes: {String(p.text).slice(0, 110)}</p> : null}
    </EntityCard>)}</div>
    {!isLoading && !data?.length ? <EmptyState text="No promos" /> : null}
    <PromoModal open={createOpen} title="Create Promo" onClose={() => setCreateOpen(false)} onSubmit={(v: any) => createMutation.mutate(v)} channels={ownChannels} channelOptions={channelOptions} />
    <PromoModal open={!!editing} title="Edit Promo" initial={editing ?? undefined} onClose={() => setEditing(null)} onSubmit={(v: any) => editing && updateMutation.mutate({ id: editing.id, payload: v })} channels={ownChannels} channelOptions={channelOptions} />
    <ConfirmDeleteModal open={!!deleting} entityName={deleting?.title ?? ''} onClose={() => setDeleting(null)} onConfirm={() => deleting && deleteMutation.mutate(deleting.id)} />
  </AppShell>;
}

function isOwnTelegramChannel(channel: any) {
  return Array.isArray(channel?.adminLinks) && channel.adminLinks.length > 0;
}

function PromoModal({ open, onClose, onSubmit, title, initial, channels, channelOptions }: any) {
  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm({ defaultValues: { ...(initial ?? { status: 'draft' }), notes: initial?.text ?? '' } });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageData = watch('imageData') as string | undefined;
  const selectedChannelId = watch('telegramChannelId');

  useEffect(() => {
    if (!open) return;
    reset({ ...(initial ?? { status: 'draft' }), notes: initial?.text ?? '' });
  }, [initial, open, reset]);

  useEffect(() => {
    if (!open || selectedChannelId || channels.length !== 1) return;
    setValue('telegramChannelId', channels[0].id);
  }, [channels, open, selectedChannelId, setValue]);

  const applyImageFile = (file?: File) => {
    if (!file) return;
    setUploadingImage(true);
    promosApi
      .uploadImage(file)
      .then((res) => {
        setValue('imageData', String(res.imageUrl || ''));
      })
      .finally(() => setUploadingImage(false));
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    applyImageFile(e.target.files?.[0]);
  };

  const onPasteImage = (e: ClipboardEvent<HTMLDivElement>) => {
    const imageItem = Array.from(e.clipboardData.items).find((item) => item.type.startsWith('image/'));
    if (!imageItem) return;
    const file = imageItem.getAsFile();
    if (!file) return;
    e.preventDefault();
    applyImageFile(file);
  };

  const submit = (values: any) => {
    const notes = String(values.notes ?? '').trim();
    const payload = {
      telegramChannelId: values.telegramChannelId,
      title: values.title,
      imageData: values.imageData,
      text: notes || undefined,
    };
    onSubmit(payload);
  };

  return <Modal open={open} onClose={onClose} title={title}><form className="space-y-3" onSubmit={handleSubmit(submit)}>
    <FormField label="Channel" required error={errors.telegramChannelId ? 'Required field' : undefined}>
      <CustomSelect
        value={selectedChannelId}
        onChange={(v) => setValue('telegramChannelId', v)}
        placeholder="Select channel"
        options={channelOptions}
      />
    </FormField>
    <FormField label="Title" required error={errors.title ? 'Required field' : undefined}><Input {...register('title', { required: true })} /></FormField>
    <div className="block text-sm">
      <span className="mb-1 block text-neutral-300">Promo Image</span>
      {!imageData ? <div
        tabIndex={0}
        onPaste={onPasteImage}
        onClick={() => fileInputRef.current?.click()}
        className="cursor-pointer rounded-xl border border-dashed border-neutral-600 bg-neutral-900/70 p-4 transition hover:border-neutral-400 focus:border-blue-500 focus:outline-none"
      >
        <p className="text-sm text-neutral-200">Click to choose image or paste with `Ctrl+V`</p>
        <p className="mt-1 text-xs text-neutral-400">Supports screenshots and copied image files</p>
        {uploadingImage ? <p className="mt-1 text-xs text-blue-300">Uploading image...</p> : null}
      </div> : null}
      <input ref={fileInputRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
      {imageData ? <div className="mt-2 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900"><Image src={imageData} alt="Promo preview" width={640} height={260} className="h-40 w-full object-contain" unoptimized /></div> : null}
      {imageData ? <div className="mt-2"><Button variant="secondary" type="button" onClick={() => setValue('imageData', '')}>Remove image</Button></div> : null}
    </div>
    <input type="hidden" {...register('telegramChannelId', { required: true })} />
    <input type="hidden" {...register('imageData')} />
    <FormField label="Notes"><Textarea {...register('notes')} /></FormField>
    <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit">Save</Button></div>
  </form></Modal>;
}
