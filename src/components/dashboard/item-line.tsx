import { useRouter } from "next/navigation";
import { SUBJECTS } from "@/lib/subjects";
import { ITEM_TYPES } from "@/components/create-modal";
import { GraduationCap, User, CheckCircle2 } from "lucide-react";

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
  const TypeIcon = typeConfig.icon;
  const isExam = item.item_type === "exam";
  const mineDone = isMineDone(item);

  return (
    <div
      onClick={() => router.push(`/dashboard/${item.subject_id}?item=${item.id}`)}
      className="flex items-start gap-2 p-3 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition cursor-pointer group"
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
            {!isExam && (
              <TypeIcon size={14} className={`${typeConfig.color.replace("bg-", "text-")} shrink-0`} />
            )}
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
            <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium text-white ${subj.color} ${subj.darkColor}`}>
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
            <span className="text-[11px] text-zinc-400 truncate">{item.description.length > 50 ? item.description.substring(0, 50) + "..." : item.description}</span>
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
