import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useDragControls, useMotionValue } from 'framer-motion';
import { X, Play, Youtube, Users, SkipForward, ListMusic, Trash2, ChevronDown, GripVertical } from 'lucide-react';
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
const PLAYER_POS_KEY = 'ytPlayerPos';
const PLAYER_SIZE_KEY = 'ytPlayerWidth';
// Oynatıcı genişliği sınırları; yükseklik 16:9 ama TOS gereği en az 200px
const MIN_PLAYER_W = 288;
const MAX_PLAYER_W = 1280;
const playerHeightFor = (w: number) => Math.max(200, Math.round(w * 9 / 16));
const clampPlayerWidth = (w: number) =>
  Math.round(Math.min(Math.max(w, MIN_PLAYER_W), MAX_PLAYER_W, Math.max(MIN_PLAYER_W, window.innerWidth - 40)));

const YoutubePlayerPanel: React.FC<YoutubePlayerPanelProps> = ({ roomId, username }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [joined, setJoined] = useState(false);
  const [needsInteraction, setNeedsInteraction] = useState(false);
  const [error, setError] = useState('');
  // Şarkı kuyruğu (hub'dan tam liste gelir)
  const [queue, setQueue] = useState<{ videoId: string; addedBy: string }[]>([]);
  const [showQueue, setShowQueue] = useState(false);
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
  // Event closure'ları için güncel oturum/katılım bilgisi
  const sessionRef = useRef<Session | null>(null);
  useEffect(() => { sessionRef.current = session; }, [session]);
  const joinedRef = useRef(false);
  useEffect(() => { joinedRef.current = joined; }, [joined]);

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
          } else if (e.data === YTState.ENDED) {
            // Video bitti — kuyruktaki sıradakine geç. TÜM client'lar gönderir,
            // hub endedVideoId guard'ıyla yalnızca ilkini işler.
            const vid = sessionRef.current?.videoId;
            if (vid) signalrService.nextYoutube(roomIdRef.current, vid);
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
      if (iStarted || joinedRef.current) {
        // Başlatan kişi ya da zaten partide olan (kuyruk geçişi) → anında katıl
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
      setQueue([]);
      setShowQueue(false);
      pendingJoinRef.current = null;
    };

    const handleQueueUpdated = (q: { videoId: string; addedBy: string }[]) => {
      setQueue(q || []);
    };

    signalrService.onYoutubeStarted(handleStarted);
    signalrService.onYoutubeSync(handleSync);
    signalrService.onYoutubeState(handleState);
    signalrService.onYoutubeStopped(handleStopped);
    signalrService.onYoutubeQueueUpdated(handleQueueUpdated);

    return () => {
      signalrService.offYoutubeStarted(handleStarted);
      signalrService.offYoutubeSync(handleSync);
      signalrService.offYoutubeState(handleState);
      signalrService.offYoutubeStopped(handleStopped);
      signalrService.offYoutubeQueueUpdated(handleQueueUpdated);
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

  // ===== Sürüklenebilir pencere =====
  // Konum (başlangıç köşesine göre kayma) cihazda hatırlanır.
  const dragConstraintsRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  const [isDragging, setIsDragging] = useState(false);
  const [savedPos] = useState(() => {
    try {
      const p = JSON.parse(localStorage.getItem(PLAYER_POS_KEY) || 'null') as { x: number; y: number } | null;
      if (!p) return null;
      // Ekran küçüldüyse (ör. telefon döndü) pencere dışarıda kalmasın
      return {
        x: Math.min(0, Math.max(p.x, -(window.innerWidth - 320))),
        y: Math.min(80, Math.max(p.y, -(window.innerHeight - 440))),
      };
    } catch { return null; }
  });
  const dragX = useMotionValue(savedPos?.x ?? 0);
  const dragY = useMotionValue(savedPos?.y ?? 0);
  const savePos = () => {
    try { localStorage.setItem(PLAYER_POS_KEY, JSON.stringify({ x: dragX.get(), y: dragY.get() })); } catch { /* yoksay */ }
  };
  const handleDragEnd = () => {
    setIsDragging(false);
    savePos();
  };

  // ===== Köşeden sürükleyerek boyutlandırma =====
  // Pencere sağ-alta sabitli; büyürken sol-üst köşe yerinde kalsın diye
  // genişlik/yükseklik farkı kadar konum da kaydırılır.
  const [playerW, setPlayerW] = useState(() => {
    try { return clampPlayerWidth(Number(localStorage.getItem(PLAYER_SIZE_KEY)) || MIN_PLAYER_W); }
    catch { return MIN_PLAYER_W; }
  });
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<{ startX: number; startW: number; baseX: number; baseY: number } | null>(null);
  const handleResizeDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeRef.current = { startX: e.clientX, startW: playerW, baseX: dragX.get(), baseY: dragY.get() };
    setIsResizing(true);
  };
  const handleResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = resizeRef.current;
    if (!r) return;
    const w = clampPlayerWidth(r.startW + (e.clientX - r.startX));
    dragX.set(r.baseX + (w - r.startW));
    dragY.set(r.baseY + (playerHeightFor(w) - playerHeightFor(r.startW)));
    setPlayerW(w);
  };
  const handleResizeUp = () => {
    if (!resizeRef.current) return;
    resizeRef.current = null;
    setIsResizing(false);
    savePos();
    try { localStorage.setItem(PLAYER_SIZE_KEY, String(playerW)); } catch { /* yoksay */ }
  };
  const playerH = playerHeightFor(playerW);

  return (
    // Ekranın tamamı sürükleme sınırı; tıklamalar alttaki arayüze geçer
    <div ref={dragConstraintsRef} className="fixed inset-0 z-40 pointer-events-none">
    <AnimatePresence>
      {session && (
        <motion.div
          drag
          dragControls={dragControls}
          // Oynatıcıda iframe imleci yutar; yalnızca başlık çubuğundan sürüklenir.
          // Davet kartında iframe yok, her yerinden tutulabilir.
          dragListener={!!isVideoInvite}
          dragMomentum={false}
          dragElastic={0}
          dragConstraints={dragConstraintsRef}
          onDragStart={() => setIsDragging(true)}
          onDragEnd={handleDragEnd}
          style={{ x: dragX, y: dragY, ...(isVideoInvite ? {} : { width: playerW + 16 }) }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`absolute bottom-24 right-3 pointer-events-auto max-w-[calc(100vw-1.5rem)] bg-bg-surface border border-border-main rounded-2xl shadow-2xl overflow-hidden ${isVideoInvite ? 'w-[304px]' : ''}`}
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
              <div
                onPointerDown={e => dragControls.start(e)}
                title="Sürükleyerek taşı"
                className={`flex items-center justify-between px-3 py-2 border-b border-border-main touch-none select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
              >
                <span className="flex items-center gap-2 text-xs text-text-muted min-w-0">
                  <GripVertical size={14} className="shrink-0 opacity-60" />
                  <Youtube size={14} className="text-red-500 shrink-0" />
                  <span className="truncate">başlatan: <span className="text-text-main font-medium">{session.startedBy}</span></span>
                </span>
                <button onPointerDown={e => e.stopPropagation()} onClick={handleStop} title="Herkes için durdur" className="p-1.5 text-text-muted hover:text-red-400 rounded-full hover:bg-surface-subtle transition-colors shrink-0">
                  <X size={14} />
                </button>
              </div>

              <div className="relative p-2">
                {/* YouTube TOS: oynatıcı görünür ve >=200x200 kalmalı */}
                <div
                  ref={playerHostRef}
                  style={{ height: playerH }}
                  className={`w-full rounded-lg overflow-hidden bg-black [&_iframe]:w-full [&_iframe]:h-full ${isDragging || isResizing ? 'pointer-events-none' : ''}`}
                />
                {needsInteraction && (
                  <button
                    onClick={handleJoinClick}
                    className="absolute inset-2 flex flex-col items-center justify-center gap-2 bg-black/80 text-white rounded-lg hover:bg-black/70 transition-colors"
                  >
                    <span className="p-3 rounded-full bg-primary-main/90"><Play size={20} /></span>
                    <span className="text-sm font-semibold">İzlemek için tıkla</span>
                  </button>
                )}
                {/* Sağ-alt köşeden sürükleyerek büyüt/küçült */}
                <div
                  onPointerDown={handleResizeDown}
                  onPointerMove={handleResizeMove}
                  onPointerUp={handleResizeUp}
                  onPointerCancel={handleResizeUp}
                  title="Sürükleyerek boyutlandır"
                  className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize touch-none flex items-end justify-end p-0.5 text-text-muted hover:text-text-main"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M9 1L1 9M9 5L5 9" />
                  </svg>
                </div>
              </div>

              {error && (
                <div className="px-3 pb-2 text-xs text-red-400">{error}</div>
              )}

              {/* ===== Şarkı kuyruğu ===== */}
              <div className="border-t border-border-main">
                <div className="flex items-center justify-between px-3 py-1.5">
                  <button onClick={() => setShowQueue(p => !p)} className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-main transition-colors">
                    <ListMusic size={13} className="shrink-0" />
                    Kuyruk ({queue.length})
                    <ChevronDown size={12} className={`transition-transform ${showQueue ? 'rotate-180' : ''}`} />
                  </button>
                  {queue.length > 0 && (
                    <button onClick={() => signalrService.skipYoutube(roomIdRef.current)} title="Sıradakine geç"
                      className="flex items-center gap-1 text-xs text-text-muted hover:text-primary-main transition-colors">
                      <SkipForward size={13} /> Geç
                    </button>
                  )}
                </div>
                {showQueue && queue.length > 0 && (
                  <div className="max-h-32 overflow-y-auto custom-scrollbar px-3 pb-2 space-y-1">
                    {queue.map((q, i) => (
                      <div key={`${q.videoId}-${i}`} className="flex items-center gap-2 text-xs text-text-muted bg-surface-subtle rounded-lg px-2 py-1.5">
                        <span className="text-text-main font-semibold shrink-0">{i + 1}.</span>
                        <span className="truncate flex-1" title={q.videoId}>{q.videoId} <span className="opacity-60">· {q.addedBy}</span></span>
                        <button onClick={() => signalrService.removeFromYoutubeQueue(roomIdRef.current, i)} title="Kuyruktan çıkar"
                          className="p-1 rounded hover:text-red-400 transition-colors shrink-0">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {showQueue && queue.length === 0 && (
                  <div className="px-3 pb-2 text-[11px] text-text-muted">Kuyruk boş — YouTube panelinden "Kuyruğa ekle" ile şarkı ekle.</div>
                )}
              </div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
    </div>
  );
};

export default YoutubePlayerPanel;
