import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

/**
 * Small presentational primitives shared by every page.
 *
 * They are intentionally hook-free so the pages (which are client components)
 * can compose them freely, and so Tailwind can see every class literal.
 */

export const CARD_CLASS =
  "rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900";

export const INPUT_CLASS =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-indigo-900";

const BUTTON_VARIANTS = {
  primary:
    "bg-indigo-600 text-white hover:bg-indigo-500 disabled:bg-indigo-300 dark:disabled:bg-indigo-900",
  secondary:
    "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800",
  ghost: "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800",
  danger: "text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950",
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANTS;

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${BUTTON_VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`${CARD_CLASS} ${className}`}>{children}</section>;
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
        ) : null}
      </div>
      {actions}
    </div>
  );
}

export function SectionHeading({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
      <div>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
        {hint ? <p className="text-xs text-zinc-500 dark:text-zinc-400">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-zinc-500">{hint}</span> : null}
    </label>
  );
}
const PILL_TONES = {
  neutral: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  indigo: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
} as const;

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: keyof typeof PILL_TONES;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PILL_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-xs text-zinc-500 dark:text-zinc-400">{hint}</p> : null}
    </Card>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-4 py-8 text-center">
      <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">{title}</p>
      {hint ? <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{hint}</p> : null}
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <p className="animate-pulse px-4 py-6 text-sm text-zinc-500 dark:text-zinc-400">{label}</p>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300"
    >
      {message}
    </p>
  );
}

export function Notice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
      {message}
    </p>
  );
}


export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return <input className={`${INPUT_CLASS} ${className}`} {...rest} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = "", ...rest } = props;
  return <textarea className={`${INPUT_CLASS} ${className}`} {...rest} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = "", ...rest } = props;
  return <select className={`${INPUT_CLASS} ${className}`} {...rest} />;
}
