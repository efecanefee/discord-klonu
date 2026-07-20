import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Youtube } from 'lucide-react';
import signalrService from '../services/signalrService';

// YouTube IFrame API tipleri (minimal)
declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

// IFrame API script'i tüm uygulama ömründe bir kez enjekte edilir.
let ytApiPromise: Promise<void> | null = null;
const loadYoutubeApi = (): Promise<void> => {
  if (window.YT?.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise<void>((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
  return ytApiPromise;
};

interface YoutubePlayerPanelProps {
  roomId: string;
}

// Ana Salon'da senkron YouTube müzik oynatıcısı. Herhangi biri başlatabilir,
// play/pause/seek herkese SignalR ile yayılır. Not: YouTube TOS gereği
// oynatıcı görünür kalmalı (>=200x200), o yüzden küçük ama görünür bir panel.
const YoutubePlayerPanel: React.FC<YoutubePlayerPanelProps> = ({ roomId }) => {
  const [videoId, setVideoId] = useState<string | null>(null);
  const [startedBy, setStartedBy] = useState('');
  const [needsInteraction, setNeedsInteraction] = useState(false);
  const [error, setError] = useState('');
  const playerHostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  // Uzaktan gelen komutları uygularken kendi onStateChange'imiz sync yaymasın
  const suppressRef = useRef(false);
  const suppressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Geç katılım: tıkla-katıl anında doğru pozisyonu hesaplamak için
  const pendingJoinRef = useRef<{ position: number; isPlaying: boolean; receivedAt: number } | null>(null);
  const roomIdRef = useRef(roomId);
  useEffect(() => { roomIdRef.current = roomId; }, [roomId]);

  const suppress = useCallback((ms = 800) => {
    suppressRef.current = true;
    if (suppressTimerRef.current) clearTimeout(suppressTimerRef.current);
    suppressTimerRef.current = setTimeout(() => { suppressRef.current = false; }, ms);
  }, []);

  const destroyPlayer = useCallback(() => {
    try { playerRef.current?.destroy(); } catch { /* yoksay */ }
    playerRef.current = null;
  }, []);

  const createPlayer = useCallback(async (vid: string, opts: { autoplay: boolean; startAt?: number }) => {
    setError('');
    await loadYoutubeApi();
    if (!playerHostRef.current) return;
    destroyPlayer();
    // YT.Player hedef div'i iframe ile DEĞİŞTİRİR; sabit bir iç div kullan
    const inner = document.createElement('div');
    playerHostRef.current.innerHTML = '';
    playerHostRef.current.appendChild(inner);

    playerRef.current = new window.YT.Player(inner, {
      width: '288',
      height: '200',
      videoId: vid,
      playerVars: {
        autoplay: opts.autoplay ? 1 : 0,
        start: Math.max(0, Math.floor(opts.startAt ?? 0)),
        playsinline: 1,
        rel: 0,
      },
      events: {
        onStateChange: (e: any) => {
          if (suppressRef.current) return;
          const YTState = window.YT?.PlayerState;
          if (!YTState) return;
          if (e.data === YTState.PLAYING) {
            setNeedsInteraction(false);
            signalrService.syncYoutube(roomIdRef.current, 'play', e.target.getCurrentTime());
          } else if (e.data === YTState.PAUSED) {
            signalrService.syncYoutube(roomIdRef.current, 'pause', e.target.getCurrentTime());
          }
        },
        onError: (e: any) => {
          // 101/150: gömme kapalı, 100: video yok
          if ([100, 101, 150].includes(e.data)) {
            setError('Bu video gömülemiyor, başka bir tane dene.');
            signalrService.stopYoutube(roomIdRef.current);
          }
        },
      },
    });
  }, [destroyPlayer]);

  useEffect(() => {
    const handleStarted = (vid: string, username: string) => {
      setVideoId(vid);
      setStartedBy(username);
      setNeedsInteraction(false);
      pendingJoinRef.current = null;
      suppress();
      // Otomatik oynatma engellenirse kullanıcıya tıkla-katıl göster
      createPlayer(vid, { autoplay: true });
      setTimeout(() => {
        const state = playerRef.current?.getPlayerState?.();
        const YTState = window.YT?.PlayerState;
        if (YTState && state !== undefined && state !== YTState.PLAYING && state !== YTState.BUFFERING) {
          pendingJoinRef.current = { position: 0, isPlaying: true, receivedAt: Date.now() };
          setNeedsInteraction(true);
        }
      }, 2000);
    };

    const handleSync = (action: string, position: number) => {
      const p = playerRef.current;
      if (!p?.seekTo) return;
      suppress();
      p.seekTo(position, true);
      if (action === 'pause') p.pauseVideo?.();
      else p.playVideo?.();
    };

    const handleState = (vid: string, isPlaying: boolean, position: number, by: string) => {
      // Geç katılım: autoplay izni olmadığından tıkla-katıl overlay'i ile başlat
      setVideoId(vid);
      setStartedBy(by);
      pendingJoinRef.current = { position, isPlaying, receivedAt: Date.now() };
      setNeedsInteraction(true);
      suppress();
      createPlayer(vid, { autoplay: false, startAt: position });
    };

    const handleStopped = () => {
      destroyPlayer();
      setVideoId(null);
      setStartedBy('');
      setNeedsInteraction(false);
      setError('');
      pendingJoinRef.current = null;
    };

    signalrService.onYoutubeStarted(handleStarted);
    signalrService.onYoutubeSync(handleSync);
    signalrService.onYoutubeState(handleState);
    signalrService.onYoutubeStopped(handleStopped);

    return () => {
      signalrService.offYoutubeStarted(handleStarted);
      signalrService.offYoutubeSync(handleSync);
      signalrService.offYoutubeState(handleState);
      signalrService.offYoutubeStopped(handleStopped);
      if (suppressTimerRef.current) clearTimeout(suppressTimerRef.current);
      destroyPlayer();
    };
  }, [createPlayer, destroyPlayer, suppress]);

  const handleJoinClick = () => {
    const pending = pendingJoinRef.current;
    const p = playerRef.current;
    setNeedsInteraction(false);
    if (!p?.seekTo) return;
    suppress();
    if (pending) {
      const elapsed = pending.isPlaying ? (Date.now() - pending.receivedAt) / 1000 : 0;
      p.seekTo(pending.position + elapsed, true);
      if (pending.isPlaying) p.playVideo?.();
      pendingJoinRef.current = null;
    } else {
      p.playVideo?.();
    }
  };

  const handleStop = () => {
    signalrService.stopYoutube(roomIdRef.current);
  };

  return (
    <AnimatePresence>
      {videoId && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          className="absolute bottom-24 right-3 z-40 w-[304px] bg-bg-surface border border-border-main rounded-2xl shadow-2xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-border-main">
            <span className="flex items-center gap-2 text-xs text-text-muted min-w-0">
              <Youtube size={14} className="text-red-500 shrink-0" />
              <span className="truncate">başlatan: <span className="text-text-main font-medium">{startedBy || '—'}</span></span>
            </span>
            <button onClick={handleStop} title="Müziği herkes için durdur" className="p-1.5 text-text-muted hover:text-red-400 rounded-full hover:bg-surface-subtle transition-colors shrink-0">
              <X size={14} />
            </button>
          </div>

          <div className="relative p-2">
            {/* YouTube TOS: oynatıcı görünür ve >=200x200 kalmalı */}
            <div ref={playerHostRef} className="w-[288px] h-[200px] rounded-lg overflow-hidden bg-black" />
            {needsInteraction && (
              <button
                onClick={handleJoinClick}
                className="absolute inset-2 flex flex-col items-center justify-center gap-2 bg-black/80 text-white rounded-lg hover:bg-black/70 transition-colors"
              >
                <span className="p-3 rounded-full bg-primary-main/90"><Play size={20} /></span>
                <span className="text-sm font-semibold">Müziğe katılmak için tıkla</span>
              </button>
            )}
          </div>

          {error && (
            <div className="px-3 pb-2 text-xs text-red-400">{error}</div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default YoutubePlayerPanel;
