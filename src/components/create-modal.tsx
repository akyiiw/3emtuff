"use client";

import { useState, useEffect } from "react";
import { SUBJECTS } from "@/lib/subjects";
import { X, Plus, Calendar, LinkIcon, Trash2, FileText, GraduationCap, FolderOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export const ITEM_TYPES = {
  activity: { label: "Atividade", icon: FileText, color: "bg-blue-500" },
  work: { label: "Trabalho", icon: FolderOpen, color: "bg-purple-500" },
  exam: { label: "Prova", icon: GraduationCap, color: "bg-red-500" },
} as const;

interface LinkEntry {
  id?: string;
  url: string;
  label: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  defaultSubject?: string;
  editItem?: {
    id: string;
    text: string;
    description: string | null;
    due_date: string | null;
    subject_id: string;
    item_type?: string;
    links: LinkEntry[];
  } | null;
}

export function CreateModal({ open, onClose, onSave, defaultSubject, editItem }: Props) {
  const [text, setText] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [itemType, setItemType] = useState<"activity" | "work" | "exam">("activity");
  const [links, setLinks] = useState<LinkEntry[]>([]);

  const isEditing = !!editItem;

  useEffect(() => {
    if (open) {
      if (editItem) {
        setText(editItem.text);
        setDescription(editItem.description ?? "");
        setDate(editItem.due_date ?? "");
        setSubjectId(editItem.subject_id);
        setItemType((editItem.item_type as typeof itemType) ?? "activity");
        setLinks(editItem.links);
      } else {
        setText("");
        setDescription("");
        setDate("");
        setSubjectId(defaultSubject ?? "");
        setLinks([]);
        setItemType("activity");
      }
    }
  }, [open, editItem, defaultSubject]);

  if (!open) return null;

  function addLink() {
    setLinks([...links, { url: "", label: "" }]);
  }

  function removeLink(idx: number) {
    setLinks(links.filter((_, i) => i !== idx));
  }

  function updateLink(idx: number, field: "url" | "label", value: string) {
    const updated = [...links];
    updated[idx] = { ...updated[idx], [field]: value };
    setLinks(updated);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let itemId: string;

      const payload = {
        subject_id: subjectId || undefined as string | undefined,
        text,
        description: description.trim() || null,
        due_date: date || null,
        item_type: itemType,
      };

      if (isEditing) {
        itemId = editItem!.id;
        const { error } = await supabase.from("items").update({
          ...payload,
          edited_by: user.id,
          updated_at: new Date().toISOString(),
        }).eq("id", itemId);
        if (error) { alert(error.message); return; }

        await supabase.from("item_links").delete().eq("item_id", itemId);

        const validLinks = links.filter((l) => l.url.trim());
        for (const link of validLinks) {
          await supabase.from("item_links").insert({
            item_id: itemId,
            url: link.url.trim(),
            label: link.label.trim() || null,
          });
        }
      } else {
        const { data, error } = await supabase.from("items").insert({
          ...payload,
          created_by: user.id,
        }).select("id").single();
        if (error) { alert(error.message); return; }
        itemId = data.id;

        const validLinks = links.filter((l) => l.url.trim());
        for (const link of validLinks) {
          await supabase.from("item_links").insert({
            item_id: itemId,
            url: link.url.trim(),
            label: link.label.trim() || null,
          });
        }

        // Dispatch notifications
        const { notifyNewItem } = await import("@/lib/notifications");
        await notifyNewItem(user.id, itemId, text, itemType, subjectId);
      }

      onSave();
    } catch (err: unknown) {
      if (err instanceof Error) alert(err.message);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">
            {isEditing ? "Editar item" : "Novo item"}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg">
            <X size={18} className="text-zinc-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Item Type Selector */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
              Tipo
            </label>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(ITEM_TYPES).map(([key, config]) => {
                const Icon = config.icon;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setItemType(key as typeof itemType)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition ${
                      itemType === key
                        ? `${config.color} text-white`
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                    }`}
                  >
                    <Icon size={13} /> {config.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Subject selector */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
              Matéria
            </label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSubjectId("")}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                  subjectId === ""
                    ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                }`}
              >
                Geral
              </button>
              {SUBJECTS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSubjectId(s.id)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                    subjectId === s.id
                      ? `${s.color} text-white`
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                  }`}
                >
                  {s.emoji} {s.name}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
              {itemType === "exam" ? "Nome da prova?" : itemType === "work" ? "Nome do trabalho?" : "O que precisa fazer?"}
            </label>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 100))}
              className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
              placeholder={itemType === "exam" ? "Ex: P2 de Cálculo..." : itemType === "work" ? "Ex: Trabalho de história sobre..." : "Ex: Lista 3 de exercícios..."}
              required
              maxLength={100}
            />
            <p className="text-[10px] text-zinc-400 mt-1 text-right">{text.length}/100</p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
              Descrição
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100 resize-none"
              rows={3}
              placeholder="Detalhes adicionais..."
            />
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2 flex items-center gap-1">
              <Calendar size={14} /> {itemType === "exam" ? "Data da prova" : "Data de entrega"}
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
              max="2027-12-31"
              className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
            />
          </div>

          {/* Links */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                <LinkIcon size={14} /> Links anexados
              </label>
              <button
                type="button"
                onClick={addLink}
                className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 flex items-center gap-1"
              >
                <Plus size={12} /> Adicionar link
              </button>
            </div>
            {links.length > 0 && (
              <div className="space-y-2">
                {links.map((link, idx) => (
                  <div key={idx} className="flex gap-2 items-start">
                    <div className="flex-1 space-y-1">
                      <input
                        type="url"
                        value={link.url}
                        onChange={(e) => updateLink(idx, "url", e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
                        placeholder="https://..."
                      />
                      <input
                        type="text"
                        value={link.label}
                        onChange={(e) => updateLink(idx, "label", e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
                        placeholder="Nome do link (opcional)"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLink(idx)}
                      className="p-1.5 mt-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition"
                    >
                      <Trash2 size={14} className="text-zinc-400 hover:text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="w-full py-2.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg font-medium flex items-center justify-center gap-2 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition"
          >
            <Plus size={16} /> {isEditing ? "Salvar alterações" : "Adicionar"}
          </button>
        </form>
      </div>
    </div>
  );
}
