import { getDatabase } from "@/lib/db";
import { hasOwn, requireIso } from "@/lib/serialize";

/** Raw `notes` row (`SELECT *`). Type alias => implicit index signature. */
type NoteRow = {
  id: string;
  workspace_id: string;
  title: string;
  content: string;
  tags: string;
  pinned: boolean;
  created_at: Date | string;
  updated_at: Date | string;
};

export interface Note {
  id: string;
  workspaceId: string;
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NoteListOptions {
  q?: string;
  pinned?: boolean;
  limit?: number;
}

function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

function serialiseTags(tags: string | string[] | undefined): string {
  if (tags === undefined) return "";
  const list = Array.isArray(tags) ? tags : tags.split(",");
  return list
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
    .join(",");
}

export function mapNote(row: NoteRow): Note {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    content: row.content,
    tags: parseTags(row.tags),
    pinned: Boolean(row.pinned),
    createdAt: requireIso(row.created_at),
    updatedAt: requireIso(row.updated_at),
  };
}

/** Notes without an explicit title fall back to their first non-empty line. */
export function deriveTitle(title: string, content: string): string {
  const trimmed = title.trim();
  if (trimmed) return trimmed.slice(0, 200);
  const firstLine = content
    .split("\n")
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .find((line) => line.length > 0);
  return firstLine ? firstLine.slice(0, 200) : "Untitled note";
}

export async function listNotes(
  workspaceId: string,
  options: NoteListOptions = {},
): Promise<Note[]> {
  const db = await getDatabase();
  const where = ["workspace_id = $1"];
  const params: unknown[] = [workspaceId];

  if (options.pinned !== undefined) {
    params.push(options.pinned);
    where.push(`pinned = $${params.length}`);
  }
  if (options.q) {
    params.push(`%${options.q}%`);
    const placeholder = `$${params.length}`;
    where.push(`(title ILIKE ${placeholder} OR content ILIKE ${placeholder} OR tags ILIKE ${placeholder})`);
  }

  params.push(options.limit ?? 200);
  const rows = await db.query<NoteRow>(
    `SELECT * FROM notes
      WHERE ${where.join(" AND ")}
      ORDER BY pinned DESC, updated_at DESC
      LIMIT $${params.length}`,
    params,
  );
  return rows.map(mapNote);
}

export async function getNote(
  workspaceId: string,
  id: string,
): Promise<Note | null> {
  const db = await getDatabase();
  const rows = await db.query<NoteRow>(
    "SELECT * FROM notes WHERE workspace_id = $1 AND id = $2",
    [workspaceId, id],
  );
  return rows[0] ? mapNote(rows[0]) : null;
}

export interface NoteInput {
  title?: string;
  content?: string;
  tags?: string | string[];
  pinned?: boolean;
}

export async function createNote(
  workspaceId: string,
  input: NoteInput,
): Promise<Note> {
  const db = await getDatabase();
  const content = input.content ?? "";
  const rows = await db.query<NoteRow>(
    `INSERT INTO notes (id, workspace_id, title, content, tags, pinned)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      crypto.randomUUID(),
      workspaceId,
      deriveTitle(input.title ?? "", content),
      content,
      serialiseTags(input.tags),
      Boolean(input.pinned),
    ],
  );
  return mapNote(rows[0]);
}

export interface NotePatch {
  title?: string;
  content?: string;
  tags?: string | string[];
  pinned?: boolean;
}

export async function updateNote(
  workspaceId: string,
  id: string,
  patch: NotePatch,
): Promise<Note | null> {
  const db = await getDatabase();
  const assignments: string[] = [];
  const params: unknown[] = [workspaceId, id];

  const add = (column: string, value: unknown): void => {
    params.push(value);
    assignments.push(`${column} = $${params.length}`);
  };

  if (hasOwn(patch, "title")) {
    const provided = (patch.title ?? "").trim();
    if (provided) {
      add("title", provided.slice(0, 200));
    } else if (hasOwn(patch, "content")) {
      add("title", deriveTitle("", patch.content ?? ""));
    }
  }
  if (hasOwn(patch, "content")) add("content", patch.content);
  if (hasOwn(patch, "tags")) add("tags", serialiseTags(patch.tags));
  if (hasOwn(patch, "pinned")) add("pinned", Boolean(patch.pinned));
  if (assignments.length === 0) return getNote(workspaceId, id);

  assignments.push("updated_at = now()");

  const rows = await db.query<NoteRow>(
    `UPDATE notes SET ${assignments.join(", ")}
      WHERE workspace_id = $1 AND id = $2
      RETURNING *`,
    params,
  );
  return rows[0] ? mapNote(rows[0]) : null;
}

export async function deleteNote(
  workspaceId: string,
  id: string,
): Promise<boolean> {
  const db = await getDatabase();
  const rows = await db.query<{ id: string }>(
    "DELETE FROM notes WHERE workspace_id = $1 AND id = $2 RETURNING id",
    [workspaceId, id],
  );
  return rows.length > 0;
}
