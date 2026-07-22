// @mention yardımcıları — mesaj metni düz string kalır, ayrıştırma render anında.

export interface MentionSegment {
  type: 'text' | 'mention';
  value: string;      // mention için @'siz kullanıcı adı, text için düz metin
}

// Kullanıcı adları harf/rakam/altçizgi/nokta/tire içerebilir; @ad kelime
// sınırında biter (boşluk, satır sonu veya diğer noktalama).
const MENTION_RE = /@([\p{L}\p{N}_.-]+)/gu;

// Metni text/mention segmentlerine ayırır. knownUsernames verilirse yalnızca
// gerçek kullanıcı adlarıyla eşleşenler mention sayılır (yanlış pozitif önlenir).
export function parseMentions(text: string, knownUsernames?: string[]): MentionSegment[] {
  const known = knownUsernames?.map(u => u.toLowerCase());
  const segments: MentionSegment[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(MENTION_RE)) {
    const idx = match.index ?? 0;
    const name = match[1];
    const isKnown = !known || known.includes(name.toLowerCase());
    if (!isKnown) continue;
    if (idx > lastIndex) segments.push({ type: 'text', value: text.slice(lastIndex, idx) });
    segments.push({ type: 'mention', value: name });
    lastIndex = idx + match[0].length;
  }
  if (lastIndex < text.length) segments.push({ type: 'text', value: text.slice(lastIndex) });
  if (segments.length === 0) segments.push({ type: 'text', value: text });
  return segments;
}

// Metin beni etiketliyor mu? (kelime sınırlı, büyük/küçük harf duyarsız)
export function containsMention(text: string, myUsername: string): boolean {
  if (!myUsername) return false;
  const target = myUsername.toLowerCase();
  for (const match of text.matchAll(MENTION_RE)) {
    if (match[1].toLowerCase() === target) return true;
  }
  return false;
}

// Caret pozisyonundan geriye doğru aktif "@kısmi" sorgusunu bulur.
// Dönen start = @ işaretinin index'i; eşleşme yoksa null.
export function getActiveMentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const upToCaret = text.slice(0, caret);
  const atIdx = upToCaret.lastIndexOf('@');
  if (atIdx === -1) return null;
  // @'ten önce boşluk ya da satır başı olmalı (e-posta vb. yakalanmasın)
  if (atIdx > 0 && !/\s/.test(upToCaret[atIdx - 1])) return null;
  const query = upToCaret.slice(atIdx + 1);
  // Sorguda boşluk varsa mention yazımı bitmiştir
  if (/\s/.test(query)) return null;
  return { start: atIdx, query };
}
