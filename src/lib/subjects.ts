export const SUBJECTS = [
  { id: "matematica", name: "Matemática", color: "bg-blue-500", accent: "border-blue-500", ring: "ring-blue-500/20", textCol: "text-blue-500" },
  { id: "portugues", name: "Português", color: "bg-red-500", accent: "border-red-500", ring: "ring-red-500/20", textCol: "text-red-500" },
  { id: "fisica", name: "Física", color: "bg-green-500", accent: "border-green-500", ring: "ring-green-500/20", textCol: "text-green-500" },
  { id: "quimica", name: "Química", color: "bg-purple-500", accent: "border-purple-500", ring: "ring-purple-500/20", textCol: "text-purple-500" },
  { id: "biologia", name: "Biologia", color: "bg-pink-500", accent: "border-pink-500", ring: "ring-pink-500/20", textCol: "text-pink-500" },
  { id: "historia", name: "História", color: "bg-yellow-500", accent: "border-yellow-500", ring: "ring-yellow-500/20", textCol: "text-yellow-500" },
  { id: "geografia", name: "Geografia", color: "bg-orange-500", accent: "border-orange-500", ring: "ring-orange-500/20", textCol: "text-orange-500" },
  { id: "ingles", name: "Inglês", color: "bg-teal-500", accent: "border-teal-500", ring: "ring-teal-500/20", textCol: "text-teal-500" },
  { id: "literatura", name: "Literatura", color: "bg-amber-500", accent: "border-amber-500", ring: "ring-amber-500/20", textCol: "text-amber-500" },
  { id: "filosofia", name: "Filosofia", color: "bg-indigo-500", accent: "border-indigo-500", ring: "ring-indigo-500/20", textCol: "text-indigo-500" },
  { id: "sociologia", name: "Sociologia", color: "bg-cyan-500", accent: "border-cyan-500", ring: "ring-cyan-500/20", textCol: "text-cyan-500" },
  { id: "redacao", name: "Redação", color: "bg-rose-500", accent: "border-rose-500", ring: "ring-rose-500/20", textCol: "text-rose-500" },
];

export function getSubject(id: string | undefined) {
  return SUBJECTS.find((s) => s.id === id) ?? null;
}
