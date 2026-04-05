"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SUBJECTS } from "@/lib/subjects";
import { LogOut, MessageSquare, Settings, Sun, Moon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useTheme } from "@/lib/theme";

export function Navbar({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(null);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const [open, setOpen] = useState<string | null>(null);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/");
  }

  const isForum = pathname.startsWith("/forum");

  return (
    <header className="sticky top-0 z-50 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
      <div className="max-w-6xl mx-auto px-4 flex items-center gap-4 h-14">
        {/* Icon */}
        <Link href="/dashboard" className="font-bold text-zinc-900 dark:text-zinc-100 text-sm shrink-0 hover:text-zinc-700 dark:hover:text-zinc-300 transition">
          3EMTuff
        </Link>

        {/* Divider */}
        <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700 shrink-0" />

        {/* Forum link */}
        <Link
          href="/forum"
          className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 ${
            isForum
              ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-sm"
              : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          }`}
        >
          <MessageSquare size={14} /> Fórum
        </Link>

        {/* Divider */}
        <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700 shrink-0" />

        {/* Subject buttons */}
        {!isForum && (
          <nav className="flex gap-1 overflow-x-auto scrollbar-hide flex-1" style={{ scrollbarWidth: "none" }}>
            {SUBJECTS.map((s) => {
              const active = pathname === `/dashboard/${s.id}`;
              return (
                <Link
                  key={s.id}
                  href={`/dashboard/${s.id}`}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    active
                      ? `${s.color} ${s.darkColor} text-white shadow-sm`
                      : `${s.textCol} hover:bg-zinc-100 dark:hover:bg-zinc-800`
                  }`}
                >
                  {s.emoji} {s.name}
                </Link>
              );
            })}
          </nav>
        )}

        {/* Right */}
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {/* Theme toggle */}
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition"
            title={theme === "dark" ? "Modo claro" : "Modo escuro"}
          >
            {theme === "dark" ? (
              <Sun size={16} className="text-zinc-400" />
            ) : (
              <Moon size={16} className="text-zinc-400" />
            )}
          </button>

          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition"
              title="Configurações"
            >
              <Settings size={16} className="text-zinc-400" />
            </button>
          )}
          <button
            onClick={handleSignOut}
            className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition"
            title="Sair"
          >
            <LogOut size={16} className="text-zinc-400" />
          </button>
        </div>
      </div>
    </header>
  );
}
