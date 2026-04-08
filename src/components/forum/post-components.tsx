import {
  MessageSquare, ArrowUpRight, FileText, BookOpen, Tag, Clock,
  MessageCircle, Trash2, X, Send, Pin, Edit2, AlertTriangle,
} from "lucide-react";
import { getSubject, SUBJECTS } from "@/lib/subjects";
import { createClient } from "@/lib/supabase/client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { marked } from "marked";

// Import DOMPurify — works in client components at runtime
import DOMPurify from "dompurify";

// --- Configurações e Tipos ---

export const POST_TYPE_CONFIG = {
  discussion: { label: "Discussão", icon: MessageSquare, color: "bg-blue-500" },
  answer: { label: "Resposta", icon: ArrowUpRight, color: "bg-green-500" },
  resource: { label: "Recurso", icon: FileText, color: "bg-purple-500" },
  summary: { label: "Resumo", icon: BookOpen, color: "bg-amber-500" },
} as const;

// Configure marked for GFM
marked.setOptions({ breaks: true, gfm: true });

// Sanitize HTML for safe rendering
function sanitize(html: string): string {
  if (typeof window === "undefined") return "";
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["p","br","strong","em","u","s","del","blockquote","code","pre","ul","ol","li","a","h1","h2","h3","h4","h5","h6","hr"],
    ALLOWED_ATTR: ["href","target","rel","title"],
  });
}

// Markdown → safe HTML
export function markdownToHtml(md: string): string {
  if (!md.trim()) return "";
  const raw = marked.parse(md) as string;
  return sanitize(raw);
}

// Insert markdown syntax into a controlled React textarea
export function insertMarkdown(textarea: HTMLTextAreaElement | null, value: string, setValue: (v: string) => void, before: string, after = "") {
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = value.substring(start, end);

  let inserted: string;
  if ((before === "- " || before === "1. ") && selected.includes("\n")) {
    const lines = selected.split("\n");
    inserted = lines.map((l, i) => {
      const clean = l.replace(/^(\d+\. |- )?/, "");
      return before === "1. " ? `${i + 1}. ${clean}` : `- ${clean}`;
    }).join("\n");
  } else {
    inserted = before + selected + after;
  }

  setValue(value.substring(0, start) + inserted + value.substring(end));

  // Restore cursor position after React re-renders
  setTimeout(() => {
    textarea.focus();
    const newPos = start + inserted.length;
    if (selected) {
      textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
    } else {
      textarea.setSelectionRange(newPos, newPos);
    }
  }, 0);
}

