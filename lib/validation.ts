import { z } from "zod";

/**
 * Accepted ISO-8601 date-time strings, e.g. `2026-03-14T09:30:00.000Z`.
 * Validated with `Date.parse` so the rule is independent of the Zod version.
 */
export const isoDateTime = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Must be a valid ISO-8601 date-time string",
  });

export const prioritySchema = z.enum(["low", "medium", "high"]);
export type Priority = z.infer<typeof prioritySchema>;

export const eventColorSchema = z.enum([
  "indigo",
  "emerald",
  "amber",
  "rose",
  "sky",
]);
export type EventColor = z.infer<typeof eventColorSchema>;

export const targetTypeSchema = z.enum(["standalone", "todo", "event", "note"]);
export type TargetType = z.infer<typeof targetTypeSchema>;

/* ------------------------------------------------------------------ todos */

export const todoCreateSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  notes: z.string().max(5000).optional().default(""),
  priority: prioritySchema.optional().default("medium"),
  dueAt: isoDateTime.nullish(),
});
export type TodoCreateInput = z.infer<typeof todoCreateSchema>;

export const todoUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    notes: z.string().max(5000).optional(),
    priority: prioritySchema.optional(),
    dueAt: isoDateTime.nullish(),
    completed: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });
export type TodoUpdateInput = z.infer<typeof todoUpdateSchema>;

export const todoQuerySchema = z.object({
  status: z.enum(["all", "active", "completed"]).default("all"),
  due: z.enum(["any", "today", "overdue", "upcoming"]).default("any"),
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export type TodoQuery = z.infer<typeof todoQuerySchema>;

/* ------------------------------------------------------------------ notes */

export const noteCreateSchema = z.object({
  title: z.string().trim().max(200).optional().default(""),
  content: z.string().max(20000).optional().default(""),
  tags: z
    .union([z.string().max(200), z.array(z.string().max(40)).max(20)])
    .optional()
    .default(""),
  pinned: z.boolean().optional().default(false),
});
export type NoteCreateInput = z.infer<typeof noteCreateSchema>;

export const noteUpdateSchema = z
  .object({
    title: z.string().trim().max(200).optional(),
    content: z.string().max(20000).optional(),
    // Every field of an update is optional: a PATCH that only touches `pinned`
    // (or `title`) must not be rejected for a missing `tags`.
    tags: z
      .union([z.string().max(200), z.array(z.string().max(40)).max(20)])
      .optional(),
    pinned: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });
export type NoteUpdateInput = z.infer<typeof noteUpdateSchema>;

export const noteQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  pinned: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

/* ----------------------------------------------------------------- events */

export const eventCreateSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200),
    description: z.string().max(5000).optional().default(""),
    location: z.string().max(200).optional().default(""),
    startAt: isoDateTime,
    endAt: isoDateTime.optional(),
    allDay: z.boolean().optional().default(false),
    color: eventColorSchema.optional().default("indigo"),
  })
  .refine(
    (value) =>
      !value.endAt || Date.parse(value.endAt) >= Date.parse(value.startAt),
    { message: "endAt must be after startAt", path: ["endAt"] },
  );
export type EventCreateInput = z.infer<typeof eventCreateSchema>;

export const eventUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(5000).optional(),
    location: z.string().max(200).optional(),
    startAt: isoDateTime.optional(),
    endAt: isoDateTime.nullish(),
    allDay: z.boolean().optional(),
    color: eventColorSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });
export type EventUpdateInput = z.infer<typeof eventUpdateSchema>;

export const eventQuerySchema = z.object({
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

/* -------------------------------------------------------------- reminders */

export const reminderCreateSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  body: z.string().max(2000).optional().default(""),
  remindAt: isoDateTime,
  targetType: targetTypeSchema.optional().default("standalone"),
  targetId: z.string().trim().min(1).max(80).nullish(),
});
export type ReminderCreateInput = z.infer<typeof reminderCreateSchema>;

export const reminderUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    body: z.string().max(2000).optional(),
    remindAt: isoDateTime.optional(),
    targetType: targetTypeSchema.optional(),
    targetId: z.string().trim().min(1).max(80).nullish(),
    sent: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });
export type ReminderUpdateInput = z.infer<typeof reminderUpdateSchema>;

export const reminderQuerySchema = z.object({
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
  pending: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export const dueQuerySchema = z.object({
  withinMinutes: z.coerce.number().int().min(0).max(1440).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/* ------------------------------------------------------------------- push */

export const pushSubscribeSchema = z.object({
  endpoint: z
    .string()
    .trim()
    .refine((value) => /^https?:\/\//.test(value), {
      message: "endpoint must be an absolute URL",
    }),
  keys: z.object({
    p256dh: z.string().trim().min(1),
    auth: z.string().trim().min(1),
  }),
});
export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;

export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().trim().min(1),
});
