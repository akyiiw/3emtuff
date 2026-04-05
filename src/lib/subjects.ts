export const SUBJECTS = [
  { id: "matematica", emoji: "\ud83d\udcd0", name: "Matem\u00e1tica", color: "bg-blue-500", darkColor: "dark:bg-blue-600", accent: "border-blue-500", ring: "ring-blue-500/30 dark:ring-blue-400/30", textCol: "text-blue-500 dark:text-blue-400" },
  { id: "portugues", emoji: "\ud83d\udcdd", name: "Portugu\u00eas", color: "bg-red-500", darkColor: "dark:bg-red-600", accent: "border-red-500", ring: "ring-red-500/30 dark:ring-red-400/30", textCol: "text-red-500 dark:text-red-400" },
  { id: "fisica", emoji: "\u26a1", name: "F\u00edsica", color: "bg-green-500", darkColor: "dark:bg-green-600", accent: "border-green-500", ring: "ring-green-500/30 dark:ring-green-400/30", textCol: "text-green-500 dark:text-green-400" },
  { id: "quimica", emoji: "\ud83e\uddea", name: "Qu\u00edmica", color: "bg-purple-500", darkColor: "dark:bg-purple-600", accent: "border-purple-500", ring: "ring-purple-500/30 dark:ring-purple-400/30", textCol: "text-purple-500 dark:text-purple-400" },
  { id: "biologia", emoji: "\ud83e\uddec", name: "Biologia", color: "bg-pink-500", darkColor: "dark:bg-pink-600", accent: "border-pink-500", ring: "ring-pink-500/30 dark:ring-pink-400/30", textCol: "text-pink-500 dark:text-pink-400" },
  { id: "historia", emoji: "\ud83d\udcdc", name: "Hist\u00f3ria", color: "bg-amber-500", darkColor: "dark:bg-amber-600", accent: "border-amber-500", ring: "ring-amber-500/30 dark:ring-amber-400/30", textCol: "text-amber-500 dark:text-amber-400" },
  { id: "geografia", emoji: "\ud83c\udf0d", name: "Geografia", color: "bg-orange-500", darkColor: "dark:bg-orange-600", accent: "border-orange-500", ring: "ring-orange-500/30 dark:ring-orange-400/30", textCol: "text-orange-500 dark:text-orange-400" },
  { id: "ingles", emoji: "\ud83c\uddec\ud83c\udde7", name: "Ingl\u00eas", color: "bg-teal-500", darkColor: "dark:bg-teal-600", accent: "border-teal-500", ring: "ring-teal-500/30 dark:ring-teal-400/30", textCol: "text-teal-500 dark:text-teal-400" },
  { id: "literatura", emoji: "\ud83d\udcd6", name: "Literatura", color: "bg-yellow-500", darkColor: "dark:bg-yellow-500", accent: "border-yellow-500", ring: "ring-yellow-500/30 dark:ring-yellow-400/30", textCol: "text-yellow-600 dark:text-yellow-400" },
  { id: "filosofia", emoji: "\ud83e\udd14", name: "Filosofia", color: "bg-indigo-500", darkColor: "dark:bg-indigo-600", accent: "border-indigo-500", ring: "ring-indigo-500/30 dark:ring-indigo-400/30", textCol: "text-indigo-500 dark:text-indigo-400" },
  { id: "sociologia", emoji: "\ud83d\udc65", name: "Sociologia", color: "bg-cyan-500", darkColor: "dark:bg-cyan-600", accent: "border-cyan-500", ring: "ring-cyan-500/30 dark:ring-cyan-400/30", textCol: "text-cyan-500 dark:text-cyan-400" },
  { id: "redacao", emoji: "\u270d\ufe0f", name: "Reda\u00e7\u00e3o", color: "bg-rose-500", darkColor: "dark:bg-rose-600", accent: "border-rose-500", ring: "ring-rose-500/30 dark:ring-rose-400/30", textCol: "text-rose-500 dark:text-rose-400" },
];

export function getSubject(id: string | undefined) {
  return SUBJECTS.find((s) => s.id === id) ?? null;
}
