import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';

// Altta sayılma eşiği (px) — bu kadar yakınsa kullanıcı "en altta" kabul edilir
const BOTTOM_THRESHOLD = 80;
// Üste bu kadar yaklaşınca eski mesajlar yüklenir
const TOP_THRESHOLD = 60;

interface Options {
    // İçerik her değiştiğinde değişen değer (mesaj sayısı, son mesaj id'si, yazıyor durumu...)
    contentKey: unknown;
    // Oda/kanal değişince (veya panel yeniden mount olunca) sohbet yeniden en alttan açılır
    resetKey?: unknown;
    // Üste yaklaşınca eski mesajları göster (sayfalama); kaydırma konumu korunur
    onReachTop?: () => void;
}

/**
 * Sohbet kaydırması: en son mesajdan açılır, kullanıcı en alttayken yeni mesaj,
 * yüklenen resim/embed veya klavye açılması gibi boyut değişimlerinde en altta kalır.
 * Kullanıcı yukarı kaydırdıysa yerinden oynatılmaz. scrollIntoView yerine kapsayıcının
 * scrollTop'u kullanılır; böylece mobilde tüm sayfa kaymaz ve smooth animasyon
 * yarıda kesilip sohbeti ortada bırakmaz.
 */
export function useStickToBottom(ref: RefObject<HTMLElement | null>, { contentKey, resetKey, onReachTop }: Options) {
    const pinnedRef = useRef(true);
    // Eski mesajlar yüklenmeden önceki scrollHeight — yüklendikten sonra konumu korumak için
    const prependFromHeight = useRef<number | null>(null);

    const scrollToBottom = useCallback(() => {
        pinnedRef.current = true;
        const el = ref.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [ref]);

    // Oda değişince yeniden en alttan başla
    useLayoutEffect(() => {
        prependFromHeight.current = null;
        scrollToBottom();
    }, [resetKey, scrollToBottom]);

    // İçerik değişti: alttaysa altta kal, eski mesajlar eklendiyse konumu koru
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (pinnedRef.current) {
            el.scrollTop = el.scrollHeight;
        } else if (prependFromHeight.current !== null) {
            el.scrollTop += el.scrollHeight - prependFromHeight.current;
        }
        prependFromHeight.current = null;
    }, [contentKey, ref]);

    // Resim/embed yüklenmesi, ekran/klavye boyutu: alttaysa altta tut
    useEffect(() => {
        const el = ref.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        const stick = () => {
            if (pinnedRef.current) el.scrollTop = el.scrollHeight;
        };
        const ro = new ResizeObserver(stick);
        ro.observe(el);
        Array.from(el.children).forEach(child => ro.observe(child));
        // Yüklenen resimler (load event'i kabarcıklanmaz, capture ile yakalanır)
        el.addEventListener('load', stick, true);
        return () => {
            ro.disconnect();
            el.removeEventListener('load', stick, true);
        };
    }, [ref, resetKey, contentKey]);

    const onScroll = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
        pinnedRef.current = distance < BOTTOM_THRESHOLD;
        if (onReachTop && !pinnedRef.current && el.scrollTop < TOP_THRESHOLD && prependFromHeight.current === null) {
            prependFromHeight.current = el.scrollHeight;
            onReachTop();
        }
    }, [ref, onReachTop]);

    return { onScroll, scrollToBottom };
}
