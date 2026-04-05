import { getSubject, SUBJECTS } from "@/lib/subjects";
import { ITEM_TYPES } from "@/components/create-modal";
import { GraduationCap, User, Check } from "lucide-react";

const profileCache = new Map<string, string>();
export { profileCache };

export interface Item {
  id: string;
  text: string;
  description: string | null;
  due_date: string | null;
  created_by: string;
  subject_id: string;
  item_type: string;
}

interface ItemCardProps {
  item: Item;
  active: boolean;
  onClick: () => void;
  onToggle?: () => void;
  doneByMe: boolean;
  doneList: { userId: string; name: string }[];
  isExam?: boolean;
}

export function ItemCard({ item, active, onClick, onToggle, doneByMe, doneList, isExam }: ItemCardProps) {
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
