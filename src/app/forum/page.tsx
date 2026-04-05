"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getSubject, SUBJECTS } from "@/lib/subjects";
import { Navbar } from "@/components/navbar";
import {
  Plus, MessageSquare, ArrowUpRight, ArrowDownRight, MessageCircle,
  Clock, FileText, BookOpen, Search, Tag, Send, Edit3, Trash2, X,
} from "lucide-react";

// Profile cache
const profileCache = new Map<string, string>();

interface ForumPost {
  id: string;
  subject_id: string | null;
  item_id: string | null;
  title: string;
  body: string | null;
  post_type: "discussion" | "answer" | "resource" | "summary";
  user_id: string;
  created_at: string;
  comment_count?: number;
  item_ref?: { text: string; subject_id: string };
}

interface ForumComment {
  id: string;
  body: string;
  user_id: string;
  created_at: string;
}

const POST_TYPE_CONFIG = {
  discussion: { label: "Discussão", icon: MessageSquare, color: "bg-blue-500" },
  answer: { label: "Resposta", icon: ArrowUpRight, color: "bg-green-500" },
  resource: { label: "Recurso", icon: FileText, color: "bg-purple-500" },
  summary: { label: "Resumo", icon: BookOpen, color: "bg-amber-500" },
};

export default function ForumPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    checkAuth();
    loadPosts();
  }, []);

  const loadPostsWithComments = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("forum_posts")
        .select("*")
        .order("created_at", { ascending: false });

      if (!data) { setPosts([]); setLoading(false); return; }

      const typedData = data as ForumPost[];

      // Get comment counts
      const postIds = typedData.map((p) => p.id);
      const { data: counts } = await supabase
        .from("forum_comments")
        .select("post_id")
        .in("post_id", postIds);

      const countMap: Record<string, number> = {};
      for (const c of (counts ?? [])) {
        countMap[c.post_id] = (countMap[c.post_id] || 0) + 1;
      }

      // Collect user IDs for profiles
      const allUserIds = [
        ...typedData.map((p) => p.user_id),
      ];
      await loadProfiles(allUserIds);

      // Resolve item references
      const itemIds = typedData.filter((p) => p.item_id).map((p) => p.item_id!);
      let itemMap: Record<string, { text: string; subject_id: string }> = {};
      if (itemIds.length > 0) {
        const { data: itemsData } = await supabase.from("items").select("id, text, subject_id").in("id", itemIds);
        itemMap = {};
        for (const i of (itemsData ?? [])) {
          itemMap[i.id] = { text: i.text, subject_id: i.subject_id };
        }
      }

      const postsWithCounts = typedData.map((p) => ({
        ...p,
        comment_count: countMap[p.id] || 0,
        item_ref: p.item_id ? itemMap[p.item_id] : undefined,
      }));
      setPosts(postsWithCounts);
    } catch {
      setPosts([]);
    }
    setLoading(false);
  }, []);

  async function checkAuth() {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUser(user.id);
        const name = user.user_metadata?.name ?? user.email?.split("@")[0] ?? "Usuário";
        setUserName(name);
        profileCache.set(user.id, name);
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
    } catch { /* profiles may not exist yet */ }
  }

  async function loadPosts() {
    await loadPostsWithComments();
  }

  async function handleDeletePost(postId: string) {
    const supabase = createClient();
    await supabase.from("forum_posts").delete().eq("id", postId);
    loadPosts();
  }

  const filteredPosts = posts
    .filter((p) => filter === "all" || p.post_type === filter || (filter === p.subject_id && !!p.subject_id))
    .filter((p) =>
      search.trim() === "" || p.title.toLowerCase().includes(search.toLowerCase()) || (p.body ?? "").toLowerCase().includes(search.toLowerCase())
    );

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Navbar />

      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Fórum</h1>
            <p className="text-sm text-zinc-500 mt-1">Compartilhe respostas, recursos e resumos</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg font-medium text-sm hover:bg-zinc-800 dark:hover:bg-zinc-200 transition"
          >
            <Plus size={16} /> Novo post
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 mb-4 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          <FilterChip label="Todos" active={filter === "all"} onClick={() => setFilter("all")} />
          {Object.entries(POST_TYPE_CONFIG).map(([key, config]) => (
            <FilterChip
              key={key}
              label={config.label}
              active={filter === key}
              onClick={() => setFilter(key)}
              color={filter === key ? config.color : undefined}
            />
          ))}
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar no fórum..."
            className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100 text-sm"
          />
        </div>

        {/* Posts list */}
        {loading ? (
          <p className="text-center py-12 text-zinc-500">Carregando...</p>
        ) : filteredPosts.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <MessageSquare size={40} className="text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-500">Nenhum post ainda</p>
            <p className="text-sm text-zinc-400 mt-1">Seja o primeiro a publicar!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredPosts.map((post) => (
              <ForumPostCard
                key={post.id}
                post={post}
                isOwner={post.user_id === currentUser}
                onDelete={() => handleDeletePost(post.id)}
                onOpen={() => router.push(`/forum/${post.id}`)}
              />
            ))}
          </div>
        )}
      </main>

      {showCreateModal && (
        <CreatePostModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { loadPosts(); setShowCreateModal(false); }}
        />
      )}
    </div>
  );
}

