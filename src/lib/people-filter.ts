/** Whether a person shows for a search text and a department. Both are optional; an empty one matches everyone. */
export function matchesPerson(
  person: { name: string; department?: string | null },
  query: string,
  department: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (q && !person.name.toLowerCase().includes(q)) return false;
  if (department && (person.department ?? "") !== department) return false;
  return true;
}
