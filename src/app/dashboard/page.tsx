"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SUBJECTS } from "@/lib/subjects";
import { Navbar } from "@/components/navbar";
import { CreateModal, ITEM_TYPES } from "@/components/create-modal";
import {
  Clock, AlertTriangle, CheckCircle2, Calendar, User, ChevronDown,
  GraduationCap, FolderOpen, FileText, ChevronRight,
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
  const [doneSet, setDoneSet] = useState<Map<string, Set<string>>>(new Map());
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"all" | "mine" | "pending" | "concluded" | "overdue" | "exams">("all");
  const [showExamPanel, setShowExamPanel] = useState(false);

  // Calendar
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
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
    } catch { router.replace("/"); }
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
      const items = (data as ItemData[]) ?? [];

      setAllItems(items);

      const { data: doneData } = await supabase.from("task_done").select("id, item_id, user_id, done_at");
      const entries = (doneData ?? []) as { item_id: string; user_id: string }[];
      await loadProfiles([
        ...items.map((i) => i.created_by),
        ...entries.map((d) => d.user_id),
      ]);

      const d = new Map<string, Set<string>>();
      for (const e of entries) {
        if (!d.has(e.item_id)) d.set(e.item_id, new Set());
        d.get(e.item_id)!.add(e.user_id);
      }
      setDoneSet(d);
    } catch { setAllItems([]); }
    setLoading(false);
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/");
  }

  // ============================================================
  // Provas NUNCA podem ser concluídas
  // ============================================================
  async function toggleDone(itemId: string) {
    const item = allItems.find((i) => i.id === itemId);
    if (!item) return;
    if (item.item_type === "exam") return; // BLOCKED
    if (!currentUser) return;

    const supabase = createClient();
    const set = doneSet.get(itemId);
    const already = set ? set.has(currentUser) : false;

    if (already) {
      await supabase.from("task_done").delete().eq("item_id", itemId).eq("user_id", currentUser);
    } else {
      await supabase.from("task_done").insert({ item_id: itemId, user_id: currentUser });
    }
    loadItems();
  }

  // ============================================================
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];

  function isMineDone(item: ItemData) {
    if (item.item_type === "exam") return false;
    if (!currentUser) return false;
    return doneSet.get(item.id)?.has(currentUser) ?? false;
  }

  function getDoneNames(item: ItemData): string[] {
    const set = doneSet.get(item.id);
    if (!set) return [];
    return [...set].map((id) => profileCache.get(id) ?? "Usuário");
  }

  // Separate exams from activities/works
  const exams = allItems.filter((i) => i.item_type === "exam" && i.due_date);
  const activities = allItems.filter((i) => i.item_type !== "exam");

  // Stats — SÓ atividades contam
  const pendingCount = activities.filter((i) => !isMineDone(i)).length;
  const doneCount = activities.filter((i) => isMineDone(i)).length;
  const overdueItems = activities.filter((i) => {
    if (!i.due_date || isMineDone(i)) return false;
    return i.due_date < todayStr;
  });
  const todayItems = activities.filter((i) => {
    if (!i.due_date || isMineDone(i)) return false;
    return i.due_date === todayStr;
  });

  // Selected day filter — SÓ atividades
  const selectedDayItems = selectedDay ? activities.filter((i) => i.due_date === selectedDay) : [];
  const selectedDayLabel = selectedDay
    ? new Date(selectedDay + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })
    : null;

  // Filter sidebar
  const filteredItems = (() => {
    switch (activeFilter) {
      case "mine": return activities.filter((i) => i.created_by === currentUser);
      case "pending": return activities.filter((i) => !isMineDone(i));
      case "concluded": return activities.filter((i) => isMineDone(i));
      case "overdue": return overdueItems;
      default: return allItems;
    }
  })();

  // Calendar: week
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

  // Calendar: month
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
      cells.push({ date: prevDate.toISOString().split("T")[0], day: prevDate.getDate(), isCurrent: false, items: allItems.filter((it) => it.due_date === prevDate.toISOString().split("T")[0]) });
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

  function typeColor(itemType: string) {
    return itemType === "exam" ? "bg-red-500" : itemType === "work" ? "bg-purple-500" : "bg-blue-500";
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Navbar />

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Stats — SÓ atividades */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Stat icon={Clock} label="Pendentes" value={pendingCount} active={activeFilter === "pending"} onClick={() => { setActiveFilter(activeFilter === "pending" ? "all" : "pending"); setSelectedDay(null); setShowExamPanel(false); }} />
          <Stat icon={CheckCircle2} label="Conclu&iacute;das" value={doneCount} accent="text-green-600" active={activeFilter === "concluded"} onClick={() => { setActiveFilter(activeFilter === "concluded" ? "all" : "concluded"); setSelectedDay(null); setShowExamPanel(false); }} />
          <Stat icon={AlertTriangle} label="Atrasadas" value={overdueItems.length} accent="text-red-600" active={activeFilter === "overdue"} onClick={() => { setActiveFilter(activeFilter === "overdue" ? "all" : "overdue"); setSelectedDay(null); setShowExamPanel(false); }} />
          <Stat icon={GraduationCap} label="Provas" value={exams.length} accent="text-red-600" active={activeFilter === "exams"} onClick={() => { setActiveFilter("all"); setSelectedDay(null); setShowExamPanel((prev) => !prev); }} />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          {/* Left: list */}
          <div className="space-y-1">
            {showExamPanel ? (
              /* ===== PAINEL DE PROVAS ===== */
              <>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-red-600 dark:text-red-400 flex items-center gap-2">
                    <GraduationCap size={14} /> Provas
                    {exams.length > 0 && <span className="text-xs text-zinc-400">({exams.length})</span>}
                  </h3>
                  <button onClick={() => setShowExamPanel(false)} className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition cursor-pointer">
                    &larr; Voltar aos itens
                  </button>
                </div>
                {exams.length === 0 ? (
                  <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-8 text-center">
                    <p className="text-zinc-500">Nenhuma prova agendada</p>
                  </div>
                ) : (
                  <>
                    {(() => {
                      const upcomingExams = exams.filter((i) => i.due_date >= todayStr);
                      const noDateExams = exams.filter((i) => !i.due_date);
                      const todayExams = upcomingExams.filter((i) => i.due_date === todayStr);
                      const futureExams = upcomingExams.filter((i) => i.due_date > todayStr);
                      const expiredExams = exams.filter((i) => i.due_date && i.due_date < todayStr);
                      return (
                        <>
                          {todayExams.length > 0 && (
                            <CollapsibleSection title="Hoje" count={todayExams.length} accent="text-red-600" defaultOpen>
                              {todayExams.map((item) => <ExamLine key={item.id} item={item} todayStr={todayStr} router={router} />)}
                            </CollapsibleSection>
                          )}
                          {futureExams.length > 0 && (
                            <CollapsibleSection title="Próximas" count={futureExams.length} accent="text-red-600" defaultOpen>
                              {futureExams.map((item) => <ExamLine key={item.id} item={item} todayStr={todayStr} router={router} />)}
                            </CollapsibleSection>
                          )}
                          {noDateExams.length > 0 && (
                            <CollapsibleSection title="Sem data" count={noDateExams.length} accent="text-red-600" defaultOpen>
                              {noDateExams.map((item) => <ExamLine key={item.id} item={item} todayStr={todayStr} router={router} />)}
                            </CollapsibleSection>
                          )}
                          {expiredExams.length > 0 && (
                            <CollapsibleSection title="Encerradas" count={expiredExams.length} defaultOpen={false}>
                              {expiredExams.map((item) => <ExamLine key={item.id} item={item} todayStr={todayStr} router={router} />)}
                            </CollapsibleSection>
                          )}
                        </>
                      );
                    })()}
                  </>
                )}
              </>
            ) : (
            /* ===== LISTA NORMAL (SÓ ATIVIDADES) ===== */
            <>
            {/* Selected day */}
            {selectedDay ? (
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 capitalize">{selectedDayLabel}</span>
                  <button onClick={() => setSelectedDay(null)} className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 flex items-center gap-1">
                    Limpar filtro <ChevronDown size={12} className="rotate-90" />
                  </button>
                </div>
                {selectedDayItems.length === 0 ? (
                  <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-8 text-center">
                    <p className="text-zinc-500">Nenhuma atividade neste dia</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {selectedDayItems.map((item) => (
                      <ItemLine key={item.id} item={item} onToggleDone={() => toggleDone(item.id)} doneNames={getDoneNames(item)} isMineDone={isMineDone} router={router} />
                    ))}
                  </div>
                )}
              </>
            ) : activeFilter === "all" ? (
              <>
                {overdueItems.length > 0 && (
                  <CollapsibleSection title="Atrasadas" count={overdueItems.length} accent="text-red-600" defaultOpen>
                    {overdueItems.map((item) => (
                      <ItemLine key={item.id} item={item} onToggleDone={() => toggleDone(item.id)} doneNames={getDoneNames(item)} isMineDone={isMineDone} router={router} />
                    ))}
                  </CollapsibleSection>
                )}
                {todayItems.length > 0 && (
                  <CollapsibleSection title="Para hoje" count={todayItems.length} defaultOpen>
                    {todayItems.map((item) => (
                      <ItemLine key={item.id} item={item} onToggleDone={() => toggleDone(item.id)} doneNames={getDoneNames(item)} isMineDone={isMineDone} router={router} />
                    ))}
                  </CollapsibleSection>
                )}
                {(() => {
                  const upcoming = activities.filter((i) => i.due_date && !isMineDone(i) && i.due_date >= todayStr).slice(0, 4);
                  if (upcoming.length === 0) return null;
                  return (
                    <CollapsibleSection title="Pr&oacute;ximas" count={upcoming.length} defaultOpen>
                      {upcoming.map((item) => (
                        <ItemLine key={item.id} item={item} onToggleDone={() => toggleDone(item.id)} doneNames={getDoneNames(item)} isMineDone={isMineDone} router={router} />
                      ))}
                    </CollapsibleSection>
                  );
                })()}
                {(() => {
                  const noDates = activities.filter((i) => !i.due_date && !isMineDone(i));
                  if (noDates.length === 0) return null;
                  return (
                    <CollapsibleSection title="Sem data" count={noDates.length} defaultOpen>
                      {noDates.map((item) => (
                        <ItemLine key={item.id} item={item} onToggleDone={() => toggleDone(item.id)} doneNames={getDoneNames(item)} isMineDone={isMineDone} router={router} />
                      ))}
                    </CollapsibleSection>
                  );
                })()}
                {/* Provas — só no painel dedicado */}
                {(() => {
                  const done = activities.filter((i) => isMineDone(i));
                  if (done.length === 0) return null;
                  return (
                    <CollapsibleSection title="Conclu&iacute;das" count={done.length} defaultOpen={false}>
                      {done.map((item) => (
                        <ItemLine key={item.id} item={item} onToggleDone={() => toggleDone(item.id)} doneNames={getDoneNames(item)} isMineDone={isMineDone} router={router} />
                      ))}
                    </CollapsibleSection>
                  );
                })()}
                {pendingCount === 0 && doneCount === 0 && (
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
                    <ItemLine key={item.id} item={item} onToggleDone={() => toggleDone(item.id)} doneNames={getDoneNames(item)} isMineDone={isMineDone} router={router} />
                  ))}
                </div>
              );
            })()}
            </>
            ) /* end showExamPanel conditional */}
          </div>

          {/* Right: calendar */}
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
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800 p-4">
                {weekDays.map((day) => (
                  <div key={day.key} className="py-2 last:pb-0 first:pt-0">
                    <button
                      onClick={() => setSelectedDay(day.key === selectedDay ? null : day.key)}
                      className="flex items-center justify-between w-full group"
                    >
                      <div className={`text-xs font-medium capitalize flex items-center gap-1.5 ${
                        day.isToday
                          ? "text-zinc-900 dark:text-zinc-100 font-bold"
                          : selectedDay === day.key
                          ? "text-zinc-900 dark:text-zinc-100 font-bold"
                          : "text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300"
                      }`}>
                        {day.label}
                      </div>
                      {day.items.length > 0 && (
                        <div className="flex items-center gap-0.5">
                          {day.items.slice(0, 4).map((it) => (
                            <div key={it.id} className={`w-1.5 h-1.5 rounded-full ${typeColor(it.item_type)}`} />
                          ))}
                          {day.items.length > 4 && <span className="text-[9px] text-zinc-400">+{day.items.length - 4}</span>}
                        </div>
                      )}
                    </button>
                    {day.items.length > 0 && (
                      <div className="space-y-1 mt-1 pl-1">
                        {day.items.map((item) => {
                          const mineDone = isMineDone(item);
                          return (
                            <div key={item.id} className="flex items-center gap-2 pl-1">
                              {item.item_type === "exam" ? (
                                <GraduationCap size={12} className="text-red-500 shrink-0" />
                              ) : (
                                <input
                                  type="checkbox"
                                  checked={mineDone}
                                  onChange={(e) => e.stopPropagation()}
                                  onClick={(e) => { e.stopPropagation(); toggleDone(item.id); }}
                                  className="w-3.5 h-3.5 rounded border-zinc-300 dark:border-zinc-600 accent-zinc-900 dark:accent-zinc-100 shrink-0"
                                />
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
                ))}
              </div>
            ) : (
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
                                  className={`text-center py-1 px-0.5 transition ${
                                    isToday
                                      ? "font-bold"
                                      : isSelected
                                      ? "bg-zinc-200 dark:bg-zinc-700 rounded-full"
                                      : "hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full"
                                  } ${cell.isCurrent ? "" : "opacity-30"}`}
                                >
                                  <div className="relative flex flex-col items-center">
                                    <span className="text-[11px]">{cell.day}</span>
                                    {isToday && <div className="w-1 h-1 rounded-full bg-zinc-900 dark:bg-zinc-100 mt-0.5" />}
                                    {hasItems && (
                                      <div className="flex justify-center gap-0.5 mt-0.5">
                                        {cell.items.slice(0, 3).map((item) => (
                                          <div key={item.id} className={`w-1.5 h-1.5 rounded-full ${typeColor(item.item_type)}`} />
                                        ))}
                                      </div>
                                    )}
                                  </div>
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

            {/* Per-subject - SÓ atividades */}
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-2 mb-2">Resumo por mat&eacute;ria</h3>
            <div className="grid grid-cols-4 gap-2">
              {SUBJECTS.map((s) => {
                const count = activities.filter((i) => i.subject_id === s.id && !isMineDone(i)).length;
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

function ItemLine({ item, onToggleDone, doneNames, isMineDone, router }: {
  item: ItemData; onToggleDone: () => void; doneNames: string[]; isMineDone: (item: ItemData) => boolean; router: ReturnType<typeof useRouter>;
}) {
  const subj = SUBJECTS.find((s) => s.id === item.subject_id);
  const typeConfig = ITEM_TYPES[item.item_type as keyof typeof ITEM_TYPES] ?? ITEM_TYPES.activity;
  const TypeIcon = typeConfig.icon;
  const isExam = item.item_type === "exam";
  const mineDone = isMineDone(item);

  return (
    <div
      onClick={() => router.push(`/dashboard/${item.subject_id}?item=${item.id}`)}
      className="flex items-start gap-2 p-3 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition cursor-pointer group block"
    >
      {isExam ? (
        <div className="w-5 flex justify-center shrink-0 mt-0.5">
          <GraduationCap size={16} className="text-red-500" />
        </div>
      ) : (
        <input
          onClick={(e) => e.stopPropagation()}
          type="checkbox"
          checked={mineDone}
          onChange={onToggleDone}
          className="w-5 h-5 mt-0.5 rounded border-zinc-300 dark:border-zinc-600 accent-zinc-900"
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <TypeIcon size={14} className={`${typeConfig.color.replace("bg-", "text-")} shrink-0`} />
            <span className={`text-[15px] leading-snug ${mineDone ? "line-through text-zinc-400" : "text-zinc-700 dark:text-zinc-300"} truncate`}>
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
            <span className={`text-[11px] ${item.due_date < new Date().toISOString().split("T")[0] && !mineDone ? "text-red-500" : "text-zinc-400"}`}>
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

function ExamLine({ item, todayStr, router }: {
  item: ItemData; todayStr: string; router: ReturnType<typeof useRouter>;
}) {
  const subj = SUBJECTS.find((s) => s.id === item.subject_id);
  const isToday = item.due_date === todayStr;

  return (
    <div
      onClick={() => router.push(`/dashboard/${item.subject_id}?item=${item.id}`)}
      className="flex items-start gap-2 p-3 rounded-lg bg-white dark:bg-zinc-900 border border-red-200 dark:border-red-900 hover:bg-red-50 dark:hover:bg-red-950/30 transition cursor-pointer group block"
    >
      <div className="w-5 flex justify-center shrink-0 mt-0.5">
        <GraduationCap size={16} className={`text-red-500 ${isToday ? "animate-pulse" : ""}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[15px] leading-snug font-medium text-zinc-700 dark:text-zinc-300 truncate">
            {item.text}
          </span>
          {subj && (
            <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium text-white ${subj.color}`}>
              {subj.emoji} {subj.name}
            </span>
          )}
        </div>
        {item.description && (
          <p className="text-[11px] text-zinc-400 mt-0.5 truncate">{item.description.substring(0, 60)}</p>
        )}
        <div className="flex items-center gap-2 mt-1 text-[11px]">
          {item.due_date && (
            <span className={`font-medium ${isToday ? "text-red-600 dark:text-red-400" : "text-zinc-400"}`}>
              {isToday ? "Hoje" : new Date(item.due_date + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}