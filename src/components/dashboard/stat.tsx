import { Clock } from "lucide-react";

interface StatProps {
  icon: typeof Clock;
  label: string;
  value: number;
  accent?: string;
  active?: boolean;
  onClick?: () => void;
}

export function Stat({ icon: Icon, label, value, accent, active, onClick }: StatProps) {
  return (
    <button onClick={onClick}
      className={`w-full text-left bg-white dark:bg-zinc-900 rounded-xl border p-4 transition-all hover:cursor-pointer ${
        active
          ? "border-zinc-900 dark:border-zinc-100 ring-2 ring-zinc-900/10 dark:ring-zinc-100/10"
          : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon size={16} className="text-zinc-400" />
        <span className="text-xs text-zinc-500">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${accent ?? "text-zinc-900 dark:text-zinc-100"}`}>{value}</p>
    </button>
  );
}
