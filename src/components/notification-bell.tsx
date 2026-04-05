"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Bell, Check, CheckCheck, MessageSquare, Calendar, FileText, BookOpen, GraduationCap, FolderOpen, Trash2, ArrowUpRight, X } from "lucide-react";
import { getSubject } from "@/lib/subjects";
import Link from "next/link";

// Types
export interface AppNotification {
  id: string;
  user_id: string;
  type: "new_item" | "new_exam" | "new_forum_post" | "new_forum_comment" | "item_overdue";
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

interface NotificationBellProps {
  userId: string | null;
}

const TYPE_CONFIG: Record<string, { icon: any; color: string }> = {
  new_item: { icon: FileText, color: "text-blue-500" },
  new_exam: { icon: GraduationCap, color: "text-red-500" },
  new_forum_post: { icon: MessageSquare, color: "text-emerald-500" },
  new_forum_comment: { icon: ArrowUpRight, color: "text-purple-500" },
  item_overdue: { icon: Calendar, color: "text-amber-500" },
};

function getTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (isNaN(then)) return "---";
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(dateStr).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export function NotificationBell({ userId }: NotificationBellProps) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // Load notifications
  const loadNotifications = useCallback(async () => {
    if (!userId) return;
    try {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);
      setNotifications((data ?? []) as AppNotification[]);
    } catch { /* ignore */ }
  }, [userId, supabase]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Realtime subscription
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel("notification_changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => loadNotifications()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => loadNotifications()
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => loadNotifications()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, loadNotifications, supabase]);

  // Mark all as read
  async function markAllRead() {
    if (!userId) return;
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false);
  }

  // Delete notification
  async function deleteNotif(id: string) {
    await supabase.from("notifications").delete().eq("id", id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }

  async function markSingleRead(notifId: string) {
    await supabase.from("notifications").update({ is_read: true }).eq("id", notifId).eq("is_read", false);
  }

  // Clear old read notifications
  async function clearRead() {
    await supabase
      .from("notifications")
      .delete()
      .eq("user_id", userId!)
      .eq("is_read", true);
    setNotifications((prev) => prev.filter((n) => !n.is_read));
  }

  // Close on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition"
        title="Notificações"
      >
        <Bell size={16} className="text-zinc-400" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center shadow-sm">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl overflow-hidden z-50" style={{ maxHeight: "480px", maxWidth: "90vw" }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Notificações
              {unreadCount > 0 && (
                <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900">
                  {unreadCount}
                </span>
              )}
            </h3>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={() => { markAllRead(); }}
                  className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition flex items-center gap-1 cursor-pointer px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  title="Marcar todas como lidas"
                >
                  <CheckCheck size={12} />
                </button>
              )}
              {notifications.some((n) => n.is_read) && (
                <button
                  onClick={() => clearRead()}
                  className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition flex items-center gap-1 cursor-pointer px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  title="Limpar lidas"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Notifications body */}
          <div className="overflow-y-auto" style={{ maxHeight: "380px" }}>
            {notifications.length === 0 ? (
              <div className="py-12 text-center">
                <Bell size={24} className="text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
                <p className="text-sm text-zinc-400">Nenhuma notificação</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {notifications.map((notif) => {
                  const cfg = TYPE_CONFIG[notif.type] ?? TYPE_CONFIG.new_item;
                  const Icon = cfg.icon;
                  return (
                    <div
                      key={notif.id}
                      className={`group flex items-start gap-3 p-3 transition ${
                        notif.is_read ? "bg-white dark:bg-zinc-900" : "bg-zinc-50 dark:bg-zinc-800/50"
                      }`}
                    >
                      {/* Icon */}
                      <div className={`shrink-0 mt-0.5 ${cfg.color}`}>
                        <Icon size={16} />
                        {!notif.is_read && (
                          <span className="block w-1.5 h-1.5 rounded-full bg-red-500 mt-1" />
                        )}
                      </div>

                      {/* Content */}
                      {notif.link ? (
                        <Link href={notif.link} className="flex-1 min-w-0 block" onClick={() => markSingleRead(notif.id)}>
                          <p className={`text-sm leading-snug ${!notif.is_read ? "font-medium text-zinc-900 dark:text-zinc-100" : "text-zinc-600 dark:text-zinc-300"}`}>
                            {notif.title}
                          </p>
                          {notif.body && (
                            <p className="text-xs text-zinc-400 mt-0.5 line-clamp-2">{notif.body}</p>
                          )}
                          <p className="text-[10px] text-zinc-400 mt-1">{getTimeAgo(notif.created_at)}</p>
                        </Link>
                      ) : (
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm leading-snug ${!notif.is_read ? "font-medium text-zinc-900 dark:text-zinc-100" : "text-zinc-600 dark:text-zinc-300"}`}>
                            {notif.title}
                          </p>
                          {notif.body && (
                            <p className="text-xs text-zinc-400 mt-0.5 line-clamp-2">{notif.body}</p>
                          )}
                          <p className="text-[10px] text-zinc-400 mt-1">{getTimeAgo(notif.created_at)}</p>
                        </div>
                      )}

                      {/* Delete */}
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteNotif(notif.id); }}
                        className="shrink-0 p-1 opacity-0 group-hover:opacity-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition"
                      >
                        <X size={12} className="text-zinc-400" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
