import { useEffect, useState } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5098';
const TTL_MS = 60_000;

export interface UserProfile {
    id: string;
    username: string;
    firstName?: string;
    lastName?: string;
    avatarId?: string;
    customStatus?: string;
    customStatusMessage?: string | null;
    bannerColor?: string | null;
    accentColor?: string | null;
    bio?: string | null;
    createdAt?: string;
}

// Profil kartları sık açılıp kapanır; her açılışta istek atmamak için kısa ömürlü önbellek.
const cache = new Map<string, { at: number; promise: Promise<UserProfile | null> }>();

export function fetchUserProfile(userId: string): Promise<UserProfile | null> {
    const hit = cache.get(userId);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;

    const promise = fetch(`${API_BASE_URL}/api/users/${encodeURIComponent(userId)}/profile`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
    })
        .then(res => (res.ok ? res.json() as Promise<UserProfile> : null))
        .catch(() => null);
    cache.set(userId, { at: Date.now(), promise });
    return promise;
}

export function invalidateUserProfile(userId: string) {
    cache.delete(userId);
}

export function useUserProfile(userId?: string) {
    // Hangi kullanıcıya ait olduğu da tutulur: kart başka kullanıcıya geçince eski profil görünmez
    const [loaded, setLoaded] = useState<{ id: string; profile: UserProfile | null } | null>(null);
    useEffect(() => {
        if (!userId) return;
        let alive = true;
        fetchUserProfile(userId).then(profile => { if (alive) setLoaded({ id: userId, profile }); });
        return () => { alive = false; };
    }, [userId]);
    return userId && loaded?.id === userId ? loaded.profile : null;
}

// Banner: tek renkten iki tonlu yumuşak gradyan; renk yoksa uygulamanın vurgu rengi
export function bannerBackground(color?: string | null): string {
    if (!color) return 'linear-gradient(120deg, rgba(var(--accent-rgb),0.55), rgba(var(--accent-light-rgb),0.25))';
    return `linear-gradient(120deg, ${color} 0%, ${color}b3 55%, ${color}66 100%)`;
}

export const PROFILE_SWATCHES = ['#7c3aed', '#2563eb', '#0891b2', '#059669', '#65a30d', '#d97706', '#ea580c', '#e11d48', '#db2777', '#475569'];
export const MAX_BIO_LENGTH = 190;