export interface ForumPost {
  id: string;
  subject_id: string | null;
  item_id: string | null;
  title: string;
  body: string | null;
  post_type: keyof typeof POST_TYPE_CONFIG;
  user_id: string;
  created_at: string;
  updated_at: string;
  edited_by: string | null;
  is_pinned?: boolean;
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

const LIGHT_COLORS = new Set(["bg-amber-500", "bg-yellow-500", "bg-yellow-600", "bg-lime-500"]);

export function FilterChip({ label, active, onClick, color }: FilterChipProps) {
  const isLight = color ? LIGHT_COLORS.has(color) : false;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition cursor-pointer ${
        active
          ? `${color ?? "bg-zinc-900 dark:bg-zinc-100"} ${isLight ? "text-zinc-900" : "text-white dark:text-zinc-900"}`
          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700"
      }`}
    >
      {label}
    </button>
  );
}

// Markdown preview for rendered content
export function MarkdownPreview({ content }: { content: string }) {
  const html = useMemo(() => markdownToHtml(content), [content]);
  if (!html) return null;
  return (
    <div
      className="markdown-body text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed"
      dangerouslySetInnerHTML={{ __html: html }}
      style={{}}
    />
  );
}

interface ForumPostCardProps {
  post: ForumPost;
  isOwner: boolean;
  onDelete: () => void;
  onOpen: () => void;
  onTogglePin?: () => void;
  onEdit?: () => void;
}

export function ForumPostCard({ post, isOwner, onDelete, onOpen, onTogglePin, onEdit }: ForumPostCardProps) {
  const config = POST_TYPE_CONFIG[post.post_type] ?? POST_TYPE_CONFIG.discussion;
  const Icon = config.icon;
  const subject = post.subject_id ? getSubject(post.subject_id) : null;
  const userName = profileCache.get(post.user_id) ?? "Usuário";

  // Estados de confirmação
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPinConfirm, setShowPinConfirm] = useState(false);

  // Resgata emoji do item referenciado de forma segura
  const itemEmoji = useMemo(() => {
    if (!post.item_ref?.subject_id) return null;
    return getSubject(post.item_ref.subject_id)?.emoji;
  }, [post.item_ref]);

  return (
    <div
      onClick={onOpen}
      className={`bg-white dark:bg-zinc-900 rounded-xl border p-4 hover:shadow-md transition cursor-pointer group ${
        post.is_pinned
          ? "border-amber-300 dark:border-amber-800 ring-1 ring-amber-300/50 dark:ring-amber-800/30"
          : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`shrink-0 w-10 h-10 rounded-lg ${config.color} flex items-center justify-center shadow-sm relative`}>
          <Icon size={18} className="text-white" />
          {post.is_pinned && (
            <div className="absolute -top-1.5 -right-1.5 bg-amber-500 rounded-full p-0.5 shadow-sm">
              <Pin size={10} className="text-white" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 min-w-0 flex-1">
              {post.is_pinned && (
                <span className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-[10px] font-bold mt-0.5">
                  <Pin size={10} /> Fixado
                </span>
              )}
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 leading-snug truncate">
                {post.title}
              </h3>
            </div>
            <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {isOwner && onEdit && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onEdit(); }}
                  className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition cursor-pointer"
                  title="Editar post"
                >
                  <Edit2 size={14} className="text-zinc-400 hover:text-zinc-600" />
                </button>
              )}
              {isOwner && onTogglePin && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setShowPinConfirm(true); }}
                  className={`p-1 rounded transition ${
                    post.is_pinned
                      ? "hover:bg-amber-50 dark:hover:bg-amber-900/20"
                      : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                  title={post.is_pinned ? "Desafixar post" : "Fixar post"}
                >
                  <Pin size={14} className={post.is_pinned ? "text-amber-500" : "text-zinc-400 hover:text-zinc-600"} />
                </button>
              )}
              {isOwner && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true); }}
                  className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition"
                >
                  <Trash2 size={14} className="text-zinc-400 hover:text-red-500" />
                </button>
              )}
            </div>

            {/* Modal de confirmação para deletar */}
            {showDeleteConfirm && (
              <div className="absolute inset-0 bg-white dark:bg-zinc-900/95 rounded-xl border border-red-200 dark:border-red-800 p-4 flex flex-col items-center justify-center gap-3 z-10" onClick={(e) => e.stopPropagation()}>
                <AlertTriangle size={24} className="text-red-500" />
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 text-center">Excluir este post?</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 text-center">Esta ação não pode ser desfeita</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowDeleteConfirm(false); }}
                    className="px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => { setShowDeleteConfirm(false); onDelete(); }}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition"
                  >
                    Excluir
                  </button>
                </div>
              </div>
            )}

            {/* Modal de confirmação para fixar/desafixar */}
            {showPinConfirm && (
              <div className="absolute inset-0 bg-white dark:bg-zinc-900/95 rounded-xl border border-amber-200 dark:border-amber-800 p-4 flex flex-col items-center justify-center gap-3 z-10" onClick={(e) => e.stopPropagation()}>
                <Pin size={24} className="text-amber-500" />
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 text-center">
                  {post.is_pinned ? "Desafixar este post?" : "Fixar este post?"}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 text-center">
                  {post.is_pinned ? "O post aparecerá no topo" : "O post será fixado no topo do fórum"}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowPinConfirm(false); }}
                    className="px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => { setShowPinConfirm(false); onTogglePin?.(); }}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition"
                  >
                    {post.is_pinned ? "Desafixar" : "Fixar"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {post.body && (
            <div className="mt-1 line-clamp-2 overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <MarkdownPreview content={post.body} />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-3 text-xs text-zinc-400">
            <span className="flex items-center gap-1">
              <Tag size={11} /> {userName}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={11} /> {getTimeAgo(post.created_at)}
            </span>

            {/* Edited indicator */}
            {post.edited_by && post.updated_at && (
              <span className="flex items-center gap-1 text-amber-500 dark:text-amber-400">
                <Edit2 size={10} /> editado {getTimeAgo(post.updated_at)}
              </span>
            )}
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

// Shared picker components to avoid duplication between CreatePostModal and EditPostModal
function PostTypePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Tipo de Post</label>
      <div className="flex flex-wrap gap-2">
        {(Object.entries(POST_TYPE_CONFIG) as [keyof typeof POST_TYPE_CONFIG, any][]).map(([key, config]) => {
          const Icon = config.icon;
          const isActive = value === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium transition cursor-pointer ${
                isActive ? `${config.color} text-white` : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200"
              }`}
            >
              <Icon size={14} /> {config.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SubjectPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Matéria</label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange("")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition cursor-pointer ${
            value === "" ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
          }`}
        >
          Geral
        </button>
        {SUBJECTS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange(s.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition cursor-pointer ${
              value === s.id ? `${s.color} text-white` : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
            }`}
          >
            {s.emoji} {s.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function ActivityPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [items, setItems] = useState<{ id: string; text: string; subject_id: string }[]>([]);
  const [show, setShow] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => { if (show) loadItems(); }, [show]);

  async function loadItems() {
    try {
      const supabase = createClient();
      const { data, error } = await supabase.from("items").select("id, text, subject_id").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      if (data) setItems(data);
    } catch { /* ignore */ }
  }

  const filtered = items.filter(i => i.text.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Referenciar Atividade</label>
      {value ? (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
          <span className="flex-1 text-sm text-zinc-700 dark:text-zinc-300 truncate">
            {(() => {
              const found = items.find((i) => i.id === value);
              if (!found) return "Atividade selecionada";
              const subj = getSubject(found.subject_id);
              return <>{subj?.emoji} {found.text}</>;
            })()}
          </span>
          <button type="button" onClick={() => onChange("")} className="text-xs font-medium text-red-500 hover:underline cursor-pointer">Remover</button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="w-full py-3 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-400 hover:border-zinc-400 transition text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          + Selecionar atividade do curso
        </button>
      )}
      {show && (
        <div className="mt-2 border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden shadow-inner">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar atividades..."
            className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700 outline-none text-sm"
          />
          <div className="max-h-40 overflow-y-auto bg-white dark:bg-zinc-900">
            {filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => { onChange(item.id); setShow(false); setSearch(""); }}
                className="w-full px-4 py-2.5 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 border-b border-zinc-100 dark:border-zinc-800 last:border-0 cursor-pointer"
              >
                {getSubject(item.subject_id)?.emoji} {item.text}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="p-4 text-center text-xs text-zinc-400">Nenhuma atividade encontrada.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-100 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-zinc-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition cursor-pointer">
            <X size={18} className="text-zinc-400" />
          </button>
        </div>
        <form className="p-4 space-y-5 overflow-y-auto">{children}</form>
      </div>
    </div>
  );
}

interface EditPostModalProps {
  post: ForumPost;
  onClose: () => void;
  onEdited: () => void;
  userId: string | null;
}

const MD_BUTTONS: Array<{ label: string; before: string; after: string; cls?: string; divider?: boolean }> = [
  { label: "B", before: "**", after: "**", cls: "font-bold" },
  { label: "I", before: "_", after: "_", cls: "italic" },
  { label: "~~", before: "~~", after: "~~", cls: "line-through" },
  { divider: true, label: "-", before: "", after: "" },
  { label: "h1", before: "# ", after: "", cls: "" },
  { label: "h2", before: "## ", after: "", cls: "" },
  { label: ">", before: "> ", after: "", cls: "" },
  { label: "•", before: "- ", after: "", cls: "" },
  { label: "1.", before: "1. ", after: "", cls: "" },
  { label: "</>", before: "`", after: "`", cls: "font-mono" },
  { label: "🔗", before: "[", after: "](url)", cls: "" },
];

function MarkdownToolbarButtons({ textareaEl, bodyValue, setBody }: { textareaEl: HTMLTextAreaElement | null; bodyValue: string; setBody: (v: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1 px-3 py-1.5 border-t border-x border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 rounded-t-xl">
      {MD_BUTTONS.map((btn, i) => {
        if (btn.divider) {
          return <div key={i} className="w-px h-5 bg-zinc-200 dark:bg-zinc-700 mx-0.5" />;
        }
        return (
          <button
            key={i}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              insertMarkdown(textareaEl!, bodyValue, setBody, btn.before, btn.after);
            }}
            className={`px-2 py-1 text-xs rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 transition cursor-pointer text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 ${btn.cls || ""}`}
            title={`Inserir ${btn.label}`}
          >
            {btn.label}
          </button>
        );
      })}
      <span className="text-[10px] text-zinc-400 ml-auto hidden sm:inline">Markdown</span>
    </div>
  );
}

