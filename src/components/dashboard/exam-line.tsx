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
  const embedColor = subj?.color ?? "bg-zinc-400";

  return (
    <div
      onClick={() => router.push(`/dashboard/${item.subject_id}?item=${item.id}`)}
      className={`rounded-lg border p-4 transition cursor-pointer flex items-start gap-3 relative overflow-hidden ${
        isToday
          ? "border-red-200 dark:border-red-900 hover:bg-red-50 dark:hover:bg-red-950/30"
          : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
      }`}
    >
      {/* Discord-style embed bar — full height */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${embedColor}`} />

      <div className="w-5 flex justify-center shrink-0 mt-0.5">
        <GraduationCap size={16} className={`text-zinc-400 dark:text-zinc-500 ${isToday ? "animate-pulse" : ""}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <p className={`text-[15px] leading-snug ${isToday ? "font-semibold text-red-600 dark:text-red-400" : "text-zinc-700 dark:text-zinc-300"} truncate flex-1`}>
            {item.text}
          </p>
          <span className="shrink-0 text-[9px] font-medium text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-700 rounded-full px-2 py-0.5 uppercase tracking-wide">
            Prova <span className="mx-0.5">·</span> {subj?.name ?? "Geral"}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1.5">
          {item.due_date && (
            <span className={`text-[11px] font-medium ${isToday ? "text-red-600 dark:text-red-400" : "text-zinc-400"}`}>
              {isToday ? "Hoje" : new Date(item.due_date + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
            </span>
          )}
          {item.description && (
            <span className="text-[11px] text-zinc-400 truncate">{item.description.length > 50 ? item.description.substring(0, 50) + "..." : item.description}</span>
          )}
        </div>
      </div>
    </div>
  );
}
