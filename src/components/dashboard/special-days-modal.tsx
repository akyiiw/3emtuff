"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { X, Calendar, Trash2, Plus } from "lucide-react";

interface SpecialDay {
  id: string;
  date: string;
  type: string;
  label: string;
}

export function SpecialDaysModal({ open, onClose, onUpdated }: { open: boolean; onClose: () => void; onUpdated: () => void }) {
  const [days, setDays] = useState<SpecialDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [newDay, setNewDay] = useState({ date: "", type: "holiday", label: "Bom descanso!" });

  useEffect(() => {
    if (open) loadDays();
  }, [open]);

  async function loadDays() {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data } = await supabase.from("special_days").select("*").order("date", { ascending: true });
      setDays((data as SpecialDay[]) ?? []);
    } catch {
      console.error("Error loading special days");
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    if (!newDay.date || !newDay.label) return;
    try {
      const supabase = createClient();
      const { error } = await supabase.from("special_days").insert({
        date: newDay.date,
        type: newDay.type,
        label: newDay.label,
      });
      if (error) throw error;
      await loadDays();
      setNewDay({ date: "", type: "holiday", label: "Bom descanso!" });
      onUpdated();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleDelete(id: string) {
    try {
      const supabase = createClient();
      const { error } = await supabase.from("special_days").delete().eq("id", id);
      if (error) throw error;
      await loadDays();
      onUpdated();
    } catch (err: any) {
      alert(err.message);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 w-full max-w-lg shadow-xl overflow-hidden">
        <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar size={20} className="text-zinc-500" />
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Dias Especiais</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition">
            <X size={20} className="text-zinc-400" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Add Form */}
          <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700 space-y-3">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Adicionar Dia</p>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="date"
                value={newDay.date}
                onChange={(e) => setNewDay({ ...newDay, date: e.target.value })}
                className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
              />
              <select
                value={newDay.type}
                onChange={(e) => setNewDay({ ...newDay, type: e.target.value })}
                className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
              >
                <option value="holiday">Feriado</option>
                <option value="weekend">Final de Semana</option>
                <option value="meeting">Reunião</option>
                <option value="vacation">Férias</option>
              </select>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Frase (ex: Bom descanso!)"
                value={newDay.label}
                onChange={(e) => setNewDay({ ...newDay, label: e.target.value })}
                className="flex-1 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
              />
              <button
                onClick={handleAdd}
                className="px-3 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition"
              >
                <Plus size={18} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="space-y-2">
            {loading ? (
              <p className="text-center text-sm text-zinc-500">Carregando...</p>
            ) : days.length === 0 ? (
              <p className="text-center text-sm text-zinc-500">Nenhum dia especial cadastrado</p>
            ) : (
              days.map((day) => (
                <div key={day.id} className="flex items-center justify-between p-3 rounded-lg border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 transition">
                  <div className="flex items-center gap-3">
                    <div className="text-xs font-medium text-zinc-500">
                      {new Date(day.date + "T00:00:00").toLocaleDateString("pt-BR")}
                    </div>
                    <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      {day.label}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(day.id)}
                    className="p-1.5 text-zinc-400 hover:text-red-500 transition"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
