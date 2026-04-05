"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SUBJECTS } from "@/lib/subjects";
import { Navbar } from "@/components/navbar";
import { CreateModal, ITEM_TYPES } from "@/components/create-modal";
import {
  Clock, AlertTriangle, CheckCircle2, Calendar, User, ChevronDown,
  GraduationCap, FolderOpen, FileText, ChevronRight, MessageSquare,
} from "lucide-react";
import Link from "next/link";

interface ItemData {
  id: string;
  text: string;
  description: string | null;
  due_date: string | null;
  created_by: string;
  subject_id: string;
  item_type: string;
}

const profileCache: Map<string, string> = new Map();

export default function DashboardPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [allItems, setAllItems] = useState<ItemData[]>([]);
  const [doneMap, setDoneMap] = useState<Map<string, Set<string>>>(new Map());
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"all" | "mine" | "pending" | "concluded" | "overdue">("all");

  // Calendar state
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [selectedDay, setSelectedDay] = useState<string | null>(null); // null = weekly, else show that day
  const [showMonthView, setShowMonthView] = useState(false);

  useEffect(() => { loadUser(); loadItems(); }, []);

  async function loadUser() {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUser(user.id);
        profileCache.set(user.id, user.user_metadata?.name ?? user.email?.split("@")[0] ?? "Usuário");
      } else {
        router.replace("/");
      }
    } catch {
      router.replace("/");
    }
  }

  async function loadProfiles(userIds: string[]) {
    const missing = userIds.filter((id) => id && !profileCache.has(id));
    if (missing.length === 0) return;
    try {
      const supabase = createClient();
      const { data } = await supabase.from("profiles").select("id, name").in("id", [...new Set(missing)]);
      for (const p of (data ?? [])) profileCache.set(p.id, p.name);
    } catch { /* ignore */ }
  }

  async function loadItems() {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data } = await supabase.from("items").select("*").order("due_date", { ascending: true });
      const typedItems = data as ItemData[];
      if (!typedItems) { setAllItems([]); setLoading(false); return; }
      setAllItems(typedItems);

      const { data: doneData } = await supabase.from("task_done").select("id, item_id, user_id, done_at");
      const doneEntries = (doneData ?? []) as { item_id: string; user_id: string }[];
      await loadProfiles([
        ...typedItems.map((i) => i.created_by),
        ...doneEntries.map((d) => d.user_id),
      ]);

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
    const alreadyDone = doneMap.get(itemId)?.has(currentUser);
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

  // --- Calendar data ---

  // Weekly view: next 7 days
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().split("T")[0];
    return {
      key,
      label: d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit" }),
      isToday: key === todayStr,
      items: allItems.filter((it) => it.due_date === key),
    };
  });

  // Month data: current month + 2
  function getMonthData(monthOffset: number) {
    const d = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const monthName = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const startOffset = (firstDay + 6) % 7;
    const cells: { date: string; day: number; isCurrent: boolean; items: ItemData[] }[] = [];
    for (let i = 0; i < startOffset; i++) {
      const prevDate = new Date(year, month, -startOffset + i + 1);
      const key = prevDate.toISOString().split("T")[0];
      cells.push({ date: key, day: prevDate.getDate(), isCurrent: false, items: allItems.filter((it) => it.due_date === key) });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      cells.push({ date: key, day, isCurrent: true, items: allItems.filter((it) => it.due_date === key) });
    }
    return { monthKey, monthName, cells };
  }

  const months = [getMonthData(0), getMonthData(1), getMonthData(2)];

  function toggleMonth(key: string) {
    const next = new Set(expandedMonths);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpandedMonths(next);
  }

  // Filtered items
  const pendingForMe = allItems.filter((i) => !isMineDone(i)).length;
  const doneByMe = allItems.filter((i) => isMineDone(i)).length;
  const overdueItems = allItems.filter((i) => {
    if (!i.due_date || isMineDone(i)) return false;
    return i.due_date < todayStr;
  });
  const todayItems = allItems.filter((i) => i.due_date === todayStr && !isMineDone(i));

  // If a day is selected from the calendar, show that day's items
  const selectedDayItems = selectedDay ? allItems.filter((i) => i.due_date === selectedDay) : [];
  const selectedDayLabel = selectedDay
    ? new Date(selectedDay + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })
    : null;

  const filteredItems = (() => {
    switch (activeFilter) {
      case "mine": return allItems.filter((i) => i.created_by === currentUser);
      case "pending": return allItems.filter((i) => !isMineDone(i));
      case "concluded": return allItems.filter((i) => isMineDone(i));
      case "overdue": return overdueItems;
      default: return allItems;
    }
  })();

  function typeColor(itemType: string) {
    return itemType === "exam" ? "bg-red-500" : itemType === "work" ? "bg-purple-500" : "bg-blue-500";
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Navbar />

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Stat icon={Clock} label="Pendentes" value={pendingForMe} active={activeFilter === "pending"} onClick={() => { setActiveFilter(activeFilter === "pending" ? "all" : "pending"); setSelectedDay(null); }} />
          <Stat icon={CheckCircle2} label="Conclu&iacute;das" value={doneByMe} accent="text-green-600" active={activeFilter === "concluded"} onClick={() => { setActiveFilter(activeFilter === "concluded" ? "all" : "concluded"); setSelectedDay(null); }} />
          <Stat icon={AlertTriangle} label="Atrasadas" value={overdueItems.length} accent="text-red-600" active={activeFilter === "overdue"} onClick={() => { setActiveFilter(activeFilter === "overdue" ? "all" : "overdue"); setSelectedDay(null); }} />
          <Stat icon={Calendar} label="Hoje" value={todayItems.length} active={activeFilter === "mine"} onClick={() => { setActiveFilter(activeFilter === "mine" ? "all" : "mine"); setSelectedDay(null); }} />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          {/* Left: filtered list */}
          <div className="space-y-1">
            {/* Selected day filter */}
            {selectedDay && (
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 capitalize">
                  {selectedDayLabel}
                </span>
                <button onClick={() => setSelectedDay(null)} className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 flex items-center gap-1">
                  Limpar filtro <ChevronDown size={12} className="rotate-90" />
                </button>
              </div>
            )}

            {selectedDay ? (
              <>
                {selectedDayItems.length === 0 ? (
                  <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-8 text-center">
                    <p className="text-zinc-500">Nenhuma atividade neste dia</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {selectedDayItems.map((item) => (
                      <ItemLine key={item.id} item={item} isMineDone={isMineDone(item)} onToggleDone={() => toggleDone(item.id)} doneNames={getDoneNames(item)} router={router} />
                    ))}
                  </div>
                )}
              </>
            ) : activeFilter === "all" ? (
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
                  const upcoming = allItems.filter((i) => !i.due_date || (!isMineDone(i) && i.due_date >= todayStr)).slice(3);
                  const filtered = upcoming.filter((i) => i.due_date && !isMineDone(i) && i.due_date >= todayStr);
                  if (filtered.length === 0) return null;
                  return (
                    <CollapsibleSection title="Pr&oacute;ximas" count={filtered.length} defaultOpen>
                      {filtered.map((item) => (
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
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Calendar size={14} /> Pr&oacute;ximos 7 dias
              </h3>
              <button
                onClick={() => setShowMonthView(!showMonthView)}
                className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition"
              >
                {showMonthView ? "Ver semana" : "Ver m&ecirc;s"}
              </button>
            </div>

            {!showMonthView ? (
              /* Weekly view */
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800 p-4">
                {weekDays.map((day) => {
                  const hasExam = day.items.some((i) => i.item_type === "exam");
                  const hasItem = day.items.length > 0;
                  return (
                    <div key={day.key} className="py-2 last:pb-0 first:pt-0">
                      <button
                        onClick={() => setSelectedDay(day.key === selectedDay ? null : day.key)}
                        className="flex items-center justify-between w-full group"
                      >
                        <p className={`text-xs font-medium ${
                          day.isToday
                            ? "text-zinc-900 dark:text-zinc-100 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 w-5 h-5 rounded-full flex items-center justify-center"
                            : selectedDay === day.key
                            ? "text-zinc-900 dark:text-zinc-100 font-bold"
                            : "text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300"
                        } capitalize`}>
                          {day.label}
                        </p>
                        {hasItem && (
                          <div className="flex items-center gap-0.5">
                            {day.items.slice(0, 4).map((it) => (
                              <div key={it.id} className={`w-1.5 h-1.5 rounded-full ${typeColor(it.item_type)}`} />
                            ))}
                            {day.items.length > 4 && (
                              <span className="text-[9px] text-zinc-400">+{day.items.length - 4}</span>
                            )}
                          </div>
                        )}
                      </button>
                      {hasItem && (
                        <div className="space-y-1 mt-1 pl-1">
                          {day.items.map((item) => {
                            const subj = SUBJECTS.find((s) => s.id === item.subject_id);
                            const mineDone = isMineDone(item);
                            return (
                              <div key={item.id} className="flex items-center gap-2 pl-1">
                                {item.item_type !== "exam" && (
                                  <input
                                    type="checkbox"
                                    checked={mineDone}
                                    onChange={() => toggleDone(item.id)}
                                    className="w-3.5 h-3.5 rounded border-zinc-300 dark:border-zinc-600 accent-zinc-900 dark:accent-zinc-100 shrink-0"
                                  />
                                )}
                                {item.item_type === "exam" && (
                                  <GraduationCap size={12} className="text-red-500 shrink-0" />
                                )}
                                <button
                                  onClick={() => router.push(`/dashboard/${item.subject_id}?item=${item.id}`)}
                                  className={`text-sm text-left cursor-pointer flex-1 truncate ${mineDone ? "line-through text-zinc-400" : "text-zinc-700 dark:text-zinc-300"}`}
                                >
                                  {item.text}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Month view */
              <div className="space-y-3">
                {months.map((m) => {
                  const expanded = expandedMonths.has(m.monthKey);
                  return (
                    <div key={m.monthKey} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                      <button
                        onClick={() => toggleMonth(m.monthKey)}
                        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-zinc-900 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition capitalize"
                      >
                        <span className="flex items-center gap-2">
                          {m.monthName}
                          <span className="text-xs text-zinc-400 font-normal">
                            ({m.cells.filter((c) => c.items.length > 0).reduce((sum, c) => sum + c.items.length, 0)} itens)
                          </span>
                        </span>
                        {expanded ? <ChevronDown size={14} className="text-zinc-400" /> : <ChevronRight size={14} className="text-zinc-400" />}
                      </button>
                      {expanded && (
                        <div className="px-3 pb-3">
                          <div className="grid grid-cols-7 gap-0 mb-1">
                            {["Seg", "Ter", "Qua", "Qui", "Sex", "S&aacute;b", "Dom"].map((d) => (
                              <div key={d} className="text-center text-[10px] text-zinc-400 py-1">{d}</div>
                            ))}
                          </div>
                          <div className="grid grid-cols-7 gap-0">
                            {m.cells.map((cell, idx) => {
                              const isToday = cell.date === todayStr;
                              const isSelected = cell.date === selectedDay;
                              const hasItems = cell.items.length > 0;
                              return (
                                <button
                                  key={idx}
                                  onClick={() => { setSelectedDay(cell.date === selectedDay ? null : cell.date); }}
                                  className={`text-center py-1 px-0.5 rounded cursor-pointer transition ${
                                    isToday
                                      ? "bg-zinc-900 dark:bg-zinc-100 rounded-full font-bold"
                                      : isSelected
                                      ? "bg-zinc-200 dark:bg-zinc-700 rounded-full font-bold"
                                      : "hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full"
                                  } ${cell.isCurrent ? "" : "opacity-30"}`}
                                >
                                  <span className={`text-[11px] ${isToday ? "text-white dark:text-zinc-900" : ""}`}>{cell.day}</span>
                                  {hasItems && (
                                    <div className="flex justify-center gap-0.5 mt-0.5">
                                      {cell.items.slice(0, 3).map((item) => (
                                        <div key={item.id} className={`w-1.5 h-1.5 rounded-full ${typeColor(item.item_type)}`} />
                                      ))}
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Per-subject */}
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-2 mb-2">Resumo por mat&eacute;ria</h3>
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
    <button onClick={onClick}
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

function CollapsibleSection({ title, count, children, accent, defaultOpen }: {
  title: string; count: number; children: React.ReactNode; accent?: string; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  return (
    <div className="mb-2">
      <button onClick={() => setOpen(!open)}
        className={`w-full text-left text-sm font-semibold mb-1 flex items-center justify-between py-1 ${accent ?? "text-zinc-900 dark:text-zinc-100"}`}
      >
        <span>{title} <span className="text-xs text-zinc-400">({count})</span></span>
        <ChevronDown size={14} className={`text-zinc-400 transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && <div className="space-y-1.5">{children}</div>}
    </div>
  );
}

function ItemLine({ item, isMineDone, onToggleDone, doneNames, router }: {
  item: ItemData; isMineDone: boolean; onToggleDone: () => void; doneNames: string[]; router: ReturnType<typeof useRouter>;
}) {
  const subj = SUBJECTS.find((s) => s.id === item.subject_id);
  const typeConfig = ITEM_TYPES[item.item_type as keyof typeof ITEM_TYPES] ?? ITEM_TYPES.activity;
  const TypeIcon = typeConfig.icon;
  const isExam = item.item_type === "exam";

  return (
    <div
      onClick={() => router.push(`/dashboard/${item.subject_id}?item=${item.id}`)}
      className="flex items-start gap-2 p-3 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition cursor-pointer group block"
    >
      {!isExam && (
        <input
          onClick={(e) => e.stopPropagation()}
          type="checkbox"
          checked={isMineDone}
          onChange={onToggleDone}
          className="w-5 h-5 mt-0.5 rounded border-zinc-300 dark:border-zinc-600 accent-zinc-900"
        />
      )}
      {isExam && (
        <div className="w-5 flex justify-center shrink-0">
          <GraduationCap size={16} className={`${typeConfig.color.replace("bg-", "text-")}`} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <TypeIcon size={14} className={`${typeConfig.color.replace("bg-", "text-")} shrink-0`} />
            <span className={`text-[15px] leading-snug ${isMineDone ? "line-through text-zinc-400" : "text-zinc-700 dark:text-zinc-300"} truncate`}>
              {item.text}
            </span>
            {typeConfig !== ITEM_TYPES.activity && !isExam && (
              <span className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium text-white ${typeConfig.color}`}>
                {typeConfig.label.toUpperCase()}
              </span>
            )}
          </div>
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
