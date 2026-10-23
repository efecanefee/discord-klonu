import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

type WebkitVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void; webkitSupportsFullscreen?: boolean };

// Bir kutuyu (video + kontroller) tam ekran yapar. iOS Safari div'i tam ekran
// yapamaz; orada videonun kendi tam ekranına düşer. Tam ekrandayken fare
// 2.5 sn kıpırdamazsa kontroller ve imleç gizlenir.
export function useElementFullscreen(containerRef: RefObject<HTMLElement | null>, videoRef: RefObject<HTMLVideoElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef<number | null>(null);

  useEffect(() => {
    const onChange = () => {
      const fs = document.fullscreenElement != null && document.fullscreenElement === containerRef.current;
      setIsFullscreen(fs);
      setIdle(false);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [containerRef]);

  useEffect(() => () => { if (idleTimer.current) window.clearTimeout(idleTimer.current); }, []);

  const poke = useCallback(() => {
    setIdle(false);
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setIdle(true), 2500);
  }, []);

  const toggle = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement === el) {
      document.exitFullscreen().catch(() => { /* yoksay */ });
      return;
    }
    if (el.requestFullscreen) {
      el.requestFullscreen({ navigationUI: 'hide' }).then(poke).catch(() => {
        (videoRef.current as WebkitVideo | null)?.webkitEnterFullscreen?.();
      });
    } else {
      (videoRef.current as WebkitVideo | null)?.webkitEnterFullscreen?.();
    }
  }, [containerRef, videoRef, poke]);

  return { isFullscreen, controlsHidden: isFullscreen && idle, toggle, poke };
}
