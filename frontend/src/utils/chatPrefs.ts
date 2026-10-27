import { useSyncExternalStore } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5098';

// Kişisel sohbet tercihleri (engellenenler, susturmalar, sabitli DM'ler).
// Sunucuda tutulur; burada tek bir paylaşılan önbellek var, bileşenler
// useChatPrefs() ile abone olur.

export interface BlockedUser { id: string; username: string; avatarId?: string }

export interface ChatPrefs {
  loaded: boolean;
  blocked: BlockedUser[];
  blockedBy: string[];               // beni engelleyenlerin id'leri
  mutes: Record<string, number | null>; // anahtar → bitiş (ms) | null = süresiz
  pinnedDms: string[];
}

let state: ChatPrefs = { loaded: false, blocked: [], blockedBy: [], mutes: {}, pinnedDms: [] };
const listeners = new Set<() => void>();

function set(next: Partial<ChatPrefs>) {
  state = { ...state, ...next };
  listeners.forEach(l => l());
}

const authHeaders = (json = false): HeadersInit => ({
  Authorization: `Bearer ${localStorage.getItem('token')}`,
  ...(json ? { 'Content-Type': 'application/json' } : {}),
});

export async function loadChatPrefs(): Promise<void> {
  if (!localStorage.getItem('token')) return;
  try {
    const res = await fetch(`${API_BASE_URL}/api/me/prefs`, { headers: authHeaders() });
    if (!res.ok) return;
    const data: { blocked: BlockedUser[]; blockedBy: string[]; mutes: { key: string; until: number | null }[]; pinnedDms: string[] } = await res.json();
    const mutes: Record<string, number | null> = {};
    for (const m of data.mutes) mutes[m.key] = m.until;
    set({ loaded: true, blocked: data.blocked, blockedBy: data.blockedBy, mutes, pinnedDms: data.pinnedDms });
  } catch { /* ağ hatası — sonraki açılışta */ }
}

export function resetChatPrefs() {
  set({ loaded: false, blocked: [], blockedBy: [], mutes: {}, pinnedDms: [] });
}

export function useChatPrefs(): ChatPrefs {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => state,
  );
}

export const getChatPrefs = () => state;

// ---------- Anahtarlar ----------

export const dmMuteKey = (userId: string) => `dm:${userId}`;
export const roomMuteKey = (messageKey: string) => `room:${messageKey}`;

export function isMuted(key: string, prefs: ChatPrefs = state): boolean {
  if (!(key in prefs.mutes)) return false;
  const until = prefs.mutes[key];
  return until === null || until > Date.now();
}

export function isBlockedUsername(username: string, prefs: ChatPrefs = state): boolean {
  return prefs.blocked.some(b => b.username === username);
}

export function isBlockedEitherWay(userId: string, prefs: ChatPrefs = state): boolean {
  return prefs.blocked.some(b => b.id === userId) || prefs.blockedBy.includes(userId);
}

// ---------- İşlemler ----------

export async function blockUser(user: BlockedUser): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/api/me/blocks/${encodeURIComponent(user.id)}`, { method: 'POST', headers: authHeaders() }).catch(() => null);
  if (!res?.ok) return false;
  set({
    blocked: [...state.blocked.filter(b => b.id !== user.id), user],
    pinnedDms: state.pinnedDms.filter(id => id !== user.id),
  });
  return true;
}

export async function unblockUser(userId: string): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/api/me/blocks/${encodeURIComponent(userId)}`, { method: 'DELETE', headers: authHeaders() }).catch(() => null);
  if (!res?.ok) return false;
  set({ blocked: state.blocked.filter(b => b.id !== userId) });
  return true;
}

// minutes: null = süresiz, 0 = kaldır
export async function setMute(key: string, minutes: number | null): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/api/me/mutes`, {
    method: 'PUT', headers: authHeaders(true), body: JSON.stringify({ key, minutes }),
  }).catch(() => null);
  if (!res?.ok) return false;
  const data: { muted: boolean; until: number | null } = await res.json();
  const mutes = { ...state.mutes };
  if (data.muted) mutes[key] = data.until; else delete mutes[key];
  set({ mutes });
  return true;
}

export async function setDmPinned(userId: string, pinned: boolean): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/api/me/pins/${encodeURIComponent(userId)}`, {
    method: pinned ? 'PUT' : 'DELETE', headers: authHeaders(),
  }).catch(() => null);
  if (!res?.ok) return false;
  set({ pinnedDms: pinned ? [...state.pinnedDms.filter(id => id !== userId), userId] : state.pinnedDms.filter(id => id !== userId) });
  return true;
}

// ---------- Kaydedilen mesajlar ----------

export interface SavedMessage {
  id: number;
  kind: 'room' | 'dm';
  location: string;
  author: string;
  authorAvatarId: string;
  text: string;
  fileUrl?: string | null;
  fileName?: string | null;
  messageTs: number;
  savedAt: number;
}

export const SAVED_CHANGED_EVENT = 'saved-messages-changed';

export async function fetchSavedMessages(): Promise<SavedMessage[]> {
  const res = await fetch(`${API_BASE_URL}/api/me/saved`, { headers: authHeaders() }).catch(() => null);
  return res?.ok ? res.json() : [];
}

export async function saveMessage(msg: Omit<SavedMessage, 'id' | 'savedAt' | 'authorAvatarId'> & { authorAvatarId?: string }): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/api/me/saved`, {
    method: 'POST', headers: authHeaders(true), body: JSON.stringify(msg),
  }).catch(() => null);
  if (!res) return 'Mesaj kaydedilemedi.';
  if (!res.ok) return (await res.text().catch(() => '')) || 'Mesaj kaydedilemedi.';
  window.dispatchEvent(new Event(SAVED_CHANGED_EVENT));
  return '';
}

export async function deleteSavedMessage(id: number): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/api/me/saved/${id}`, { method: 'DELETE', headers: authHeaders() }).catch(() => null);
  return !!res?.ok;
}
