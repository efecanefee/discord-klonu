import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Youtube, Users } from 'lucide-react';
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
  username: string;
}

interface Session {
  videoId: string;
  startedBy: string;
}

// Ana Salon'da senkron YouTube izleme partisi.
// "Aç": odadakilere izleme partisi DAVETİ gider; sadece "Katıl" diyenler
// videoyu birlikte, senkron izler. Başlatan kişi anında katılır.
// Not: YouTube TOS gereği oynatıcı görünür kalmalı (>=200x200).
const YoutubePlayerPanel: React.FC<YoutubePlayerPanelProps> = ({ roomId, username }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [joined, setJoined] = useState(false);
  const [needsInteraction, setNeedsInteraction] = useState(false);
  const [error, setError] = useState('');
  const playerHostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  // Uzaktan gelen komutları uygularken kendi onStateChange'imiz sync yaymasın
  const suppressRef = useRef(false);
  const suppressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Katılma anında doğru pozisyonu hesaplamak için (video daveti + geç katılım)
  const pendingJoinRef = useRef<{ position: number; isPlaying: boolean; receivedAt: number } | null>(null);
  const roomIdRef = useRef(roomId);
  useEffect(() => { roomIdRef.current = roomId; }, [roomId]);
  const usernameRef = useRef(username);
  useEffect(() => { usernameRef.current = username; }, [username]);

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

  // Oynatıcıyı oluşturup autoplay engelini kontrol eden yardımcı (ses / başlatan)
  const autoJoin = useCallback((vid: string, startAt: number, wasPlaying: boolean) => {
    setJoined(true);
    suppress();
    createPlayer(vid, { autoplay: wasPlaying, startAt });
    // Tarayıcı sesli autoplay'i engellerse "tıkla" overlay'i göster
    setTimeout(() => {
      const state = playerRef.current?.getPlayerState?.();
      const YTState = window.YT?.PlayerState;
      if (wasPlaying && YTState && state !== undefined && state !== YTState.PLAYING && state !== YTState.BUFFERING) {
        setNeedsInteraction(true);
      }
    }, 2000);
  }, [createPlayer, suppress]);

  useEffect(() => {
    const handleStarted = (videoId: string, by: string) => {
      setSession({ videoId, startedBy: by });
      setNeedsInteraction(false);
      setError('');
      pendingJoinRef.current = { position: 0, isPlaying: true, receivedAt: Date.now() };
      const iStarted = by === usernameRef.current;
      if (iStarted) {
        // Başlatan kişi → anında katıl
        autoJoin(videoId, 0, true);
      } else {
        // İzleme partisi daveti — kullanıcı "Katıl" demeden oynatıcı açılmaz
        setJoined(false);
        destroyPlayer();
      }
    };

    const handleState = (videoId: string, isPlaying: boolean, position: number, by: string) => {
      // Odaya sonradan girenler için güncel durum — davet göster, otomatik katılma
      setSession({ videoId, startedBy: by });
      pendingJoinRef.current = { position, isPlaying, receivedAt: Date.now() };
      setError('');
      setJoined(false);
      destroyPlayer();
    };

    const handleSync = (action: string, position: number) => {
      const p = playerRef.current;
      if (!p?.seekTo) return;
      suppress();
      p.seekTo(position, true);
      if (action === 'pause') p.pauseVideo?.();
      else p.playVideo?.();
    };

    const handleStopped = () => {
      destroyPlayer();
      setSession(null);
      setJoined(false);
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
  }, [autoJoin, createPlayer, destroyPlayer, suppress]);

  // "Katıl" / "tıkla-katıl": daveti kabul et ya da sesli autoplay'i aç
  const handleJoinClick = async () => {
    if (!session) return;
    const pending = pendingJoinRef.current;
    const elapsed = pending?.isPlaying ? (Date.now() - pending.receivedAt) / 1000 : 0;
    const startAt = (pending?.position ?? 0) + elapsed;

    setJoined(true);
    setNeedsInteraction(false);
    suppress();

    if (playerRef.current?.seekTo) {
      playerRef.current.seekTo(startAt, true);
      playerRef.current.playVideo?.();
    } else {
      await createPlayer(session.videoId, { autoplay: true, startAt });
    }
  };

  const handleStop = () => {
    signalrService.stopYoutube(roomIdRef.current);
  };

  const handleDismissInvite = () => {
    // Daveti yerel olarak kapat (başkalarını etkilemez)
    setSession(null);
    pendingJoinRef.current = null;
  };

  const isVideoInvite = session && !joined;

  return (
    <AnimatePresence>
      {session && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          className="absolute bottom-24 right-3 z-40 w-[304px] max-w-[calc(100vw-1.5rem)] bg-bg-surface border border-border-main rounded-2xl shadow-2xl overflow-hidden"
        >
          {isVideoInvite ? (
            // ===== İzleme partisi daveti =====
            <div className="p-4 flex flex-col items-center text-center gap-3">
              <span className="p-2.5 rounded-full bg-red-500/15 text-red-400"><Users size={20} /></span>
              <div>
                <p className="text-sm text-text-main font-semibold">İzleme Partisi Daveti</p>
                <p className="text-xs text-text-muted mt-0.5">
                  <span className="text-text-main">{session.startedBy}</span> bir video izleme partisi başlattı
                </p>
              </div>
              <div className="flex gap-2 w-full">
                <button onClick={handleDismissInvite} className="flex-1 px-3 py-2 rounded-xl bg-surface-subtle text-text-muted text-xs font-semibold hover:text-text-main transition-colors">
                  Reddet
                </button>
                <button onClick={handleJoinClick} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-primary-main text-white text-xs font-semibold hover:brightness-110 transition-all">
                  <Play size={13} /> Katıl
                </button>
              </div>
            </div>
          ) : (
            // ===== Oynatıcı (katılınmış izleme partisi) =====
            <>
              <div className="flex items-center justify-between px-3 py-2 border-b border-border-main">
                <span className="flex items-center gap-2 text-xs text-text-muted min-w-0">
                  <Youtube size={14} className="text-red-500 shrink-0" />
                  <span className="truncate">başlatan: <span className="text-text-main font-medium">{session.startedBy}</span></span>
                </span>
                <button onClick={handleStop} title="Herkes için durdur" className="p-1.5 text-text-muted hover:text-red-400 rounded-full hover:bg-surface-subtle transition-colors shrink-0">
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
                    <span className="text-sm font-semibold">İzlemek için tıkla</span>
                  </button>
                )}
              </div>

              {error && (
                <div className="px-3 pb-2 text-xs text-red-400">{error}</div>
              )}
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default YoutubePlayerPanel;
