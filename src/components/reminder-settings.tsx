"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Mail, X, Clock, CheckCircle2 } from "lucide-react";

interface ReminderSettingsProps {
  open: boolean;
  onClose: () => void;
  userId: string | null;
}

const PENDING_OPTIONS = [
  { value: 0, label: "No dia" },
  { value: 1, label: "1 dia antes" },
  { value: 2, label: "2 dias antes" },
] as const;

const CONCLUDED_OPTIONS = [
  { value: 0, label: "No dia" },
  { value: 1, label: "1 dia antes" },
  { value: 2, label: "2 dias antes" },
] as const;

export function ReminderSettings({ open, onClose, userId }: ReminderSettingsProps) {
  const [pendingEnabled, setPendingEnabled] = useState(true);
  const [pendingSchedule, setPendingSchedule] = useState<number[]>([0, 1, 2]);
  const [concludedEnabled, setConcludedEnabled] = useState(true);
  const [concludedSchedule, setConcludedSchedule] = useState<number[]>([0, 1, 2]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadPrefs = useCallback(async () => {
    if (!userId) return;
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("reminder_preferences")
        .select("enabled, schedule_days, pending_enabled, pending_schedule, concluded_enabled, concluded_schedule")
        .eq("user_id", userId)
        .single();

      if (data) {
        // Use new columns if available, fallback to legacy
        setPendingEnabled(data.pending_enabled ?? data.enabled ?? true);
        const ps = data.pending_schedule ?? data.schedule_days;
        setPendingSchedule(Array.isArray(ps) ? ps : [0, 1, 2]);

        setConcludedEnabled(data.concluded_enabled ?? data.enabled ?? true);
        setConcludedSchedule(Array.isArray(data.concluded_schedule) ? data.concluded_schedule : [0, 1, 2]);
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

  const togglePendingDay = (day: number) => {
    setPendingSchedule((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)
    );
  };

  const toggleConcludedDay = (day: number) => {
    setConcludedSchedule((prev) =>
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
          {
            user_id: userId,
            enabled: pendingEnabled || concludedEnabled,
            schedule_days: pendingSchedule, // keep for backward compat
            pending_enabled: pendingEnabled,
            pending_schedule: pendingSchedule,
            concluded_enabled: concludedEnabled,
            concluded_schedule: concludedSchedule,
          },
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
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 w-full max-w-lg mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
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

        <div className="p-5 space-y-6">
          {/* Section 1: Pending Activities */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-amber-500" />
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Atividades pendentes</h3>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  Receber lembretes de pendentes
                </p>
                <p className="text-xs text-zinc-500">
                  Avisos sobre atividades e provas que ainda não concluiu
                </p>
              </div>
              <button
                onClick={() => setPendingEnabled(!pendingEnabled)}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  pendingEnabled
                    ? "bg-amber-500"
                    : "bg-zinc-200 dark:bg-zinc-700"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white dark:bg-zinc-900 rounded-full shadow transition-transform ${
                    pendingEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {pendingEnabled && (
              <div>
                <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100 mb-2">
                  Quando ser notificado
                </p>
                <div className="flex gap-1.5 flex-wrap">
                  {PENDING_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => togglePendingDay(opt.value)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium transition ${
                        pendingSchedule.includes(opt.value)
                          ? "bg-amber-500 text-white"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {pendingSchedule.length === 0 && (
                  <p className="text-xs text-amber-500 mt-2">⚠️ Nenhum prazo selecionado.</p>
                )}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-zinc-200 dark:border-zinc-800" />

          {/* Section 2: Concluded Activities */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-green-500" />
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Atividades concluídas</h3>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  Receber lembretes de concluídas
                </p>
                <p className="text-xs text-zinc-500">
                  Avisos sobre atividades que você ou outros concluíram
                </p>
              </div>
              <button
                onClick={() => setConcludedEnabled(!concludedEnabled)}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  concludedEnabled
                    ? "bg-green-500"
                    : "bg-zinc-200 dark:bg-zinc-700"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white dark:bg-zinc-900 rounded-full shadow transition-transform ${
                    concludedEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {concludedEnabled && (
              <div>
                <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100 mb-2">
                  Quando ser notificado
                </p>
                <div className="flex gap-1.5 flex-wrap">
                  {CONCLUDED_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggleConcludedDay(opt.value)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium transition ${
                        concludedSchedule.includes(opt.value)
                          ? "bg-green-500 text-white"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {concludedSchedule.length === 0 && (
                  <p className="text-xs text-amber-500 mt-2">⚠️ Nenhum prazo selecionado.</p>
                )}
              </div>
            )}
          </div>
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
