"use client";

import { useState } from "react";

interface SectionProps {
  title: string;
  count: number;
  children: React.ReactNode;
  accent?: string;
  defaultOpen?: boolean;
}

export function Section({ title, count, children, accent, defaultOpen }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen(!open)}
        className={`text-sm font-semibold mb-1 flex items-center justify-between w-full py-1 px-2 rounded-lg transition-colors cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 ${accent ?? "text-zinc-900 dark:text-zinc-100"}`}
      >
        <span>{title} <span className="text-xs text-zinc-400">({count})</span></span>
        <span className="text-xs text-zinc-400">{open ? "▾" : "▸"}</span>
      </button>
      {open && <div className="space-y-1.5">{children}</div>}
    </div>
  );
}
