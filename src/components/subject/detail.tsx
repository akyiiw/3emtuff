interface DetailProps {
  label: string;
  children: React.ReactNode;
}

export function Detail({ label, children }: DetailProps) {
  return (
    <div>
      <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-1">{label}</p>
      <div className="flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">{children}</div>
    </div>
  );
}
