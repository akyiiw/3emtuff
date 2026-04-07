"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getSubject, SUBJECTS } from "@/lib/subjects";
import { Navbar } from "@/components/navbar";
import { useModerator } from "@/lib/use-moderator";
import { Shield } from "lucide-react";
import {
  ArrowLeft, Send, Trash2, MessageSquare, Tag, Clock,
  FileText, BookOpen, ArrowUpRight, Edit2, Edit3, Reply, AlertTriangle, Pin,
} from "lucide-react";
import { MarkdownPreview, profileCache, EditPostModal } from "@/components/forum";
import type { ForumPost } from "@/components/forum";

interface Comment {
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

export default function ForumPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: postId } = use(params);
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const isModerator = useModerator(currentUser);
  const [userName, setUserName] = useState<string>("");
  const [post, setPost] = useState<ForumPost | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentBody, setEditCommentBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  useEffect(() => {
    checkAuth();
    loadPost();
  }, [postId]);

  useEffect(() => {
    if (post) loadComments();
  }, [post]);

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

  async function loadPost() {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data } = await supabase.from("forum_posts").select("*").eq("id", postId).single();
      if (data) {
        const p = data as ForumPost;
        await loadProfiles([p.user_id]);
        // Resolve item reference
        if (p.item_id) {
          const { data: itemData } = await supabase.from("items").select("text, subject_id").eq("id", p.item_id).single();
          if (itemData) p.item_ref = itemData as { text: string; subject_id: string };
        }
        setPost(p);
      }
    } catch {
      setPost(null);
    }
    setLoading(false);
  }

  async function loadComments() {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("forum_comments")
        .select("*")
        .eq("post_id", postId)
        .order("created_at", { ascending: true });

      const loaded = (data ?? []) as Comment[];
      await loadProfiles(loaded.map((c) => c.user_id));
      setComments(loaded);
    } catch {
      setComments([]);
    }
  }

  async function handlePostComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim() || !currentUser) return;
    setSubmitting(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.from("forum_comments").insert({
        post_id: postId,
        body: newComment.trim(),
        user_id: currentUser,
      });
      if (error) { alert(error.message); return; }
      setNewComment("");
      await loadComments();
      // Notify OP
      const { notifyPostComment } = await import("@/lib/notifications");
      await notifyPostComment(postId, currentUser);
    } catch (err) {
      if (err instanceof Error) alert(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteComment(commentId: string) {
    const comment = comments.find((c) => c.id === commentId);
    const isOwnComment = currentUser === comment?.user_id;
    if (isOwnComment) {
      const supabase = createClient();
      await supabase.from("forum_comments").delete().eq("id", commentId);
    } else {
      await fetch(`/api/moderate?table=forum_comments&id=${commentId}&userId=${currentUser}`, { method: "DELETE" });
    }
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  }

  async function handleEditComment(commentId: string) {
    if (!editCommentBody.trim()) return;
    const supabase = createClient();
    await supabase.from("forum_comments").update({ body: editCommentBody.trim() }).eq("id", commentId);
    setEditingCommentId(null);
    setEditCommentBody("");
    await loadComments();
  }

  if (loading) return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Navbar userId={currentUser} />
      <main className="max-w-4xl mx-auto px-4 py-12 text-center">
        <p className="text-zinc-500">Carregando...</p>
      </main>
    </div>
  );

  if (!post) return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Navbar userId={currentUser} />
      <main className="max-w-4xl mx-auto px-4 py-12 text-center">
        <p className="text-zinc-500">Post não encontrado</p>
      </main>
    </div>
  );

  const config = POST_TYPE_CONFIG[post.post_type] ?? POST_TYPE_CONFIG.discussion;
  const Icon = config.icon;
  const subject = post.subject_id ? getSubject(post.subject_id) : null;
  const creatorName = profileCache.get(post.user_id) ?? "Usuário";
  const isPostOwner = post.user_id === currentUser || isModerator;

  async function handleDeletePost() {
    const isOwnPost = currentUser === post?.user_id;
    if (isOwnPost) {
      const supabase = createClient();
      await supabase.from("forum_posts").delete().eq("id", postId);
    } else {
      await fetch(`/api/moderate?table=forum_posts&id=${postId}&userId=${currentUser}`, { method: "DELETE" });
    }
    router.push("/forum");
  }

  async function handleTogglePin() {
    if (!post) return;
    const supabase = createClient();
    await supabase.from("forum_posts").update({ is_pinned: !post.is_pinned }).eq("id", postId);
    loadPost();
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Navbar userId={currentUser} />

      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* Back */}
        <button
          onClick={() => router.push("/forum")}
          className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 mb-4 transition"
        >
          <ArrowLeft size={14} /> Voltar ao fórum
        </button>

        {/* Post detail */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          {/* Header */}
          <div className="p-5 border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-8 h-8 rounded-lg ${config.color} flex items-center justify-center shrink-0`}>
                <Icon size={16} className="text-white" />
              </div>
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{config.label}</span>

              {/* Pin badge */}
              {post.is_pinned && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-[10px] font-bold">
                  <Pin size={10} /> Fixado
                </span>
              )}

              {/* Owner actions */}
              {isPostOwner && (
                <div className="ml-auto flex gap-1">
                  <button
                    onClick={() => setShowEditModal(true)}
                    className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition cursor-pointer"
                    title="Editar post"
                  >
                    <Edit2 size={14} className="text-zinc-400 hover:text-zinc-600" />
                  </button>
                  <button
                    onClick={handleTogglePin}
                    className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition cursor-pointer"
                    title={post.is_pinned ? "Desafixar" : "Fixar"}
                  >
                    <Pin size={14} className={post.is_pinned ? "text-amber-500" : "text-zinc-400"} />
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition cursor-pointer"
                    title="Excluir post"
                  >
                    <Trash2 size={14} className="text-zinc-400 hover:text-red-500" />
                  </button>
                </div>
              )}

              {subject && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium text-white ${subject.color}`}>
                  {subject.emoji} {subject.name}
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{post.title}</h1>
            <div className="flex items-center gap-3 mt-2 text-xs text-zinc-400">
              <span className="flex items-center gap-1"><Tag size={11} /> {creatorName}</span>
              <span className="flex items-center gap-1"><Clock size={11} /> {new Date(post.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
              {post.edited_by && (
                <span className="flex items-center gap-1 text-amber-500 dark:text-amber-400">
                  <Edit2 size={10} /> editado {new Date(post.updated_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit" })}
                </span>
              )}
            </div>
          </div>

          {/* Body (markdown rendered) */}
          {post.body && (
            <div className="p-5">
              <MarkdownPreview content={post.body} />
            </div>
          )}

          {/* Delete Confirmation */}
          {showDeleteConfirm && (
            <div className="mx-5 mb-5 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-3 space-y-2">
              <p className="text-xs font-medium text-red-600 dark:text-red-400 flex items-center gap-1">
                <AlertTriangle size={12} /> Confirmar exclusão
              </p>
              <div className="flex gap-2">
                <button onClick={handleDeletePost}
                  className="flex-1 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition">Apagar post</button>
                <button onClick={() => setShowDeleteConfirm(false)}
                  className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">Cancelar</button>
              </div>
            </div>
          )}

          {/* Referenced Activity */}
          {post.item_ref && post.item_id && (
            <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
              <a
                href={`/dashboard/${post.item_ref.subject_id}?item=${post.item_id}`}
                className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 transition"
              >
                {getSubject(post.item_ref.subject_id) && <span>{getSubject(post.item_ref.subject_id)!.emoji}</span>}
                <span className="font-medium">{post.item_ref.text}</span>
                <ArrowUpRight size={14} className="text-zinc-400 shrink-0" />
              </a>
            </div>
          )}
        </div>

        {/* Comments */}
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-1.5">
            <MessageSquare size={14} /> Respostas ({comments.length})
          </h3>

          {comments.length === 0 ? (
            <div className="text-center py-8 text-zinc-400 text-sm bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
              Nenhuma resposta ainda
            </div>
          ) : (
            <div className="space-y-2 mb-4">
              {comments.map((comment) => {
                const isEditing = editingCommentId === comment.id;
                const name = profileCache.get(comment.user_id) ?? "Usuário";
                const isOwner = comment.user_id === currentUser || isModerator;

                return (
                  <div key={comment.id} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
                          {name}
                        </span>
                        <span className="text-[11px] text-zinc-400">
                          {new Date(comment.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      {isOwner && (
                        <div className="flex gap-1">
                          <button onClick={() => { setEditingCommentId(comment.id); setEditCommentBody(comment.body); }}
                            className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition">
                            <Edit3 size={12} className="text-zinc-400" />
                          </button>
                          <button onClick={() => handleDeleteComment(comment.id)}
                            className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition">
                            <Trash2 size={12} className="text-zinc-400 hover:text-red-500" />
                          </button>
                        </div>
                      )}
                    </div>

                    {isEditing ? (
                      <div className="space-y-2">
                        <textarea value={editCommentBody} onChange={(e) => setEditCommentBody(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100 resize-none"
                          rows={3} />
                        <div className="flex gap-2">
                          <button onClick={() => handleEditComment(comment.id)}
                            className="px-3 py-1 text-xs font-medium text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition">Salvar</button>
                          <button onClick={() => { setEditingCommentId(null); setEditCommentBody(""); }}
                            className="px-3 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{comment.body}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Reply box */}
          <form onSubmit={handlePostComment} className="mt-4 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2 block flex items-center gap-1">
              <Reply size={11} /> Sua resposta
            </label>
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100 resize-none"
              rows={3}
              placeholder="Escreva sua resposta..."
              required
            />
            <div className="flex justify-end mt-2">
              <button
                type="submit"
                disabled={submitting || !newComment.trim()}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition disabled:opacity-50"
              >
                <Send size={14} /> {submitting ? "Enviando..." : "Responder"}
              </button>
            </div>
          </form>
        </div>
      </main>

      {showEditModal && post && (
        <EditPostModal
          post={post}
          onClose={() => setShowEditModal(false)}
          onEdited={() => { setShowEditModal(false); loadPost(); }}
          userId={currentUser}
        />
      )}
    </div>
  );
}
