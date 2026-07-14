// Rol sistemi paylaşılan yardımcıları (Özellik 6)

export const roleRank = (role?: string): number =>
  role === 'owner' ? 2 : role === 'moderator' ? 1 : role === 'member' ? 0 : -1;

// 👑 Kurucu / 🛡️ Moderatör — üye ve sistem odası için rozet yok
export const roleBadgeEmoji = (role?: string): string | null =>
  role === 'owner' ? '👑' : role === 'moderator' ? '🛡️' : null;

export const roleLabel = (role?: string): string =>
  role === 'owner' ? 'Kurucu' : role === 'moderator' ? 'Moderatör' : 'Üye';

// Liste sırası: Kurucu → Moderatör → Üye, sonra isim
export function sortByRole<T extends { role?: string; username: string }>(a: T, b: T): number {
  const diff = roleRank(b.role) - roleRank(a.role);
  if (diff !== 0) return diff;
  return a.username.localeCompare(b.username);
}
