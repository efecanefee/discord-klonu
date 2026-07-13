import { useEffect, useRef } from 'react';

interface UseKeybindsOptions {
    /** Bas-konuş etkin mi (settings.pushToTalk) */
    pttEnabled: boolean;
    /** Bas-konuş tuşu (KeyboardEvent.code) */
    pttKey: string;
    /** Mikrofon aç/kapat kısayolu (KeyboardEvent.code) — pushToTalk'tan bağımsız çalışır */
    muteToggleKey?: string;
    onPTTDown: () => void;
    onPTTUp: () => void;
    onMuteToggle?: () => void;
}

// Bir yazı alanına odaklanılmışsa kısayolları yoksay
const isTypingTarget = (target: EventTarget | null): boolean => {
    const el = target as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
};

/**
 * Global klavye kısayolları: bas-konuş (basılı tut) + mikrofon aç/kapat (tek basış).
 * NOT: Tarayıcı sekmesi odakta değilken tuşlar yakalanamaz (web sınırı).
 */
export function useKeybinds({ pttEnabled, pttKey, muteToggleKey, onPTTDown, onPTTUp, onMuteToggle }: UseKeybindsOptions) {
    // Callback'leri ref'te tut — listener'ı yeniden bağlamadan her zaman en güncelini çağır
    const cbRef = useRef({ onPTTDown, onPTTUp, onMuteToggle });
    cbRef.current = { onPTTDown, onPTTUp, onMuteToggle };

    // PTT tuşunun basılı olup olmadığını takip et (keydown tekrarını engelle)
    const pttHeld = useRef(false);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isTypingTarget(e.target)) return;

            // Mikrofon aç/kapat (tek basış)
            if (muteToggleKey && e.code === muteToggleKey && !e.repeat) {
                e.preventDefault();
                cbRef.current.onMuteToggle?.();
                return;
            }

            // Bas-konuş (basılı tut)
            if (pttEnabled && e.code === pttKey) {
                if (!pttHeld.current) {
                    pttHeld.current = true;
                    e.preventDefault();
                    cbRef.current.onPTTDown();
                }
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (pttEnabled && e.code === pttKey) {
                if (pttHeld.current) {
                    pttHeld.current = false;
                    cbRef.current.onPTTUp();
                }
            }
        };

        // Sekme odağı kaybolursa PTT'yi bırak (tuş yukarı event'i kaçarsa mikrofon açık kalmasın)
        const handleBlur = () => {
            if (pttHeld.current) {
                pttHeld.current = false;
                cbRef.current.onPTTUp();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('blur', handleBlur);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('blur', handleBlur);
        };
    }, [pttEnabled, pttKey, muteToggleKey]);
}
