import { useEffect, useState } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5098';
const TTL_MS = 60_000;

export type BadgeKey = 'voice' | 'messages' | 'reactions' | 'night';

export interface BadgeHolder {
    key: BadgeKey;
    emoji: string;
    title: string;
    description: string;
    userId: string;
    username: string;
    avatarId: string;
    value: number;
}

export interface UserWeeklyBadges {
    weekStart: string;
    weekEnd: string;
    earned: BadgeHolder[];   // geçen haftanın kazandıkları (bu hafta boyunca profilde)
    leading: BadgeHolder[];  // bu hafta şu an önde oldukları
    stats: { voiceSeconds: number; messages: number; reactions: number; nightMessages: number };
}

// Her rozetin kendi rengi; kartlarda hafif cam + renkli parıltı olarak kullanılır
export const BADGE_COLORS: Record<BadgeKey, string> = {
    voice: '#f59e0b',
    messages: '#38bdf8',
    reactions: '#f43f5e',
    night: '#a78bfa',
};

export function formatVoice(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return m > 0 ? `${h} sa ${m} dk` : `${h} sa`;
    return `${m} dk`;
}

export function formatBadgeValue(key: BadgeKey, value: number): string {
    switch (key) {
        case 'voice': return `${formatVoice(value)} seste`;
        case 'messages': return `${value} mesaj`;
        case 'reactions': return `${value} tepki`;
        case 'night': return `${value} gece mesajı`;
    }
}

// Profil kartı her açıldığında istek atmamak için kısa ömürlü önbellek (userProfile ile aynı yaklaşım)
const cache = new Map<string, { at: number; promise: Promise<UserWeeklyBadges | null> }>();

export function fetchUserBadges(userId: string): Promise<UserWeeklyBadges | null> {
    const hit = cache.get(userId);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;

    const promise = fetch(`${API_BASE_URL}/api/badges/users/${encodeURIComponent(userId)}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
    })
        .then(res => (res.ok ? res.json() as Promise<UserWeeklyBadges> : null))
        .catch(() => null);
    cache.set(userId, { at: Date.now(), promise });
    return promise;
}

export function useUserBadges(userId?: string) {
    const [loaded, setLoaded] = useState<{ id: string; data: UserWeeklyBadges | null } | null>(null);
    useEffect(() => {
        if (!userId) return;
        let alive = true;
        fetchUserBadges(userId).then(data => { if (alive) setLoaded({ id: userId, data }); });
        return () => { alive = false; };
    }, [userId]);
    return userId && loaded?.id === userId ? loaded.data : null;
}
