import { useRouter } from "next/navigation";
import { SUBJECTS } from "@/lib/subjects";
import { GraduationCap } from "lucide-react";
import { ItemData } from "./item-line";

interface ExamLineProps {
  item: ItemData;
  todayStr: string;
  router: ReturnType<typeof useRouter>;
}

export function ExamLine({ item, todayStr, router }: ExamLineProps) {
  const subj = SUBJECTS.find((s) => s.id === item.subject_id);
  const isToday = item.due_date === todayStr;

  return (
    <div
      onClick={() => router.push(`/dashboard/${item.subject_id}?item=${item.id}`)}
      className="flex items-start gap-2 p-3 rounded-lg bg-white dark:bg-zinc-900 border border-red-200 dark:border-red-900 hover:bg-red-50 dark:hover:bg-red-950/30 transition cursor-pointer group"
    >
      <div className="w-5 flex justify-center shrink-0 mt-0.5">
        <GraduationCap size={16} className={`text-red-500 ${isToday ? "animate-pulse" : ""}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[15px] leading-snug font-medium text-zinc-700 dark:text-zinc-300 truncate">
            {item.text}
          </span>
          {subj && (
            <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium text-white ${subj.color} ${subj.darkColor}`}>
              {subj.emoji} {subj.name}
            </span>
          )}
        </div>
        {item.description && (
          <p className="text-[11px] text-zinc-400 mt-0.5 truncate">{item.description.substring(0, 60)}</p>
        )}
        <div className="flex items-center gap-2 mt-1 text-[11px]">
          {item.due_date && (
            <span className={`font-medium ${isToday ? "text-red-600 dark:text-red-400" : "text-zinc-400"}`}>
              {isToday ? "Hoje" : new Date(item.due_date + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