interface MarkdownFieldProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

function MarkdownField({ value, onChange, placeholder }: MarkdownFieldProps) {
  const textareaRef = useState<HTMLTextAreaElement | null>(null);
  const [el, setEl] = textareaRef;

  return (
    <div>
      {/* Toolbar */}
      <MarkdownToolbarButtons textareaEl={el} bodyValue={value} setBody={onChange} />
      <textarea
        ref={setEl}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-3 border-x border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-zinc-500 outline-none transition resize-none rounded-b-xl font-mono text-sm"
        rows={6}
        placeholder={placeholder}
      />
    </div>
  );
}

export function CreatePostModal({ onClose, onCreated, defaultItemId }: CreatePostModalProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [postType, setPostType] = useState<keyof typeof POST_TYPE_CONFIG>("discussion");
  const [subjectId, setSubjectId] = useState("");
  const [itemId, setItemId] = useState(defaultItemId ?? "");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      const { data, error } = await supabase.from("forum_posts").insert({
        title: title.trim(),
        body: body.trim() || null,
        post_type: postType,
        subject_id: subjectId || null,
        item_id: itemId || null,
        user_id: user.id,
      }).select("id").single();
      if (error) throw error;
      // Dispatch notifications
      const { notifyNewForumPost } = await import("@/lib/notifications");
      await notifyNewForumPost(user.id, data.id, title.trim());
      onCreated();
    } catch (err: any) {
      alert(err.message || "Erro ao criar post");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell title="Novo post" onClose={onClose}>
      <PostTypePicker value={postType} onChange={(v) => setPostType(v as keyof typeof POST_TYPE_CONFIG)} />
      <SubjectPicker value={subjectId} onChange={setSubjectId} />
      <ActivityPicker value={itemId} onChange={setItemId} />

      <div className="space-y-4">
        <div>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 80))}
            className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-zinc-500 outline-none transition"
            placeholder="Título do post"
            required
            maxLength={80}
          />
          <p className="text-[10px] text-zinc-400 mt-1 text-right">{title.length}/80</p>
        </div>
        <MarkdownField value={body} onChange={setBody} placeholder="Escreva seu post em markdown..." />
        {/* Live preview */}
        {body.trim() && (
          <details className="border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden">
            <summary className="px-3 py-1.5 text-xs font-medium text-zinc-400 cursor-pointer bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition select-none">
              Pré-visualizar
            </summary>
            <div className="p-3 border-t border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
              <MarkdownPreview content={body} />
            </div>
          </details>
        )}
      </div>

      <button
        type="submit"
        disabled={submitting || !title.trim()}
        onClick={handleSubmit}
        className="w-full py-3.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? "Publicando..." : <><Send size={18} /> Publicar no Fórum</>}
      </button>
    </ModalShell>
  );
}

