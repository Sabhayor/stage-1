"use client";

import { useDeferredValue, useMemo, useState } from "react";
import {
  apiDelete,
  apiPatch,
  apiPost,
  messageOf,
  queryString,
  useApi,
} from "@/components/useApi";
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  Loading,
  Notice,
  PageHeader,
  Pill,
  SectionHeading,
  Select,
  Textarea,
} from "@/components/ui";
import { formatRelative } from "@/lib/datetime";
import type { Note } from "@/lib/repositories/notes";

interface EditorProps {
  note: Note;
  onSaved: (message: string) => void;
  onDeleted: (message: string) => void;
}

function NoteEditor({ note, onSaved, onDeleted }: EditorProps) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [tags, setTags] = useState(note.tags.join(", "));
  const [pinned, setPinned] = useState(note.pinned);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    title !== note.title ||
    content !== note.content ||
    tags !== note.tags.join(", ") ||
    pinned !== note.pinned;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await apiPatch(`/api/notes/${note.id}`, {
        title,
        content,
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0),
        pinned,
      });
      onSaved("Note saved");
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await apiDelete(`/api/notes/${note.id}`);
      onDeleted("Note deleted");
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={pinned}
            onChange={(event) => setPinned(event.target.checked)}
            className="h-4 w-4 accent-indigo-600"
          />
          Pinned
        </label>
        {dirty ? <Pill tone="amber">unsaved changes</Pill> : <Pill tone="emerald">saved</Pill>}
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          updated {formatRelative(note.updatedAt)}
        </span>
        <div className="ml-auto flex gap-2">
          <Button variant="danger" onClick={() => void remove()} disabled={busy}>
            Delete
          </Button>
          <Button onClick={() => void save()} disabled={busy || !dirty}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <Field label="Title" hint="Leave empty to derive the title from the first line of the body">
        <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} />
      </Field>

      <Field label="Tags" hint="Comma separated, e.g. work, ideas">
        <Input value={tags} onChange={(event) => setTags(event.target.value)} />
      </Field>

      <Field label="Content">
        <Textarea
          rows={16}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          maxLength={20000}
          className="font-mono text-sm"
        />
      </Field>

      <ErrorNote message={error} />
    </div>
  );
}

export default function NotesPage() {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [pinned, setPinned] = useState<"all" | "true" | "false">("all");

  const path = useMemo(
    () =>
      `/api/notes${queryString({
        q: deferredSearch.trim(),
        pinned: pinned === "all" ? undefined : pinned,
        limit: 200,
      })}`,
    [deferredSearch, pinned],
  );
  const { data, error, loading, refresh } = useApi<{ notes: Note[]; count: number }>(path);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [created, setCreated] = useState<Note | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const notes = data?.notes ?? [];
  const selected =
    notes.find((note) => note.id === selectedId) ??
    (created && created.id === selectedId ? created : null);

  async function createNote() {
    setActionError(null);
    try {
      const payload = await apiPost<{ note: Note }>("/api/notes", { content: "" });
      setCreated(payload.note);
      setSelectedId(payload.note.id);
      setNotice("Note created");
      refresh();
    } catch (cause) {
      setActionError(messageOf(cause));
    }
  }

  function handleSaved(message: string) {
    setNotice(message);
    refresh();
  }

  function handleDeleted(message: string) {
    setNotice(message);
    setSelectedId(null);
    setCreated(null);
    refresh();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notes"
        description="Pick a note on the left, edit it on the right."
        actions={<Button onClick={() => void createNote()}>New note</Button>}
      />

      <ErrorNote message={actionError ?? error} />
      <Notice message={notice} />

      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        <Card className="self-start">
          <SectionHeading
            title={`${data?.count ?? 0} note${(data?.count ?? 0) === 1 ? "" : "s"}`}
            hint="Newest and pinned first"
          />

          <div className="space-y-3 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
            <Field label="Search">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Title, content or tag"
              />
            </Field>
            <Field label="Pinned">
              <Select
                value={pinned}
                onChange={(event) => setPinned(event.target.value as typeof pinned)}
              >
                <option value="all">All notes</option>
                <option value="true">Pinned only</option>
                <option value="false">Unpinned only</option>
              </Select>
            </Field>
          </div>

          {loading && !data ? (
            <Loading />
          ) : notes.length === 0 ? (
            <EmptyState title="No notes yet" hint="Create one to get started." />
          ) : (
            <ul className="max-h-[32rem] divide-y divide-zinc-100 overflow-y-auto dark:divide-zinc-800">
              {notes.map((note) => (
                <li key={note.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(note.id)}
                    aria-current={note.id === selectedId ? "true" : undefined}
                    className={`w-full px-4 py-3 text-left transition ${
                      note.id === selectedId
                        ? "bg-indigo-50 dark:bg-indigo-950/50"
                        : "hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="flex-1 truncate text-sm font-medium">{note.title}</span>
                      {note.pinned ? <Pill tone="indigo">pinned</Pill> : null}
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-xs text-zinc-500 dark:text-zinc-400">
                      {note.content || "Empty note"}
                    </span>
                    <span className="mt-1 block text-[11px] text-zinc-400">
                      {formatRelative(note.updatedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {selected ? (
          <Card>
            <NoteEditor
              key={selected.id}
              note={selected}
              onSaved={handleSaved}
              onDeleted={handleDeleted}
            />
          </Card>
        ) : (
          <Card>
            <EmptyState
              title="Select a note"
              hint="Choose a note from the list, or create a new one."
            />
          </Card>
        )}
      </div>
    </div>
  );
}
