import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import NavBar from "@/components/NavBar";
import ReminderEngine from "@/components/ReminderEngine";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Reminder — todos, notes, calendar & reminders",
  description:
    "One place for your tasks, notes, calendar and scheduled reminders, with web push notifications.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <NavBar />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">{children}</main>
        <footer className="mx-auto w-full max-w-5xl px-4 pb-8 text-xs text-zinc-500 sm:px-6 dark:text-zinc-400">
          Your data is scoped to this browser workspace — the id is generated locally and sent as the
          <code className="mx-1 rounded bg-zinc-100 px-1 py-0.5 font-mono dark:bg-zinc-800">
            x-workspace-id
          </code>
          header.
        </footer>
        <ReminderEngine />
      </body>
    </html>
  );
}
