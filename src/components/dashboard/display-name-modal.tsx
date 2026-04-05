import { useState } from "react";

interface Props {
  open: boolean;
  onSave: (displayName: string) => void;
}

export function DisplayNameModal({ open, onSave }: Props) {
  const [value, setValue] = useState("");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 w-full max-w-sm mx-4 shadow-xl">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-2">Escolha seu apelido</h2>
        <p className="text-sm text-zinc-500 mb-4">Como você quer ser chamado(a) no app?</p>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && value.trim()) onSave(value.trim()); }}
          placeholder="Seu apelido..."
          maxLength={20}
          autoFocus
          className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
        />
        <button
          onClick={() => { if (value.trim()) onSave(value.trim()); }}
          disabled={!value.trim()}
          className="mt-3 w-full py-2 text-sm font-medium rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition"
        >
          Salvar
        </button>
      </div>
    </div>
  );
}
