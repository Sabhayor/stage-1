"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/todos", label: "Todos" },
  { href: "/notes", label: "Notes" },
  { href: "/calendar", label: "Calendar" },
  { href: "/reminders", label: "Reminders" },
] as const;

/** Sticky top navigation shared by every page. */
export default function NavBar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/85 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/85">
      <nav className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-1 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="mr-2 flex items-center gap-2 text-sm font-semibold">
          <span
            aria-hidden
            className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-600 text-xs font-bold text-white"
          >
            R
          </span>
          Reminder
        </Link>

        {LINKS.map((link) => {
          const active =
            link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);

          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                active
                  ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
