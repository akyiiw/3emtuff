"use client";

import { useEffect, use, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getSubject, SUBJECTS } from "@/lib/subjects";
import { Navbar } from "@/components/navbar";
import { CreateModal, ITEM_TYPES } from "@/components/create-modal";
import {
  Calendar, ExternalLink, LinkIcon, User,
  CheckCircle2, Undo2, Trash2, AlertTriangle, Edit2, Check,
  GraduationCap, FolderOpen, FileText, MessageSquare,
} from "lucide-react";

declare global {
  interface Window { __profileCache?: Map<string, string>; }
}
const profileCache = new Map<string, string>();

interface Item {
  id: string;
  text: string;
  description: string | null;
  due_date: string | null;
  created_by: string;
  subject_id: string;
  item_type: string;
}

interface LinkEntry {
  id: string;
  url: string;
  label: string | null;
}

interface DoneEntry {
  id: string;
  user_id: string;
}

export default function SubjectPage({ params }: { params: Promise<{ subject: string }> }) {
  const { subject: subjectId } = use(params);
  const searchParams = useSearchParams();
  const router = useRouter();
  const subject = getSubject(subjectId);

  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Done status
  const [doneMap, setDoneMap] = useState<Record<string, DoneEntry[]>>({});

  // Selected item detail
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [itemLinks, setItemLinks] = useState<LinkEntry[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [forumMentions, setForumMentions] = useState<{ id: string; title: string; post_type: string }[]>([]);

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteCheck, setDeleteCheck] = useState(false);

  useEffect(() => { checkAuth(); loadItems(); }, [subjectId]);

  async function checkAuth() {
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

  async function loadProfiles(userIds: string[]) {
    const missing = userIds.filter((id) => id && !profileCache.has(id));
    if (missing.length === 0) return;
    try {
      const supabase = createClient();
      const { data } = await supabase.from("profiles").select("id, name").in("id", [...new Set(missing)]);
      for (const p of (data ?? [])) profileCache.set(p.id, p.name);
    } catch { /* profiles table may not exist yet */ }
  }

  async function loadItems() {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("items")
        .select("*")
        .eq("subject_id", subjectId)
        .order("due_date", { ascending: true });
      if (data) {
        let loaded = data as Item[];

        // Auto-delete provas que já passaram
        const todayStr = new Date().toISOString().split("T")[0];
        const expiredIds = loaded.filter((i) => i.item_type === "exam" && i.due_date && i.due_date < todayStr).map((i) => i.id);
        if (expiredIds.length > 0) {
          await supabase.from("items").delete().in("id", expiredIds);
          loaded = loaded.filter((i) => !expiredIds.includes(i.id));
        }

        setItems(loaded);

        // Load done + profiles
        const { data: doneData } = await supabase.from("task_done").select("id, item_id, user_id, done_at");
        const doneEntries = (doneData ?? []) as { item_id: string; user_id: string }[];
        const allUserIds = [
          ...loaded.map((i) => i.created_by),
          ...doneEntries.map((d) => d.user_id),
        ];
        await loadProfiles(allUserIds);

        const map: Record<string, DoneEntry[]> = {};
        for (const d of (doneData ?? [])) {
          if (!map[d.item_id]) map[d.item_id] = [];
          map[d.item_id].push(d);
        }
        setDoneMap(map);
      }
    } catch {
      setItems([]);
    }
    setLoading(false);
  }

  const loadItemDetailFromUrl = useCallback((id: string | null) => {
    if (id) {
      loadItemDetail(id);
    } else {
      setSelectedItem(null);
      setItemLinks([]);
      setEditMode(false);
      setShowDeleteConfirm(false);
      setDeleteCheck(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const itemId = searchParams.get("item");
  useEffect(() => {
    loadItemDetailFromUrl(itemId);
  }, [itemId, loadItemDetailFromUrl]);

  async function loadItemDetail(id: string) {
    const supabase = createClient();
    const { data: item } = await supabase.from("items").select("*").eq("id", id).single();
    if (item) {
      setSelectedItem(item as Item);
      const { data: links } = await supabase.from("item_links").select("*").eq("item_id", id);
      setItemLinks((links ?? []) as LinkEntry[]);
      setDeleteCheck(false);
      setShowDeleteConfirm(false);
      setEditMode(false);
      // Load forum mentions
      const { data: mentions } = await supabase
        .from("forum_posts")
        .select("id, title, post_type")
        .eq("item_id", id);
      setForumMentions((mentions ?? []) as { id: string; title: string; post_type: string }[]);
    } else {
      setForumMentions([]);
    }
  }

  function isDoneByUser(itemId: string, userId: string) {
    return (doneMap[itemId] ?? []).some((d) => d.user_id === userId);
  }

  function getDoneListForItem(itemId: string): { userId: string; name: string }[] {
    return (doneMap[itemId] ?? []).map((d) => ({
      userId: d.user_id,
      name: profileCache.get(d.user_id) ?? "Usuário",
    }));
  }

  async function toggleDone(itemId: string) {
    if (!currentUser || !userName) return;
    const supabase = createClient();
    const already = isDoneByUser(itemId, currentUser);
    if (already) {
      await supabase.from("task_done").delete().eq("item_id", itemId).eq("user_id", currentUser);
    } else {
      await supabase.from("task_done").insert({ item_id: itemId, user_id: currentUser });
    }
    loadItems();
  }

  async function handleDelete() {
    if (!selectedItem || !deleteCheck) return;
    const supabase = createClient();
    const { error } = await supabase.from("items").delete().eq("id", selectedItem.id);
    if (error) { alert("Erro ao apagar: " + error.message); return; }
    setSelectedItem(null);
    setItemLinks([]);
    setShowDeleteConfirm(false);
    setDeleteCheck(false);
    setEditMode(false);
    router.replace(`/dashboard/${subjectId}`);
    loadItems();
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];

  const overdue = items.filter((i) => i.due_date && i.due_date < todayStr && !isDoneByUser(i.id, currentUser ?? "") && i.item_type !== "exam");
  const upcoming = items.filter((i) => i.due_date && i.due_date >= todayStr && !isDoneByUser(i.id, currentUser ?? "") && i.item_type !== "exam");
  const noDate = items.filter((i) => !i.due_date && !isDoneByUser(i.id, currentUser ?? "") && i.item_type !== "exam");
  const doneItems = items.filter((i) => isDoneByUser(i.id, currentUser ?? ""));
  const exams = items.filter((i) => i.item_type === "exam");

  // Subject accent color
  const colorClass = subject?.color ?? "bg-zinc-500";
  const textCol = subject?.textCol ?? "text-zinc-500";
  const borderAccent = subject?.accent ?? "border-zinc-500";

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Navbar />

      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className={`mb-6 p-5 rounded-2xl border-l-4 ${borderAccent} bg-white dark:bg-zinc-900 shadow-sm`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{subject?.emoji ?? "📚"}</span>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{subject?.name ?? subjectId}</h1>
            </div>
            <span className={`text-sm font-medium ${textCol}`}>
              {items.length - doneItems.length} pendente{items.length - doneItems.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-[1fr_340px]">
          <div>
            <button onClick={() => setShowModal(true)} className="w-full mb-6 py-3.5 border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition flex items-center justify-center gap-2">
              + Adicionar item
            </button>

            {loading ? (
              <p className="text-center py-8 text-zinc-500">Carregando...</p>
            ) : items.length === 0 ? (
              <div className="text-center py-16 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
                <p className="text-zinc-500">Nenhum item aqui ainda</p>
              </div>
            ) : (
              <div className="space-y-4">
                {exams.length > 0 && (
                  <Section title="Provas" count={exams.length} accent="text-red-600" defaultOpen>
                    {exams.map((item) => (
                      <ItemCard key={item.id} item={item} active={item.id === selectedItem?.id}
                        doneByMe={false} doneList={[]}
                        onClick={() => router.push(`/dashboard/${subjectId}?item=${item.id}`)}
                        isExam />
                    ))}
                  </Section>
                )}
                {overdue.length > 0 && (
                  <Section title="Atrasadas" count={overdue.length} accent="text-red-600" defaultOpen>
                    {overdue.map((item) => (
                      <ItemCard key={item.id} item={item} active={item.id === selectedItem?.id}
                        doneByMe={isDoneByUser(item.id, currentUser ?? "")} doneList={getDoneListForItem(item.id)}
                        onClick={() => router.push(`/dashboard/${subjectId}?item=${item.id}`)}
                        onToggle={() => toggleDone(item.id)} />
                    ))}
                  </Section>
                )}
                {upcoming.length > 0 && (
                  <Section title="Próximas" count={upcoming.length} defaultOpen>
                    {upcoming.map((item) => (
                      <ItemCard key={item.id} item={item} active={item.id === selectedItem?.id}
                        doneByMe={isDoneByUser(item.id, currentUser ?? "")} doneList={getDoneListForItem(item.id)}
                        onClick={() => router.push(`/dashboard/${subjectId}?item=${item.id}`)}
                        onToggle={() => toggleDone(item.id)} />
                    ))}
                  </Section>
                )}
                {noDate.length > 0 && (
                  <Section title="Sem data" count={noDate.length} defaultOpen>
                    {noDate.map((item) => (
                      <ItemCard key={item.id} item={item} active={item.id === selectedItem?.id}
                        doneByMe={isDoneByUser(item.id, currentUser ?? "")} doneList={getDoneListForItem(item.id)}
                        onClick={() => router.push(`/dashboard/${subjectId}?item=${item.id}`)}
                        onToggle={() => toggleDone(item.id)} />
                    ))}
                  </Section>
                )}
                {doneItems.length > 0 && (
                  <Section title="Conclu&iacute;das" count={doneItems.length} defaultOpen={false}>
                    {doneItems.map((item) => (
                      <ItemCard key={item.id} item={item} active={item.id === selectedItem?.id}
                        doneByMe={isDoneByUser(item.id, currentUser ?? "")} doneList={getDoneListForItem(item.id)}
                        onClick={() => router.push(`/dashboard/${subjectId}?item=${item.id}`)}
                        onToggle={() => toggleDone(item.id)} />
                    ))}
                  </Section>
                )}
              </div>
            )}
          </div>

          <div>
            {selectedItem ? (
              <div className="sticky top-16 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
                <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
                  <h2 className="font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">{selectedItem.text}</h2>
                  <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-medium text-white ${colorClass}`}>
                    {subject?.emoji} {subject?.name ?? ""}
                  </span>
                </div>

                <div className="p-4 space-y-4">
                  <div className="flex gap-2">
                    {selectedItem.item_type !== "exam" && (
                      <>
                        {isDoneByUser(selectedItem.id, currentUser ?? "") ? (
                          <button onClick={() => toggleDone(selectedItem.id)} className="flex-1 py-2 text-xs font-medium text-green-600 bg-green-50 dark:bg-green-900/20 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition flex items-center justify-center gap-1">
                            <Undo2 size={12} /> Reabrir
                          </button>
                        ) : (
                          <button onClick={() => toggleDone(selectedItem.id)} className="flex-1 py-2 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition flex items-center justify-center gap-1">
                            <CheckCircle2 size={12} /> Concluir
                          </button>
                        )}
                      </>
                    )}
                    <button onClick={() => setEditMode(true)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition" title="Editar">
                      <Edit2 size={14} className="text-zinc-400" />
                    </button>
                    {!showDeleteConfirm && (
                      <button onClick={() => setShowDeleteConfirm(true)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition" title="Excluir">
                        <Trash2 size={14} className="text-zinc-400" />
                      </button>
                    )}
                  </div>

                  {showDeleteConfirm && (
                    <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-3 space-y-2">
                      <p className="text-xs font-medium text-red-600 dark:text-red-400 flex items-center gap-1">
                        <AlertTriangle size={12} /> Confirmar exclusão
                      </p>
                      <label className="flex items-start gap-2 text-xs text-zinc-600 dark:text-zinc-400 cursor-pointer">
                        <input type="checkbox" checked={deleteCheck} onChange={(e) => setDeleteCheck(e.target.checked)}
                          className="w-4 h-4 mt-0.5 rounded border-zinc-300 dark:border-zinc-600 accent-red-600" />
                        Tenho certeza que quero apagar esta atividade
                      </label>
                      <div className="flex gap-2">
                        <button onClick={handleDelete} disabled={!deleteCheck}
                          className="flex-1 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed">Apagar</button>
                        <button onClick={() => { setShowDeleteConfirm(false); setDeleteCheck(false); }}
                          className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">Cancelar</button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3 pt-2">
                    <Detail label="Criado por">
                      <User size={12} className="shrink-0" />
                      {profileCache.get(selectedItem.created_by) ?? "Usuário"}
                    </Detail>

                    {selectedItem.due_date && (
                      <Detail label="Data de entrega">
                        <Calendar size={12} className="shrink-0" />
                        {new Date(selectedItem.due_date + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
                      </Detail>
                    )}

                    {selectedItem.description && (
                      <div>
                        <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-1">Descrição</p>
                        <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">{selectedItem.description}</p>
                      </div>
                    )}

                    {(() => {
                      const doneList = getDoneListForItem(selectedItem.id);
                      if (doneList.length === 0 || selectedItem.item_type === "exam") return null;
                      return (
                        <div>
                          <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-1.5">Conclu&iacute;do por</p>
                          <div className="flex flex-wrap gap-1.5">
                            {doneList.map((d) => (
                              <span key={d.userId} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400">
                                <Check size={10} /> {d.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {itemLinks.length > 0 && (
                      <div>
                        <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                          <LinkIcon size={12} /> Links
                        </p>
                        <div className="space-y-1">
                          {itemLinks.map((link) => (
                            <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-2 p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-600 transition group truncate">
                              <ExternalLink size={12} className="text-zinc-400 shrink-0" />
                              <span className="text-sm text-zinc-700 dark:text-zinc-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate">{link.label ?? link.url}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {forumMentions.length > 0 && (
                      <div>
                        <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                          <MessageSquare size={12} /> Menções no fórum
                        </p>
                        <div className="space-y-1">
                          {forumMentions.map((mention) => (
                            <a key={mention.id} href={`/forum/${mention.id}`}
                              className="flex items-center gap-2 p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-600 transition group truncate">
                              <MessageSquare size={12} className="text-zinc-400 shrink-0" />
                              <span className="text-sm text-zinc-700 dark:text-zinc-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate">{mention.title}</span>
                              <span className="shrink-0 text-[10px] text-zinc-400">→</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="sticky top-16 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-8 text-center">
                <p className="text-sm text-zinc-400">Clique em uma atividade para ver os detalhes</p>
              </div>
            )}
          </div>
        </div>
      </main>

      <CreateModal
        open={showModal || editMode}
        onClose={() => { setShowModal(false); setEditMode(false); }}
        onSave={() => { loadItems(); setShowModal(false); setEditMode(false); }}
        defaultSubject={subjectId}
        editItem={editMode && selectedItem ? {
          id: selectedItem.id, text: selectedItem.text, description: selectedItem.description,
          due_date: selectedItem.due_date, subject_id: selectedItem.subject_id,
          item_type: selectedItem.item_type,
          links: itemLinks.map((l) => ({ id: l.id, url: l.url, label: l.label ?? "" })),
        } : null}
      />
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-1">{label}</p>
      <div className="flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">{children}</div>
    </div>
  );
}

function Section({ title, count, children, accent, defaultOpen }: {
  title: string; count: number; children: React.ReactNode; accent?: string; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  return (
    <div className="mb-2">
      <button onClick={() => setOpen(!open)} className={`text-sm font-semibold mb-1 flex items-center justify-between w-full py-1 ${accent ?? "text-zinc-900 dark:text-zinc-100"}`}>
        <span>{title} <span className="text-xs text-zinc-400">({count})</span></span>
        <span className="text-xs text-zinc-400">{open ? "▾" : "▸"}</span>
      </button>
      {open && <div className="space-y-1.5">{children}</div>}
    </div>
  );
}

function ItemCard({ item, active, onClick, onToggle, doneByMe, doneList, isExam }: {
  item: Item; active: boolean; onClick: () => void; onToggle?: () => void;
  doneByMe: boolean; doneList: { userId: string; name: string }[];
  isExam?: boolean;
}) {
  const subj = getSubject(item.subject_id);
  const dueFormatted = item.due_date
    ? new Date(item.due_date + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
    : null;
  const isOverdue = item.due_date && !doneByMe && item.due_date < new Date().toISOString().split("T")[0];
  const stripeColor = subj?.color?.replace("bg-", "border-") ?? "border-zinc-400";
  const typeConfig = ITEM_TYPES[item.item_type as keyof typeof ITEM_TYPES] ?? ITEM_TYPES.activity;
  const TypeIcon = typeConfig.icon;

  return (
    <div onClick={onClick}
      className={`rounded-lg border-l-4 p-4 transition cursor-pointer flex items-start gap-3 ${
        active
          ? `bg-zinc-100 dark:bg-zinc-800 ${stripeColor} border-zinc-300 dark:border-zinc-600`
          : `bg-white dark:bg-zinc-900 ${stripeColor} border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50`
      }`}
    >
      {isExam ? (
        <div className="w-5 flex justify-center shrink-0 mt-0.5">
          <GraduationCap size={16} className="text-red-500" />
        </div>
      ) : (
        <input type="checkbox" checked={doneByMe} onClick={(e) => e.stopPropagation()} onChange={onToggle}
          className="w-5 h-5 mt-0.5 rounded border-zinc-300 dark:border-zinc-600 accent-zinc-900 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <TypeIcon size={14} className={`${typeConfig.color.replace("bg-", "text-")} shrink-0`} />
          <p className={`text-[15px] leading-snug ${doneByMe ? "line-through text-zinc-400" : "text-zinc-700 dark:text-zinc-300"} truncate flex-1`}>
            {item.text}
          </p>
          {item.item_type !== "activity" && (
            <span className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium text-white ${typeConfig.color}`}>
              {typeConfig.label.toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1.5">
          {dueFormatted && (
            <span className={`text-[11px] font-medium ${isOverdue ? "text-red-500" : "text-zinc-400"}`}>{dueFormatted}</span>
          )}
          <span className="flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            <User size={10} /> {profileCache.get(item.created_by) ?? "Usuário"}
          </span>
        </div>
        {doneList.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {doneList.map((d) => (
              <span key={d.userId} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400">
                <Check size={8} /> {d.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
