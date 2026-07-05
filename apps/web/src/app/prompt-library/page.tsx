"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Clipboard,
  Copy,
  FileText,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import {
  Button,
  Card,
  ConfirmDeleteModal,
  EmptyState,
  FormField,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Textarea,
} from "@/components/ui/primitives";
import {
  promptNotesApi,
  type PromptNote,
} from "@/lib/api";
import { useAppToast } from "@/providers/toast-provider";

export default function PromptLibraryPage() {
  const queryClient = useQueryClient();
  const { pushToast } = useAppToast();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<PromptNote | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<PromptNote | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const notes = useQuery({
    queryKey: ["prompt-notes"],
    queryFn: () => promptNotesApi.list(),
  });
  const visibleNotes = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return notes.data || [];
    return (notes.data || []).filter(
      (note) =>
        note.title.toLowerCase().includes(query) ||
        note.content.toLowerCase().includes(query),
    );
  }, [notes.data, search]);
  const removeNote = useMutation({
    mutationFn: promptNotesApi.remove,
    onSuccess: async () => {
      setDeleting(null);
      await queryClient.invalidateQueries({ queryKey: ["prompt-notes"] });
      pushToast("Note deleted.", "success");
    },
  });

  const copyNote = async (note: PromptNote) => {
    await navigator.clipboard.writeText(note.content);
    setCopiedId(note.id);
    pushToast(`“${note.title}” copied.`, "success", 2000);
    window.setTimeout(
      () => setCopiedId((current) => (current === note.id ? null : current)),
      1600,
    );
  };

  return (
    <AppShell>
      <PageHeader
        title="Prompt library"
        subtitle="Keep long prompts and reusable notes without text limits"
        action={
          <Button onClick={() => setCreating(true)}>
            <span className="inline-flex items-center gap-2">
              <Plus size={16} />
              New note
            </span>
          </Button>
        }
      />

      <div className="mb-5 max-w-xl">
        <div className="relative">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search titles and text…"
            className="pl-9"
          />
        </div>
      </div>

      {notes.isLoading ? <LoadingState /> : null}
      {!notes.isLoading && !visibleNotes.length ? (
        <EmptyState
          text={
            search
              ? "No notes match your search"
              : "Create your first reusable prompt"
          }
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {visibleNotes.map((note) => (
          <Card key={note.id} className="flex min-h-64 flex-col">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-950 text-blue-300">
                  <FileText size={17} />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate font-semibold text-white">
                    {note.title}
                  </h2>
                  <p className="text-xs text-neutral-500">
                    {note.content.length.toLocaleString()} characters
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => setEditing(note)}
                  className="rounded-md p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white"
                  aria-label={`Edit ${note.title}`}
                >
                  <Pencil size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleting(note)}
                  className="rounded-md p-2 text-red-400 hover:bg-red-950"
                  aria-label={`Delete ${note.title}`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            <pre className="mt-4 max-h-44 flex-1 overflow-hidden whitespace-pre-wrap break-words font-sans text-sm leading-6 text-neutral-300 [mask-image:linear-gradient(to_bottom,black_75%,transparent)]">
              {note.content}
            </pre>
            <Button className="mt-4 w-full" onClick={() => void copyNote(note)}>
              <span className="inline-flex items-center gap-2">
                {copiedId === note.id ? (
                  <Check size={16} />
                ) : (
                  <Copy size={16} />
                )}
                {copiedId === note.id ? "Copied" : "Copy prompt"}
              </span>
            </Button>
          </Card>
        ))}
      </div>

      <PromptNoteModal
        key={editing?.id || (creating ? "new" : "closed")}
        open={creating || Boolean(editing)}
        note={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
      <ConfirmDeleteModal
        open={Boolean(deleting)}
        entityName={deleting?.title || ""}
        onClose={() => setDeleting(null)}
        onConfirm={() =>
          deleting ? removeNote.mutateAsync(deleting.id) : undefined
        }
      />
    </AppShell>
  );
}

function PromptNoteModal({
  open,
  note,
  onClose,
}: {
  open: boolean;
  note: PromptNote | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { pushToast } = useAppToast();
  const [title, setTitle] = useState(note?.title || "");
  const [content, setContent] = useState(note?.content || "");
  const save = useMutation({
    mutationFn: () =>
      note
        ? promptNotesApi.update(note.id, { title: title.trim(), content })
        : promptNotesApi.create({ title: title.trim(), content }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["prompt-notes"] });
      pushToast(note ? "Note updated." : "Note created.", "success");
      onClose();
    },
  });
  const close = () => {
    setTitle("");
    setContent("");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={note ? "Edit prompt" : "New prompt"}
      size="xl"
    >
      <div className="space-y-4">
        <FormField label="Title" required>
          <Input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="For example: Telegram channel researcher"
          />
        </FormField>
        <FormField label="Prompt text">
          <Textarea
            rows={20}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Paste or write any amount of text…"
            className="min-h-[28rem] font-mono leading-6"
          />
        </FormField>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
            <Clipboard size={13} />
            {content.length.toLocaleString()} characters
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button
              disabled={!title.trim() || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "Saving…" : "Save note"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
