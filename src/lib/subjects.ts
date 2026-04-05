export const SUBJECTS = [
  { id: "matematica", emoji: "\ud83d\udcd0", name: "Matem\u00e1tica", color: "bg-blue-500", accent: "border-blue-500", ring: "ring-blue-500/20", textCol: "text-blue-500" },
  { id: "portugues", emoji: "\ud83d\udcdd", name: "Portugu\u00eas", color: "bg-red-500", accent: "border-red-500", ring: "ring-red-500/20", textCol: "text-red-500" },
  { id: "fisica", emoji: "\u26a1", name: "F\u00edsica", color: "bg-green-500", accent: "border-green-500", ring: "ring-green-500/20", textCol: "text-green-500" },
  { id: "quimica", emoji: "\ud83e\uddea", name: "Qu\u00edmica", color: "bg-purple-500", accent: "border-purple-500", ring: "ring-purple-500/20", textCol: "text-purple-500" },
  { id: "biologia", emoji: "\ud83e\uddec", name: "Biologia", color: "bg-pink-500", accent: "border-pink-500", ring: "ring-pink-500/20", textCol: "text-pink-500" },
  { id: "historia", emoji: "\ud83d\udcdc", name: "Hist\u00f3ria", color: "bg-yellow-500", accent: "border-yellow-500", ring: "ring-yellow-500/20", textCol: "text-yellow-500" },
  { id: "geografia", emoji: "\ud83c\udf0d", name: "Geografia", color: "bg-orange-500", accent: "border-orange-500", ring: "ring-orange-500/20", textCol: "text-orange-500" },
  { id: "ingles", emoji: "\ud83c\uddec\ud83c\udde7", name: "Ingl\u00eas", color: "bg-teal-500", accent: "border-teal-500", ring: "ring-teal-500/20", textCol: "text-teal-500" },
  { id: "literatura", emoji: "\ud83d\udcd6", name: "Literatura", color: "bg-amber-500", accent: "border-amber-500", ring: "ring-amber-500/20", textCol: "text-amber-500" },
  { id: "filosofia", emoji: "\ud83e\udd14", name: "Filosofia", color: "bg-indigo-500", accent: "border-indigo-500", ring: "ring-indigo-500/20", textCol: "text-indigo-500" },
  { id: "sociologia", emoji: "\ud83d\udc65", name: "Sociologia", color: "bg-cyan-500", accent: "border-cyan-500", ring: "ring-cyan-500/20", textCol: "text-cyan-500" },
  { id: "redacao", emoji: "\u270d\ufe0f", name: "Reda\u00e7\u00e3o", color: "bg-rose-500", accent: "border-rose-500", ring: "ring-rose-500/20", textCol: "text-rose-500" },
];

export function getSubject(id: string | undefined) {
  return SUBJECTS.find((s) => s.id === id) ?? null;
}
