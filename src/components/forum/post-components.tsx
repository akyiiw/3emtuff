import {
  MessageSquare, ArrowUpRight, FileText, BookOpen, Tag, Clock,
  MessageCircle, Trash2, X, Send,
} from "lucide-react";
import { getSubject, SUBJECTS } from "@/lib/subjects";
import { createClient } from "@/lib/supabase/client";
import { useState, useEffect, useMemo } from "react";

// --- Configurações e Tipos ---

export const POST_TYPE_CONFIG = {
  discussion: { label: "Discussão", icon: MessageSquare, color: "bg-blue-500" },
  answer: { label: "Resposta", icon: ArrowUpRight, color: "bg-green-500" },
  resource: { label: "Recurso", icon: FileText, color: "bg-purple-500" },
  summary: { label: "Resumo", icon: BookOpen, color: "bg-amber-500" },
} as const;

export interface ForumPost {
  id: string;
  subject_id: string | null;
  item_id: string | null;
  title: string;
  body: string | null;
  post_type: keyof typeof POST_TYPE_CONFIG;
  user_id: string;
  created_at: string;
  comment_count?: number;
  item_ref?: { text: string; subject_id: string };
}

const profileCache = new Map<string, string>();
export { profileCache };

// --- Utilitários ---

export function getTimeAgo(dateStr: string): string {
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

// --- Componentes ---

interface FilterChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: string;
}

export function FilterChip({ label, active, onClick, color }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition cursor-pointer ${
        active
          ? `${color ?? "bg-zinc-900 dark:bg-zinc-100"} text-white`
          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700"
      }`}
    >
      {label}
    </button>
  );
}

export function ForumPostCard({ post, isOwner, onDelete, onOpen }: { 
  post: ForumPost; isOwner: boolean; onDelete: () => void; onOpen: () => void 
}) {
  const config = POST_TYPE_CONFIG[post.post_type] ?? POST_TYPE_CONFIG.discussion;
  const Icon = config.icon;
  const subject = post.subject_id ? getSubject(post.subject_id) : null;
  const userName = profileCache.get(post.user_id) ?? "Usuário";
  
  // Resgata emoji do item referenciado de forma segura
  const itemEmoji = useMemo(() => {
    if (!post.item_ref?.subject_id) return null;
    return getSubject(post.item_ref.subject_id)?.emoji;
  }, [post.item_ref]);

  return (
    <div
      onClick={onOpen}
      className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 
      hover:shadow-md transition cursor-pointer group"
    >
      <div className="flex items-start gap-3">
        <div className={`shrink-0 w-10 h-10 rounded-lg ${config.color} flex items-center justify-center shadow-sm`}>
          <Icon size={18} className="text-white" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 leading-snug truncate">
              {post.title}
            </h3>
            {isOwner && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="shrink-0 p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded opacity-0 
                group-hover:opacity-100 transition-opacity"
              >
                <Trash2 size={14} className="text-zinc-400 hover:text-red-500" />
              </button>
            )}
          </div>

          {post.body && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">
              {post.body}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-3 text-xs text-zinc-400">
            <span className="flex items-center gap-1">
              <Tag size={11} /> {userName}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={11} /> {getTimeAgo(post.created_at)}
            </span>
            
            {subject && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium text-white ${subject.color}`}>
                {subject.emoji} {subject.name}
              </span>
            )}

            {post.item_ref && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium 
              bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 max-w-50 truncate">
                {itemEmoji} {post.item_ref.text}
              </span>
            )}

            <span className="flex items-center gap-1 ml-auto">
              <MessageCircle size={11} /> {post.comment_count ?? 0}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface CreatePostModalProps {
  onClose: () => void;
  onCreated: () => void;
  defaultItemId?: string;
}