export function EditPostModal({ post, onClose, onEdited, userId }: EditPostModalProps) {
  const [title, setTitle] = useState(post.title);
  const [body, setBody] = useState(post.body ?? "");
  const [postType, setPostType] = useState<keyof typeof POST_TYPE_CONFIG>(post.post_type);
  const [subjectId, setSubjectId] = useState(post.subject_id ?? "");
  const [itemId, setItemId] = useState(post.item_id ?? "");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("forum_posts").update({
        title: title.trim(),
        body: body.trim() || null,
        post_type: postType,
        subject_id: subjectId || null,
        item_id: itemId || null,
        edited_by: userId,
        updated_at: new Date().toISOString(),
      }).eq("id", post.id);
      if (error) throw error;
      onEdited();
    } catch (err: any) {
      alert(err.message || "Erro ao editar post");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell title="Editar post" onClose={onClose}>
      <PostTypePicker value={postType} onChange={(v) => setPostType(v as keyof typeof POST_TYPE_CONFIG)} />
      <SubjectPicker value={subjectId} onChange={setSubjectId} />
      <ActivityPicker value={itemId} onChange={setItemId} />

      <div className="space-y-4">
        <div>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 80))}
            className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-zinc-500 outline-none transition"
            placeholder="Título do post"
            required
            maxLength={80}
          />
          <p className="text-[10px] text-zinc-400 mt-1 text-right">{title.length}/80</p>
        </div>
        <MarkdownField value={body} onChange={setBody} placeholder="Conteúdo em markdown..." />
        {body.trim() && (
          <details className="border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden">
            <summary className="px-3 py-1.5 text-xs font-medium text-zinc-400 cursor-pointer bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition select-none">
              Pré-visualizar
            </summary>
            <div className="p-3 border-t border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
              <MarkdownPreview content={body} />
            </div>
          </details>
        )}
      </div>

      <button
        type="submit"
        disabled={submitting || !title.trim()}
        onClick={handleSubmit}
        className="w-full py-3.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? "Salvando..." : <><Send size={18} /> Salvar alterações</>}
      </button>
    </ModalShell>
  );
}