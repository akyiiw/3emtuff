"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getSubject, SUBJECTS } from "@/lib/subjects";
import { Navbar } from "@/components/navbar";
import { Plus, MessageSquare, Search } from "lucide-react";
import {
  FilterChip, ForumPostCard, CreatePostModal, EditPostModal, POST_TYPE_CONFIG, profileCache,
} from "@/components/forum";
import type { ForumPost } from "@/components/forum";

export default function ForumPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingPost, setEditingPost] = useState<ForumPost | null>(null);

  function handleOpenEdit(post: ForumPost) {
    setEditingPost(post);
    setShowEditModal(true);
  }

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
        const { data: prof } = await supabase.from("profiles").select("id, display_name").eq("id", user.id).single();
        const name = prof?.display_name ?? user.user_metadata?.name ?? user.email?.split("@")[0] ?? "Usuário";
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
      const { data } = await supabase.from("profiles").select("id, display_name").in("id", [...new Set(missing)]);
      for (const p of (data ?? [])) profileCache.set(p.id, p.display_name ?? "Usuário");
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

  async function handleTogglePin(postId: string) {
    const post = posts.find((p) => p.id === postId);
    if (!post) return;
    const supabase = createClient();
    await supabase.from("forum_posts").update({ is_pinned: !post.is_pinned }).eq("id", postId);
    loadPosts();
  }

  const filteredPosts = posts
    .filter((p) => {
      if (filter === "all") return true;
      if (p.post_type === filter) return true;
      if (filter === p.subject_id && !!p.subject_id) return true;
      return false;
    })
    .filter((p) => {
      if (subjectFilter !== "all" && p.subject_id !== subjectFilter) return false;
      return true;
    })
    .filter((p) =>
      search.trim() === "" || p.title.toLowerCase().includes(search.toLowerCase()) || (p.body ?? "").toLowerCase().includes(search.toLowerCase())
    );

  // Separates pinned and regular posts — always render pinned first
  const pinnedPosts = filteredPosts.filter((p) => p.is_pinned);
  const regularPosts = filteredPosts.filter((p) => !p.is_pinned);
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Navbar userId={currentUser} />

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

        {/* Subject filters */}
        <div className="flex items-center gap-2 mb-4 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          <FilterChip label="Todas" active={subjectFilter === "all"} onClick={() => setSubjectFilter("all")} />
          {SUBJECTS.map((s) => (
            <FilterChip
              key={s.id}
              label={`${s.emoji} ${s.name}`}
              active={subjectFilter === s.id}
              onClick={() => setSubjectFilter(subjectFilter === s.id ? "all" : s.id)}
              color={subjectFilter === s.id ? s.color : undefined}
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
            {/* Pinned posts */}
            {pinnedPosts.length > 0 && (
              <>
                <div className="space-y-3">
                  {pinnedPosts.map((post) => (
                    <ForumPostCard
                      key={post.id}
                      post={post}
                      isOwner={post.user_id === currentUser}
                      onDelete={() => handleDeletePost(post.id)}
                      onOpen={() => router.push(`/forum/${post.id}`)}
                      onTogglePin={() => handleTogglePin(post.id)}
                      onEdit={() => handleOpenEdit(post)}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-3 py-2">
                  <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800" />
                  <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Recentes</span>
                  <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800" />
                </div>
              </>
            )}

            {/* Regular posts */}
            {regularPosts.map((post) => (
              <ForumPostCard
                key={post.id}
                post={post}
                isOwner={post.user_id === currentUser}
                onDelete={() => handleDeletePost(post.id)}
                onOpen={() => router.push(`/forum/${post.id}`)}
                onTogglePin={() => handleTogglePin(post.id)}
                onEdit={() => handleOpenEdit(post)}
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

      {showEditModal && editingPost && (
        <EditPostModal
          post={editingPost}
          onClose={() => { setShowEditModal(false); setEditingPost(null); }}
          onEdited={() => { loadPosts(); setShowEditModal(false); setEditingPost(null); }}
          userId={currentUser}
        />
      )}
    </div>
  );
}

