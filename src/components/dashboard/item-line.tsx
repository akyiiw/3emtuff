import { useRouter } from "next/navigation";
import { SUBJECTS } from "@/lib/subjects";
import { FileText, GraduationCap, User, CheckCircle2 } from "lucide-react";
import { ITEM_TYPES } from "@/components/create-modal";

const profileCache: Map<string, string> = new Map();
export { profileCache };

export interface ItemData {
  id: string;
  text: string;
  description: string | null;
  due_date: string | null;
  created_by: string;
  subject_id: string;
  item_type: string;
}

interface ItemLineProps {
  item: ItemData;
  onToggleDone: () => void;
  doneNames: string[];
  isMineDone: (item: ItemData) => boolean;
  router: ReturnType<typeof useRouter>;
}

export function ItemLine({ item, onToggleDone, doneNames, isMineDone, router }: ItemLineProps) {
  const subj = SUBJECTS.find((s) => s.id === item.subject_id);
  const typeConfig = ITEM_TYPES[item.item_type as keyof typeof ITEM_TYPES] ?? ITEM_TYPES.activity;
  const isExam = item.item_type === "exam";
  const mineDone = isMineDone(item);
  const embedColor = subj?.color ?? "bg-zinc-400";
  const TypeIcon = isExam ? GraduationCap : typeConfig.icon;

  return (
    <div
      onClick={() => router.push(`/dashboard/${item.subject_id}?item=${item.id}`)}
      className="rounded-lg border p-4 transition cursor-pointer flex items-start gap-3 relative overflow-hidden bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
    >
      {/* Discord-style embed bar — full height */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${embedColor}`} />

      {isExam ? (
        <div className="w-5 flex justify-center shrink-0 mt-0.5">
          <GraduationCap size={16} className="text-zinc-400 dark:text-zinc-500" />
        </div>
      ) : (
        <input type="checkbox" checked={mineDone} onClick={(e) => e.stopPropagation()} onChange={onToggleDone}
          className="w-5 h-5 mt-0.5 rounded border border-zinc-300 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-800 accent-zinc-900 dark:accent-zinc-200 shrink-0 cursor-pointer" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            {!isExam && (
              <TypeIcon size={14} className="text-zinc-400 dark:text-zinc-500 shrink-0" />
            )}
            <p className={`text-[15px] leading-snug ${mineDone ? "line-through text-zinc-400" : "text-zinc-700 dark:text-zinc-300"} truncate flex-1`}>
              {item.text}
            </p>
          </div>
          <span className="shrink-0 text-[9px] font-medium text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-700 rounded-full px-2 py-0.5 uppercase tracking-wide">
            {typeConfig.label} <span className="mx-0.5">·</span> {subj?.name ?? "Geral"}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1.5">
          {item.due_date && (
            <span className={`text-[11px] font-medium ${item.due_date < new Date().toISOString().split("T")[0] && !mineDone ? "text-red-500" : "text-zinc-400"}`}>
              {new Date(item.due_date + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
            </span>
          )}
          {item.description && (
            <span className="text-[11px] text-zinc-400 truncate">{item.description.length > 50 ? item.description.substring(0, 50) + "..." : item.description}</span>
          )}
        </div>
        {doneNames.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {doneNames.map((name, idx) => (
              <span key={idx} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400">
                <CheckCircle2 size={8} /> {name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
