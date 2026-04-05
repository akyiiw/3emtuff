"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SUBJECTS } from "@/lib/subjects";
import { Navbar } from "@/components/navbar";
import { CreateModal } from "@/components/create-modal";
import { Clock, AlertTriangle, CheckCircle2, Calendar, User, ChevronDown } from "lucide-react";
import Link from "next/link";

interface ItemData {
  id: string;
  text: string;
  description: string | null;
  due_date: string | null;
  created_by: string;
  subject_id: string;
}

// Global profile cache across all pages
const profileCache: Map<string, string> = new Map();

export default function DashboardPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [allItems, setAllItems] = useState<ItemData[]>([]);
  const [doneMap, setDoneMap] = useState<Map<string, Set<string>>>(new Map());
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"all" | "mine" | "pending" | "concluded" | "overdue">("all");

  useEffect(() => { loadUser(); loadItems(); }, []);

  async function loadUser() {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUser(user.id);
        setUserName(user.user_metadata?.name ?? user.email?.split("@")[0] ?? "Usuário");
        profileCache.set(user.id, user.user_metadata?.name ?? user.email?.split("@")[0] ?? "Usuário");
      } else {
        router.replace("/");
      }
    } catch {
      router.replace("/");
    }
  }

  /** Resolve ALL user IDs to names using the profiles table */
  async function loadProfiles(userIds: string[]) {
    const missing = userIds.filter((id) => id && !profileCache.has(id));
    if (missing.length === 0) return;
    try {
      const supabase = createClient();
      const { data } = await supabase.from("profiles").select("id, name").in("id", [...new Set(missing)]);
      for (const p of (data ?? [])) {
        profileCache.set(p.id, p.name);
        profileCache.set(p.id, p.name);
      }
    } catch { /* profiles table may not exist yet */ }
  }

  async function loadItems() {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("items")
        .select("*")
        .order("due_date", { ascending: true });

      const doneItems = data as ItemData[];
      if (!doneItems) { setAllItems([]); setLoading(false); return; }

      setAllItems(doneItems);

      // Collect all user IDs (creators + done users)
      const { data: doneData } = await supabase.from("task_done").select("id, item_id, user_id, done_at");
      const doneEntries = (doneData ?? []) as { item_id: string; user_id: string }[];
      const allUserIds = [
        ...doneItems.map((i) => i.created_by),
        ...doneEntries.map((d) => d.user_id),
      ];
      await loadProfiles(allUserIds);

      // Build done map
      const d = new Map<string, Set<string>>();
      for (const done of doneEntries) {
        if (!d.has(done.item_id)) d.set(done.item_id, new Set());
        d.get(done.item_id)!.add(done.user_id);
      }
      setDoneMap(d);
    } catch {
      setAllItems([]);
    }
    setLoading(false);
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/");
  }

  async function toggleDone(itemId: string) {
    if (!currentUser) return;
    const supabase = createClient();
    const existing = doneMap.get(itemId);
    const alreadyDone = existing?.has(currentUser);

    if (alreadyDone) {
      await supabase.from("task_done").delete().eq("item_id", itemId).eq("user_id", currentUser);
    } else {
      await supabase.from("task_done").insert({ item_id: itemId, user_id: currentUser });
    }
    loadItems();
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];

  function isMineDone(item: ItemData) {
    if (!currentUser) return false;
    return doneMap.get(item.id)?.has(currentUser) ?? false;
  }

  function getDoneNames(item: ItemData): string[] {
    const userIds = doneMap.get(item.id);
    if (!userIds) return [];
    return [...userIds].map((id) => profileCache.get(id) ?? "Usuário");
  }

  // Stats
  const pendingForMe = allItems.filter((i) => !isMineDone(i)).length;
  const doneByMe = allItems.filter((i) => isMineDone(i)).length;
  const overdueItems = allItems.filter((i) => {
    if (!i.due_date || isMineDone(i)) return false;
    return i.due_date < todayStr;
  });
  const todayItems = allItems.filter((i) => {
    if (!i.due_date) return false;
    return i.due_date === todayStr;
  });

  // 7-day calendar
  const nextDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().split("T")[0];
    return {
      label: d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit" }),
      key,
      items: allItems.filter((item) => item.due_date === key),
    };
  });

  // Filtered left side
  const filteredItems = (() => {
    switch (activeFilter) {
      case "mine":
        return allItems.filter((i) => i.created_by === currentUser);
      case "pending":
        return allItems.filter((i) => !isMineDone(i));
      case "concluded":
        return allItems.filter((i) => isMineDone(i));
      case "overdue":
        return overdueItems;
      default:
        return allItems;
    }
  })();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Navbar />

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Stat icon={Clock} label="Pendentes" value={pendingForMe} active={activeFilter === "pending"} onClick={() => setActiveFilter(activeFilter === "pending" ? "all" : "pending")} />
          <Stat icon={CheckCircle2} label="Conclu&iacute;das" value={doneByMe} accent="text-green-600" active={activeFilter === "concluded"} onClick={() => setActiveFilter(activeFilter === "concluded" ? "all" : "concluded")} />
          <Stat icon={AlertTriangle} label="Atrasadas" value={overdueItems.length} accent="text-red-600" active={activeFilter === "overdue"} onClick={() => setActiveFilter(activeFilter === "overdue" ? "all" : "overdue")} />
          <Stat icon={Calendar} label="Hoje" value={todayItems.length} active={activeFilter === "mine"} onClick={() => setActiveFilter(activeFilter === "mine" ? "all" : "mine")} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left: filtered list */}
          <div className="space-y-1">
            {activeFilter === "all" ? (
              <>
                {overdueItems.length > 0 && (
                  <CollapsibleSection title="Atrasadas" count={overdueItems.length} accent="text-red-600" defaultOpen>
                    {overdueItems.map((item) => (
                      <ItemLine key={item.id} item={item} isMineDone={isMineDone(item)} onToggleDone={() => toggleDone(item.id)} doneNames={getDoneNames(item)} router={router} />
                    ))}
                  </CollapsibleSection>
                )}
                {todayItems.length > 0 && (
                  <CollapsibleSection title="Para hoje" count={todayItems.length} defaultOpen>
                    {todayItems.map((item) => (
                      <ItemLine key={item.id} item={item} isMineDone={isMineDone(item)} onToggleDone={() => toggleDone(item.id)} doneNames={getDoneNames(item)} router={router} />
                    ))}
                  </CollapsibleSection>
                )}
                {(() => {
                  const upcoming = allItems.filter((i) => {
                    if (!i.due_date || isMineDone(i)) return false;
                    return i.due_date >= todayStr;
                  }).slice(3);
                  if (upcoming.length === 0) return null;
                  return (
                    <CollapsibleSection title="Pró ximas" count={upcoming.length} defaultOpen>
                      {upcoming.map((item) => (
                        <ItemLine key={item.id} item={item} isMineDone={isMineDone(item)} onToggleDone={() => toggleDone(item.id)} doneNames={getDoneNames(item)} router={router} />
                      ))}
                    </CollapsibleSection>
                  );
                })()}
                {(() => {
                  const noDateItems = allItems.filter((i) => !i.due_date && !isMineDone(i));
                  if (noDateItems.length === 0) return null;
                  return (
                    <CollapsibleSection title="Sem data" count={noDateItems.length} defaultOpen>
                      {noDateItems.map((item) => (
                        <ItemLine key={item.id} item={item} isMineDone={isMineDone(item)} onToggleDone={() => toggleDone(item.id)} doneNames={getDoneNames(item)} router={router} />
                      ))}
                    </CollapsibleSection>
                  );
                })()}
                {(() => {
                  const done = allItems.filter((i) => isMineDone(i));
                  if (done.length === 0) return null;
                  return (
                    <CollapsibleSection title="Conclu&iacute;das" count={done.length} defaultOpen={false}>
                      {done.map((item) => (
                        <ItemLine key={item.id} item={item} isMineDone={isMineDone(item)} onToggleDone={() => toggleDone(item.id)} doneNames={getDoneNames(item)} router={router} />
                      ))}
                    </CollapsibleSection>
                  );
                })()}
                {pendingForMe === 0 && doneByMe === 0 && (
                  <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-8 text-center">
                    <p className="text-zinc-500">Nada pendente por enquanto</p>
                  </div>
                )}
              </>
            ) : (() => {
              const title = activeFilter === "pending" ? "Pendentes" : activeFilter === "concluded" ? "Conclu&iacute;das" : activeFilter === "overdue" ? "Atrasadas" : "Minhas";
              if (filteredItems.length === 0) {
                return (
                  <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-8 text-center">
                    <p className="text-zinc-500">Nenhum item nesta categoria</p>
                  </div>
                );
              }
              return (
                <div className="space-y-1.5">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                    {title} ({filteredItems.length})
                  </h3>
                  {filteredItems.map((item) => (
                    <ItemLine key={item.id} item={item} isMineDone={isMineDone(item)} onToggleDone={() => toggleDone(item.id)} doneNames={getDoneNames(item)} router={router} />
                  ))}
                </div>
              );
            })()}
          </div>

          {/* Right: calendar + per-subject */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Pr&oacute;ximos 7 dias</h3>
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800 p-4">
              {nextDays.map((day) => (
                <div key={day.key} className="py-2 last:pb-0 first:pt-0">
                  <p className="text-xs text-zinc-400 capitalize mb-1">{day.label}</p>
                  {day.items.length > 0 ? (
                    <div className="space-y-1 pl-3">
                      {day.items.map((item) => {
                        const subj = SUBJECTS.find((s) => s.id === item.subject_id);
                        const mineDone = isMineDone(item);
                        return (
                          <div key={item.id} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={mineDone}
                              onChange={() => toggleDone(item.id)}
                              className="w-3.5 h-3.5 rounded border-zinc-300 dark:border-zinc-600 accent-zinc-900 dark:accent-zinc-100 shrink-0"
                            />
                            <button
                              onClick={() => router.push(`/dashboard/${item.subject_id}?item=${item.id}`)}
                              className={`text-sm text-left cursor-pointer flex-1 truncate ${mineDone ? "line-through text-zinc-400" : "text-zinc-700 dark:text-zinc-300"}`}
                            >
                              <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${subj?.color ?? "bg-zinc-400"}`} />
                              {item.text}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-300 dark:text-zinc-600">Livre</p>
                  )}
                </div>
              ))}
            </div>

            {/* Per-subject summary */}
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-6 mb-2">Resumo por mat&eacute;ria</h3>
            <div className="grid grid-cols-4 gap-2">
              {SUBJECTS.map((s) => {
                const count = allItems.filter((i) => i.subject_id === s.id && !isMineDone(i)).length;
                return (
                  <Link
                    key={s.id}
                    href={`/dashboard/${s.id}`}
                    className={`bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-2.5 text-center hover:ring-2 transition group ${s.ring ?? "ring-zinc-400/20"} hover:shadow-md`}
                  >
                    <span className="text-lg">{s.emoji}</span>
                    <p className={`text-[11px] truncate mt-0.5 ${s.textCol ?? "text-zinc-400"} font-medium`}>{s.name}</p>
                    {count > 0 && (
                      <span className={`text-[10px] font-bold ${s.textCol ?? "text-zinc-900 dark:text-zinc-100"}`}>{count}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* FAB */}
        <button
          onClick={() => setShowModal(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-full shadow-lg hover:scale-105 transition flex items-center justify-center text-3xl leading-none font-light"
        >
          +
        </button>
      </main>

      <CreateModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSave={() => { loadItems(); setShowModal(false); }}
      />
    </div>
  );
}

/* ---- sub-components ---- */

function Stat({ icon: Icon, label, value, accent, active, onClick }: {
  icon: typeof Clock; label: string; value: number; accent?: string; active?: boolean; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-white dark:bg-zinc-900 rounded-xl border p-4 transition-all ${
        active
          ? "border-zinc-900 dark:border-zinc-100 ring-2 ring-zinc-900/10 dark:ring-zinc-100/10"
          : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon size={16} className="text-zinc-400" />
        <span className="text-xs text-zinc-500">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${accent ?? "text-zinc-900 dark:text-zinc-100"}`}>{value}</p>
    </button>
  );
}

function CollapsibleSection({
  title,
  count,
  children,
  accent,
  defaultOpen,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
  accent?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen(!open)}
        className={`w-full text-left text-sm font-semibold mb-1 flex items-center justify-between py-1 ${
          accent ?? "text-zinc-900 dark:text-zinc-100"
        }`}
      >
        <span>
          {title} <span className="text-xs text-zinc-400">({count})</span>
        </span>
        <ChevronDown size={14} className={`text-zinc-400 transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && <div className="space-y-1.5">{children}</div>}
    </div>
  );
}

function ItemLine({
  item,
  isMineDone,
  onToggleDone,
  doneNames,
  router,
}: {
  item: ItemData;
  isMineDone: boolean;
  onToggleDone: () => void;
  doneNames: string[];
  router: ReturnType<typeof useRouter>;
}) {
  const subj = SUBJECTS.find((s) => s.id === item.subject_id);
  return (
    <div
      onClick={() => router.push(`/dashboard/${item.subject_id}?item=${item.id}`)}
      className="flex items-start gap-2 p-3 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition cursor-pointer group block"
    >
      <input
        onClick={(e) => e.stopPropagation()}
        type="checkbox"
        checked={isMineDone}
        onChange={onToggleDone}
        className="w-5 h-5 mt-0.5 rounded border-zinc-300 dark:border-zinc-600 accent-zinc-900"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-[15px] leading-snug ${isMineDone ? "line-through text-zinc-400" : "text-zinc-700 dark:text-zinc-300"}`}>
            {item.text}
          </span>
          {subj && (
            <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium text-white ${subj.color}`}>
              {subj.emoji} {subj.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1">
          {item.due_date && (
            <span className={`text-[11px] ${item.due_date < new Date().toISOString().split("T")[0] && !isMineDone ? "text-red-500" : "text-zinc-400"}`}>
              {new Date(item.due_date + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
            </span>
          )}
          {item.description && (
            <span className="text-[11px] text-zinc-400 truncate">{item.description.substring(0, 50)}</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1 text-[11px]">
          <span className="flex items-center gap-1 text-zinc-500 dark:text-zinc-400">
            <User size={10} /> {profileCache.get(item.created_by) ?? "Usuário"}
          </span>
          {doneNames.length > 0 && (
            <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
              <CheckCircle2 size={10} /> {doneNames.join(", ")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
