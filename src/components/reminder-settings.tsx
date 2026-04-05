"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Mail, X } from "lucide-react";

interface ReminderSettingsProps {
  open: boolean;
  onClose: () => void;
  userId: string | null;
}

const SCHEDULE_OPTIONS = [
  { value: 0, label: "No dia" },
  { value: 1, label: "1 dia antes" },
  { value: 2, label: "2 dias antes" },
  { value: 3, label: "3 dias antes" },
  { value: 7, label: "1 semana antes" },
] as const;

export function ReminderSettings({ open, onClose, userId }: ReminderSettingsProps) {
  const [enabled, setEnabled] = useState(true);
  const [scheduleDays, setScheduleDays] = useState<number[]>([0, 1]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadPrefs = useCallback(async () => {
    if (!userId) return;
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("reminder_preferences")
        .select("enabled, schedule_days")
        .eq("user_id", userId)
        .single();

      if (data) {
        setEnabled(data.enabled);
        if (Array.isArray(data.schedule_days)) {
          setScheduleDays(data.schedule_days);
        }
      }
    } catch {
      // First time — use defaults
    }
    setLoaded(true);
  }, [userId]);

  useEffect(() => {
    if (open && !loaded && userId) {
      loadPrefs();
    }
  }, [open, loaded, userId, loadPrefs]);

  if (!open) return null;

  const toggleDay = (day: number) => {
    setScheduleDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)
    );
  };

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("reminder_preferences")
        .upsert(
          { user_id: userId, enabled, schedule_days: scheduleDays },
          { onConflict: "user_id" }
        );
      if (!error) onClose();
    } catch {
      alert("Erro ao salvar preferências");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 w-full max-w-md mx-4 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Mail size={18} className="text-zinc-400" />
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Lembretes por email</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition"
          >
            <X size={16} className="text-zinc-400" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Receber lembretes
              </p>
              <p className="text-xs text-zinc-500">
                Ser avisado por email sobre atividades e provas
              </p>
            </div>
            <button
              onClick={() => setEnabled(!enabled)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                enabled
                  ? "bg-zinc-900 dark:bg-zinc-100"
                  : "bg-zinc-200 dark:bg-zinc-700"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white dark:bg-zinc-900 rounded-full shadow transition-transform ${
                  enabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Schedule days - multi-select */}
          {enabled && (
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-1">
                Quando ser notificado
              </p>
              <p className="text-xs text-zinc-500 mb-3">
                Selecione com quanto tempo de antecedência quer receber o lembrete
              </p>
              <div className="flex gap-1.5 flex-wrap">
                {SCHEDULE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleDay(opt.value)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition ${
                      scheduleDays.includes(opt.value)
                        ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {scheduleDays.length === 0 && (
                <p className="text-xs text-amber-500 mt-2">⚠️ Nenhum prazo selecionado — lembretes não serão enviados.</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-5 pt-0">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-sm font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 text-sm font-medium rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 disabled:opacity-40 transition"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