export function CreatePostModal({ onClose, onCreated, defaultItemId }: CreatePostModalProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [postType, setPostType] = useState<keyof typeof POST_TYPE_CONFIG>("discussion");
  const [subjectId, setSubjectId] = useState("");
  const [itemId, setItemId] = useState(defaultItemId ?? "");
  const [items, setItems] = useState<{ id: string; text: string; subject_id: string }[]>([]);
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [itemSearch, setItemSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Carrega itens apenas quando o picker abre ou se houver um default
  useEffect(() => {
    if (showItemPicker || defaultItemId) {
      loadItems();
    }
  }, [showItemPicker, defaultItemId]);

  async function loadItems() {
    try {
      const supabase = createClient();
      const { data, error } = await supabase.from("items").select("id, text, subject_id").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      if (data) setItems(data);
    } catch (err) {
      console.error("Erro ao carregar itens:", err);
    }
  }

  const filteredItems = items.filter(item => 
    item.text.toLowerCase().includes(itemSearch.toLowerCase())
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || submitting) return;
    setSubmitting(true);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { error } = await supabase.from("forum_posts").insert({
        title: title.trim(),
        body: body.trim() || null,
        post_type: postType,
        subject_id: subjectId || null,
        item_id: itemId || null,
        user_id: user.id,
      });

      if (error) throw error;
      onCreated();
    } catch (err: any) {
      alert(err.message || "Erro ao criar post");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-100 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-zinc-950/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-lg bg-white dark:bg-zinc-900 border border-zinc-200 
      dark:border-zinc-800 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">Novo post</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition">
            <X size={18} className="text-zinc-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-5 overflow-y-auto">
          {/* Tipo de Post */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Tipo de Post</label>
            <div className="flex flex-wrap gap-2">
              {(Object.entries(POST_TYPE_CONFIG) as [keyof typeof POST_TYPE_CONFIG, any][]).map(([key, config]) => {
                const Icon = config.icon;
                const isActive = postType === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPostType(key)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium transition ${
                      isActive ? `${config.color} text-white` : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200"
                    }`}
                  >
                    <Icon size={14} /> {config.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Matéria */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Matéria</label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSubjectId("")}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                  subjectId === "" ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
                }`}
              >
                Geral
              </button>
              {SUBJECTS.map((s) => (
                <button 
                  key={s.id} 
                  type="button" 
                  onClick={() => setSubjectId(s.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                    subjectId === s.id ? `${s.color} text-white` : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
                  }`}
                >
                  {s.emoji} {s.name}
                </button>
              ))}
            </div>
          </div>

          {/* Referência de Atividade */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Referenciar Atividade</label>
            {itemId ? (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
                <span className="flex-1 text-sm text-zinc-700 dark:text-zinc-300 truncate">
                  {(() => {
                    const found = items.find((i) => i.id === itemId);
                    if (!found) return "Atividade selecionada";
                    const subj = getSubject(found.subject_id);
                    return <>{subj?.emoji} {found.text}</>;
                  })()}
                </span>
                <button type="button" onClick={() => setItemId("")} className="text-xs font-medium text-red-500 hover:underline">Remover</button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowItemPicker(!showItemPicker)}
                className="w-full py-3 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-400 hover:border-zinc-400 transition text-sm flex items-center justify-center gap-2"
              >
                + Selecionar atividade do curso
              </button>
            )}

            {showItemPicker && (
              <div className="mt-2 border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden shadow-inner">
                <input
                  type="text"
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  placeholder="Filtrar atividades..."
                  className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700 outline-none text-sm"
                />
                <div className="max-h-40 overflow-y-auto bg-white dark:bg-zinc-900">
                  {filteredItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => { setItemId(item.id); setShowItemPicker(false); setItemSearch(""); }}
                      className="w-full px-4 py-2.5 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 border-b border-zinc-100 dark:border-zinc-800 last:border-0"
                    >
                      {getSubject(item.subject_id)?.emoji} {item.text}
                    </button>
                  ))}
                  {filteredItems.length === 0 && (
                    <p className="p-4 text-center text-xs text-zinc-400">Nenhuma atividade encontrada.</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Inputs de Texto */}
          <div className="space-y-4">
            <input 
              type="text" 
              value={title} 
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-zinc-500 outline-none transition"
              placeholder="Título do post" 
              required 
            />

            <textarea 
              value={body} 
              onChange={(e) => setBody(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-zinc-500 outline-none transition resize-none"
              rows={4}
              placeholder="Descreva sua dúvida, recurso ou resumo..." 
            />
          </div>

          <button
            type="submit"
            disabled={submitting || !title.trim()}
            className="w-full py-3.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Publicando..." : <><Send size={18} /> Publicar no Fórum</>}
          </button>
        </form>
      </div>
    </div>
  );
}