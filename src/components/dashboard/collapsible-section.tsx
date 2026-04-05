"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface CollapsibleSectionProps {
  title: string;
  count: number;
  children: React.ReactNode;
  accent?: string;
  defaultOpen?: boolean;
}

export function CollapsibleSection({ title, count, children, accent, defaultOpen }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  return (
    <div className="mb-2">
      <button onClick={() => setOpen(!open)}
        className={`w-full text-left text-sm font-semibold mb-1 flex items-center justify-between py-1 px-2 rounded-lg transition-colors cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 ${accent ?? "text-zinc-900 dark:text-zinc-100"}`}
      >
        <span>{title} <span className="text-xs text-zinc-400">({count})</span></span>
        <ChevronDown size={14} className={`text-zinc-400 transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && <div className="space-y-1.5">{children}</div>}
    </div>
  );
}