/* -- Sub components -- */

function FilterChip({ label, active, onClick, color }: {
  label: string; active: boolean; onClick: () => void; color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition ${
        active
          ? `${color ?? "bg-zinc-900 dark:bg-zinc-100"} text-white`
          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700"
      }`}
    >
      {label}
    </button>
  );
}

function ForumPostCard({ post, isOwner, onDelete, onOpen }: {
  post: ForumPost; isOwner: boolean; onDelete: () => void; onOpen: () => void;
}) {
  const config = POST_TYPE_CONFIG[post.post_type] ?? POST_TYPE_CONFIG.discussion;
  const Icon = config.icon;
  const subject = post.subject_id ? getSubject(post.subject_id) : null;
  const typeName = profileCache.get(post.user_id) ?? "Usuário";
  const timeAgo = getTimeAgo(post.created_at);

  return (
    <div
      onClick={onOpen}
      className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 hover:shadow-md transition cursor-pointer group"
    >
      <div className="flex items-start gap-3">
        {/* Type badge */}
        <div className={`shrink-0 w-10 h-10 rounded-lg ${config.color} flex items-center justify-center`}>
          <Icon size={18} className="text-white" />
        </div>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">
              {post.title}
            </h3>
            {isOwner && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="shrink-0 p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded opacity-0 group-hover:opacity-100 transition"
              >
                <Trash2 size={14} className="text-zinc-400 hover:text-red-500" />
              </button>
            )}
          </div>

          {/* Body preview */}
          {post.body && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">
              {post.body}
            </p>
          )}

          {/* Meta */}
          <div className="flex items-center gap-3 mt-2 text-xs text-zinc-400">
            <span className="flex items-center gap-1">
              <Tag size={11} /> {typeName}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={11} /> {timeAgo}
            </span>
            {subject && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium text-white ${subject.color}`}>
                {subject.emoji} {subject.name}
              </span>
            )}
            {post.item_ref && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                {(() => { const s = getSubject(post.item_ref?.subject_id); return s ? s.emoji : null; })()}
                {post.item_ref.text.length > 35 ? post.item_ref.text.substring(0, 35) + "..." : post.item_ref.text}
              </span>
            )}
            <span className="flex items-center gap-1">
              <MessageCircle size={11} /> {post.comment_count ?? 0} respostas
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CreatePostModal({
  onClose,
  onCreated,
  defaultItemId,
}: {
  onClose: () => void;
  onCreated: () => void;
  defaultItemId?: string;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [postType, setPostType] = useState<"discussion" | "answer" | "resource" | "summary">("discussion");
  const [subjectId, setSubjectId] = useState("");
  const [itemId, setItemId] = useState(defaultItemId ?? "");
  const [items, setItems] = useState<{ id: string; text: string; subject_id: string }[]>([]);
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [itemSearch, setItemSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (defaultItemId) loadItems();
  }, [defaultItemId]);

  async function loadItems() {
    try {
      const supabase = createClient();
      const { data } = await supabase.from("items").select("id, text, subject_id").order("created_at", { ascending: false });
      if (data) setItems(data as { id: string; text: string; subject_id: string }[]);
    } catch { /* ignore */ }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.from("forum_posts").insert({
        title,
        body: body.trim() || null,
        post_type: postType,
        subject_id: subjectId || null,
        item_id: itemId || null,
        user_id: user.id,
      });
      if (error) { alert(error.message); return; }
      onCreated();
    } catch (err) {
      if (err instanceof Error) alert(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-t-2xl sm:rounded-2xl shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">Novo post</h2>
          <button onClick={onClose} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg">
            <X size={18} className="text-zinc-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Type selector */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Tipo</label>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(POST_TYPE_CONFIG).map(([key, config]) => {
                const Icon = config.icon;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPostType(key as typeof postType)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition ${
                      postType === key
                        ? `${config.color} text-white`
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                    }`}
                  >
                    <Icon size={12} /> {config.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Matéria (opcional)</label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSubjectId("")}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                  subjectId === "" ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
                }`}
              >
                Geral
              </button>
              {SUBJECTS.map((s) => (
                <button key={s.id} type="button" onClick={() => setSubjectId(s.id)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                    subjectId === s.id ? `${s.color} text-white` : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
                  }`}>
                  {s.emoji} {s.name}
                </button>
              ))}
            </div>
          </div>

          {/* Reference Activity */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Referenciar atividade (opcional)</label>
            {itemId ? (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
                <span className="flex-1 text-sm text-zinc-700 dark:text-zinc-300">
                  {(() => {
                    const found = items.find((i) => i.id === itemId);
                    if (!found) return "Atividade referenciada";
                    const subj = SUBJECTS.find((s) => s.id === found.subject_id);
                    return <>{subj ? <span className="mr-1">{subj.emoji}</span> : null}{found.text}</>;
                  })()}
                </span>
                <button type="button" onClick={() => setItemId("")} className="text-xs text-zinc-400 hover:text-red-500 transition">Remover</button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { setShowItemPicker(true); loadItems(); }}
                className="w-full py-2.5 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-600 transition text-sm flex items-center justify-center gap-1.5"
              >
                + Selecionar atividade
              </button>
            )}
          </div>

          {/* Item picker dropdown */}
          {showItemPicker && (
            <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 overflow-hidden">
              <div className="p-2 border-b border-zinc-100 dark:border-zinc-800">
                <input
                  type="text"
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  placeholder="Buscar atividade..."
                  className="w-full px-2 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none"
                  autoFocus
                />
              </div>
              <div className="max-h-48 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800">
                <button
                  type="button"
                  onClick={() => { setItemId(""); setShowItemPicker(false); setItemSearch(""); }}
                  className="w-full px-3 py-2 text-left text-sm text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  Sem atividade
                </button>
                {items
                  .filter((item) => item.text.toLowerCase().includes(itemSearch.toLowerCase()))
                  .map((item) => {
                    const subj = SUBJECTS.find((s) => s.id === item.subject_id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => { setItemId(item.id); setShowItemPicker(false); setItemSearch(""); }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
                      >
                        {subj && <span className="mr-1">{subj.emoji}</span>}
                        <span className="text-zinc-700 dark:text-zinc-300">{item.text}</span>
                      </button>
                    );
                  })}
                {items.length === 0 && (
                  <p className="px-3 py-2 text-sm text-zinc-400">Nenhuma atividade encontrada</p>
                )}
              </div>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Título</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
              placeholder="Ex: Resolução da lista 3..." required />
          </div>

          {/* Body */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Conteúdo</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100 resize-none"
              rows={5}
              placeholder="Escreva seu conteúdo aqui..." />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg font-medium flex items-center justify-center gap-2 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition disabled:opacity-50"
          >
            <Send size={16} /> {submitting ? "Publicando..." : "Publicar"}
          </button>
        </form>
      </div>
    </div>
  );
}

function getTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);

  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(dateStr).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
