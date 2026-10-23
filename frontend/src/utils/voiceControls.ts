import { useSyncExternalStore } from 'react';

// Sustur / sağırlaştır durumu — lobideki kullanıcı kartı, oda içi butonlar ve
// kısayollar aynı durumu paylaşır. Sesli oturumlar (useWebRTC, useVoiceChannel)
// bunu dinleyip mikrofonu ve gelen sesi uygular. Tarayıcıda saklanır; tıpkı
// Discord'daki gibi yenilemeden sonra da korunur.
export interface VoiceControlsState {
    micMuted: boolean;
    deafened: boolean;
}

const STORAGE_KEY = 'voiceControls';

function load(): VoiceControlsState {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const p = JSON.parse(raw);
            return { micMuted: !!p.micMuted, deafened: !!p.deafened };
        }
    } catch { /* depolama kapalı olabilir */ }
    return { micMuted: false, deafened: false };
}

let state: VoiceControlsState = load();
const listeners = new Set<() => void>();

function set(next: VoiceControlsState) {
    state = next;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* yok say */ }
    listeners.forEach(l => l());
}

export const voiceControls = {
    get: () => state,
    subscribe(listener: () => void) {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
    },
    // Sağırken susturmayı kaldırmak sağırlığı da kaldırır (Discord davranışı).
    toggleMic() {
        if (state.deafened) set({ micMuted: false, deafened: false });
        else set({ ...state, micMuted: !state.micMuted });
    },
    toggleDeafen() {
        set({ ...state, deafened: !state.deafened });
    },
};

export function useVoiceControls(): VoiceControlsState & { micBlocked: boolean } {
    const s = useSyncExternalStore(voiceControls.subscribe, voiceControls.get);
    // Sağırlaştırılmışken mikrofon da kapalıdır.
    return { ...s, micBlocked: s.micMuted || s.deafened };
}
