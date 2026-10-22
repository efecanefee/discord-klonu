import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart3, CalendarClock, Check, Loader2, MessageSquareText, Send, SmilePlus, Trash2, X } from 'lucide-react';
import signalrService, { type ConnectionStatus } from '../services/signalrService';
import {
  createFeedPost, deleteFeedPost, getFeed, toggleFeedReaction, voteFeedPoll,
  type FeedPostDto, type FeedPostKind, type FeedReactionGroup, type FeedVotes, type PollChoice,
} from '../services/feedApi';
import { renderAvatar } from '../constants/avatars';
import ReactionChips from './ReactionChips';
import { popoverMotion } from '../utils/motion';

interface NotesFeedProps {
  username: string;
  userId: string;
  /** Masaüstünde kalan yüksekliği doldurur; mobilde sabit üst sınır */
  className?: string;
}

const MAX_LEN = 280;
const QUICK_EMOJIS = ['👍', '❤️', '😂', '🔥', '😮', '😢', '🎉', '👀', '💯', '🙏', '😎', '🤝'];

const pad = (n: number) => String(n).padStart(2, '0');

// <input type="datetime-local"> yerel saat bekler: "YYYY-MM-DDTHH:mm"
const toLocalInput = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

// Varsayılan etkinlik saati: bir sonraki tam saat (en az 30 dk sonrası)
const defaultEventAt = () => {
  const d = new Date(Date.now() + 30 * 60000);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return toLocalInput(d);
};

// Hızlı seçim: bugün 20:00 (geçtiyse yarın), yarın 20:00, hafta sonu 21:00
const presetAt = (kind: 'tonight' | 'tomorrow' | 'weekend') => {
  const d = new Date();
  d.setSeconds(0, 0);
  if (kind === 'tonight') {
    d.setHours(20, 0);
    if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
  } else if (kind === 'tomorrow') {
    d.setDate(d.getDate() + 1);
    d.setHours(20, 0);
  } else {
    const toSat = (6 - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + toSat);
    d.setHours(21, 0);
  }
  return toLocalInput(d);
};

const relTime = (at: number, now: number) => {
  const m = Math.floor(Math.max(0, now - at) / 60000);
  if (m < 1) return 'az önce';
  if (m < 60) return `${m} dk`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} sa`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} g`;
  return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' }).format(at);
};

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// "Bugün 20:00", "Yarın 20:00" ya da "24 Eki Cuma 20:00"
const formatEventAt = (at: number) => {
  const d = new Date(at);
  const today = new Date();
  const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (sameDay(d, today)) return `Bugün ${time}`;
  if (sameDay(d, tomorrow)) return `Yarın ${time}`;
  const day = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', weekday: 'long' }).format(d);
  return `${day} ${time}`;
};

// Etkinliğe kalan süre: "45 dk sonra", "3 sa sonra", "2 gün sonra"
const untilLabel = (at: number, now: number) => {
  const m = Math.round((at - now) / 60000);
  if (m <= 0) return null;
  if (m < 60) return `${m} dk sonra`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} sa sonra`;
  return `${Math.round(h / 24)} gün sonra`;
};

// --- Tek gönderi ---

interface PostItemProps {
  post: FeedPostDto;
  now: number;
  myUsername: string;
  isMine: boolean;
  onVote: (id: number, choice: PollChoice) => void;
  onReact: (id: number, emoji: string) => void;
  onDelete: (id: number) => void;
}

const PollBox = ({ post, now, myUsername, onVote }: Pick<PostItemProps, 'post' | 'now' | 'myUsername' | 'onVote'>) => {
  const votes = post.votes ?? { yes: [], no: [] };
  const total = votes.yes.length + votes.no.length;
  const ended = post.eventAt != null && post.eventAt < now;
  const myChoice: PollChoice | null = votes.yes.includes(myUsername) ? 'yes' : votes.no.includes(myUsername) ? 'no' : null;
  const until = post.eventAt != null ? untilLabel(post.eventAt, now) : null;

  const option = (choice: PollChoice) => {
    const list = choice === 'yes' ? votes.yes : votes.no;
    const pct = total === 0 ? 0 : Math.round((list.length / total) * 100);
    const mine = myChoice === choice;
    const tone = choice === 'yes'
      ? { bar: 'bg-emerald-400/25', border: 'border-emerald-400/60', text: 'text-emerald-300' }
      : { bar: 'bg-rose-400/25', border: 'border-rose-400/60', text: 'text-rose-300' };
    return (
      <button
        type="button"
        disabled={ended}
        onClick={() => onVote(post.id, choice)}
        title={list.length ? list.join(', ') : 'Henüz oy yok'}
        className={`relative flex-1 overflow-hidden rounded-xl border px-3 py-2 text-left transition-colors ${
          mine ? tone.border : 'border-white/10 hover:border-white/25'
        } ${ended ? 'cursor-default' : 'cursor-pointer active:scale-[0.98]'}`}
      >
        <motion.span
          className={`absolute inset-y-0 left-0 ${tone.bar}`}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 260, damping: 30 }}
        />
        <span className="relative flex items-center justify-between gap-2">
          <span className={`flex items-center gap-1 text-[12px] font-semibold ${mine ? tone.text : 'text-white/85'}`}>
            {mine && <Check size={12} strokeWidth={3} />}
            {choice === 'yes' ? 'Evet' : 'Hayır'}
          </span>
          <span className="text-[11px] font-semibold text-white/60 tabular-nums">{list.length}</span>
        </span>
      </button>
    );
  };

  return (
    <div className="mt-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2.5">
      {post.eventAt != null && (
        <div className="mb-2 flex items-center gap-1.5 text-[11px]">
          <CalendarClock size={12} className="text-primary-main shrink-0" />
          <span className="font-semibold text-white/80">{formatEventAt(post.eventAt)}</span>
          <span className="text-white/35">·</span>
          {ended
            ? <span className="text-white/40">Sona erdi</span>
            : <span className="text-primary-main/90">{until}</span>}
        </div>
      )}
      <div className="flex gap-2">
        {option('yes')}
        {option('no')}
      </div>
      {votes.yes.length > 0 && (
        <div className="mt-1.5 truncate text-[10px] text-white/40" title={votes.yes.join(', ')}>
          Geliyor: {votes.yes.join(', ')}
        </div>
      )}
    </div>
  );
};

const ReactButton = ({ onPick }: { onPick: (emoji: string) => void }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="Tepki ekle"
        className="flex h-6 w-6 items-center justify-center rounded-full text-white/35 transition-colors hover:bg-white/10 hover:text-white/80 cursor-pointer"
      >
        <SmilePlus size={14} />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              {...popoverMotion}
              className="absolute bottom-full right-0 z-50 mb-1.5 grid grid-cols-6 gap-0.5 rounded-2xl border border-white/10 p-1.5 shadow-2xl"
              style={{ background: 'var(--color-bg-card, #1a2035)' }}
            >
              {QUICK_EMOJIS.map(e => (
                <button
                  key={e}
                  type="button"
                  onClick={() => { onPick(e); setOpen(false); }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[18px] transition-transform hover:bg-white/10 active:scale-90 cursor-pointer"
                >
                  {e}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

const PostItem = memo(function PostItem({ post, now, myUsername, isMine, onVote, onReact, onDelete }: PostItemProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isPoll = post.kind === 'poll';

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: -10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 16, transition: { duration: 0.16 } }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      className="group relative flex gap-2.5 rounded-2xl px-2 py-2 transition-colors hover:bg-white/[0.03]"
    >
      <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-bg-surface border border-white/10 flex items-center justify-center text-[15px]">
        {renderAvatar(post.avatarId)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5 pr-6">
          <span className="truncate text-[12.5px] font-bold text-white">{post.username}</span>
          {isPoll && <span className="shrink-0 text-[11px] text-white/45">bir oylama başlattı</span>}
          <span className="ml-auto shrink-0 text-[10px] text-white/30">{relTime(post.createdAt, now)}</span>
        </div>
        <p className={`mt-0.5 whitespace-pre-wrap break-words text-[12.5px] leading-snug ${isPoll ? 'font-semibold text-white' : 'text-white/80'}`}>
          {post.text}
        </p>

        {isPoll && <PollBox post={post} now={now} myUsername={myUsername} onVote={onVote} />}

        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <ReactionChips reactions={post.reactions} myUsername={myUsername} onToggle={e => onReact(post.id, e)} />
          <div className={post.reactions.length > 0 ? 'mt-1' : ''}>
            <ReactButton onPick={e => onReact(post.id, e)} />
          </div>
        </div>
      </div>

      {isMine && (
        <div className="absolute right-2 top-2">
          {confirmDelete ? (
            <div className="flex items-center gap-1 rounded-full border border-white/10 bg-bg-card px-1 py-0.5 shadow-lg">
              <button type="button" onClick={() => onDelete(post.id)} title="Sil"
                className="flex h-5 w-5 items-center justify-center rounded-full text-rose-400 hover:bg-rose-500/15 cursor-pointer">
                <Check size={12} strokeWidth={3} />
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} title="Vazgeç"
                className="flex h-5 w-5 items-center justify-center rounded-full text-white/50 hover:bg-white/10 cursor-pointer">
                <X size={12} strokeWidth={3} />
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} title="Sil"
              className="flex h-6 w-6 items-center justify-center rounded-full text-white/30 opacity-100 md:opacity-0 transition-opacity hover:bg-rose-500/15 hover:text-rose-400 group-hover:opacity-100 cursor-pointer">
              <Trash2 size={12} />
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
});

// --- Gönderi yazma alanı ---

const Composer = ({ onPosted }: { onPosted: (post: FeedPostDto) => void }) => {
  const [kind, setKind] = useState<FeedPostKind>('note');
  const [text, setText] = useState('');
  const [eventAt, setEventAt] = useState(defaultEventAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const textRef = useRef<HTMLTextAreaElement>(null);

  const trimmed = text.trim();
  const left = MAX_LEN - text.length;
  const canSubmit = trimmed.length > 0 && left >= 0 && !busy && (kind === 'note' || !!eventAt);

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    try {
      const at = kind === 'poll' ? new Date(eventAt).getTime() : undefined;
      if (kind === 'poll' && (!at || Number.isNaN(at))) throw new Error('Geçerli bir tarih seç.');
      const post = await createFeedPost(kind, trimmed, at);
      onPosted(post);
      setText('');
      if (kind === 'poll') { setKind('note'); setEventAt(defaultEventAt()); }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Paylaşılamadı.');
    } finally {
      setBusy(false);
    }
  };

  const tab = (k: FeedPostKind, label: string, Icon: typeof BarChart3) => (
    <button
      type="button"
      onClick={() => { setKind(k); setError(''); textRef.current?.focus(); }}
      className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
        kind === k ? 'bg-primary-main/20 text-primary-main' : 'text-white/45 hover:text-white/80 hover:bg-white/5'
      }`}
    >
      <Icon size={12} />
      {label}
    </button>
  );

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-2.5 focus-within:border-primary-main/40 transition-colors">
      <textarea
        ref={textRef}
        value={text}
        onChange={e => { setText(e.target.value); if (error) setError(''); }}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        rows={2}
        maxLength={MAX_LEN + 20}
        placeholder={kind === 'poll' ? 'Ne için oylama? Örn: Rematch' : 'Aklından ne geçiyor?'}
        className="w-full resize-none bg-transparent text-[12.5px] leading-snug text-white placeholder:text-white/30 focus:outline-none"
      />

      <AnimatePresence initial={false}>
        {kind === 'poll' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-1.5 pt-1">
              <CalendarClock size={13} className="shrink-0 text-primary-main" />
              <input
                type="datetime-local"
                value={eventAt}
                min={toLocalInput(new Date())}
                onChange={e => setEventAt(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-bg-surface/70 px-2 py-1 text-[11.5px] text-white [color-scheme:dark] focus:border-primary-main/50 focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-1 pt-1.5">
              {([['tonight', 'Bu akşam 20:00'], ['tomorrow', 'Yarın 20:00'], ['weekend', 'Cumartesi 21:00']] as const).map(([k, label]) => (
                <button key={k} type="button" onClick={() => setEventAt(presetAt(k))}
                  className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/55 transition-colors hover:border-primary-main/40 hover:text-white cursor-pointer">
                  {label}
                </button>
              ))}
            </div>
            <div className="pt-1.5 text-[10px] text-white/35">🔔 "Evet" diyenlere başlamadan 15 dk önce bildirim gider.</div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-2 flex items-center gap-1">
        {tab('note', 'Not', MessageSquareText)}
        {tab('poll', 'Oylama', BarChart3)}
        <span className={`ml-auto text-[10px] tabular-nums ${left < 0 ? 'text-rose-400' : left < 30 ? 'text-amber-300/80' : 'text-white/25'}`}>
          {text.length > 0 ? left : ''}
        </span>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          title="Paylaş (Enter)"
          className="ml-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary-main text-white transition-all hover:brightness-110 active:scale-90 disabled:opacity-30 disabled:active:scale-100 cursor-pointer disabled:cursor-default"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
        </button>
      </div>
      {error && <div className="mt-1.5 text-[11px] text-rose-400">{error}</div>}
    </div>
  );
};

// --- Panel ---

// Ana ekranın sağ altındaki not akışı: kısa notlar ve tarihli evet/hayır
// oylamaları. Cevap yok; herkes oy verir ve emoji tepkisi bırakır. Değişiklikler
// SignalR ile canlı gelir, kendi işlemlerimiz REST yanıtıyla anında yansır.
const NotesFeed = memo(function NotesFeed({ username, userId, className = '' }: NotesFeedProps) {
  const [posts, setPosts] = useState<FeedPostDto[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Göreli zaman ve geri sayım etiketleri yarım dakikada bir tazelenir
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const upsert = useCallback((post: FeedPostDto) => {
    setPosts(prev => {
      if (prev.some(p => p.id === post.id)) return prev.map(p => (p.id === post.id ? post : p));
      return [post, ...prev].sort((a, b) => b.id - a.id);
    });
  }, []);

  const patch = useCallback((id: number, change: Partial<FeedPostDto>) => {
    setPosts(prev => prev.map(p => (p.id === id ? { ...p, ...change } : p)));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const page = await getFeed();
      setPosts(page.items);
      setHasMore(page.hasMore);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onCreated = (post: FeedPostDto) => upsert(post);
    const onDeleted = (id: number) => setPosts(prev => prev.filter(p => p.id !== id));
    const onVotes = (id: number, votes: FeedVotes) => patch(id, { votes });
    const onReactions = (id: number, reactions: FeedReactionGroup[]) => patch(id, { reactions });
    // Bağlantı koparken kaçan olaylar olabilir: geri gelince akışı tazele
    let wasDown = false;
    const onStatus = (s: ConnectionStatus) => {
      if (s !== 'connected') { wasDown = true; return; }
      if (wasDown) { wasDown = false; load(); }
    };
    signalrService.onConnectionStatus(onStatus);

    signalrService.onFeedPostCreated(onCreated);
    signalrService.onFeedPostDeleted(onDeleted);
    signalrService.onFeedVotesUpdated(onVotes);
    signalrService.onFeedReactionUpdated(onReactions);
    return () => {
      signalrService.offFeedPostCreated(onCreated);
      signalrService.offFeedPostDeleted(onDeleted);
      signalrService.offFeedVotesUpdated(onVotes);
      signalrService.offFeedReactionUpdated(onReactions);
      signalrService.offConnectionStatus(onStatus);
    };
  }, [upsert, patch, load]);

  const loadMore = async () => {
    if (loadingMore || posts.length === 0) return;
    setLoadingMore(true);
    try {
      const page = await getFeed(posts[posts.length - 1].id);
      setPosts(prev => {
        const known = new Set(prev.map(p => p.id));
        return [...prev, ...page.items.filter(p => !known.has(p.id))];
      });
      setHasMore(page.hasMore);
    } catch { /* buton yerinde kalır, tekrar denenir */ }
    finally { setLoadingMore(false); }
  };

  const handleVote = useCallback(async (id: number, choice: PollChoice) => {
    try { patch(id, { votes: await voteFeedPoll(id, choice) }); } catch { /* süre dolmuş olabilir */ }
  }, [patch]);

  const handleReact = useCallback(async (id: number, emoji: string) => {
    try { patch(id, { reactions: await toggleFeedReaction(id, emoji) }); } catch { /* yoksay */ }
  }, [patch]);

  const handleDelete = useCallback(async (id: number) => {
    try {
      await deleteFeedPost(id);
      setPosts(prev => prev.filter(p => p.id !== id));
    } catch { /* yoksay */ }
  }, []);

  // Yaklaşan (süresi dolmamış) oylamalar başlıkta rozet olarak görünür
  const upcoming = useMemo(
    () => posts.filter(p => p.kind === 'poll' && p.eventAt != null && p.eventAt > now).length,
    [posts, now]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35, duration: 0.3, ease: 'easeOut' }}
      className={`relative flex flex-col overflow-hidden p-3 glass-panel ${className}`}
    >
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-primary-main/40 to-transparent" />

      <div className="mb-2.5 flex items-center gap-2 px-1 pt-1">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(var(--accent-rgb),0.15)', border: '1px solid rgba(var(--accent-rgb),0.3)' }}>
          <MessageSquareText size={14} className="text-primary-main" />
        </div>
        <h3 className="text-[13px] font-bold text-white leading-none">Notlar</h3>
        {upcoming > 0 && (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-primary-main/15 px-2 py-0.5 text-[10px] font-semibold text-primary-main">
            <CalendarClock size={10} />
            {upcoming} yaklaşan
          </span>
        )}
      </div>

      <Composer onPosted={upsert} />

      <div className="-mx-1 mt-2 min-h-0 flex-1 overflow-y-auto custom-scrollbar px-1">
        {loading ? (
          <div className="flex justify-center py-6 text-white/30"><Loader2 size={16} className="animate-spin" /></div>
        ) : loadError ? (
          <div className="py-5 text-center text-[11px] text-white/40">
            Notlar yüklenemedi.{' '}
            <button type="button" onClick={load} className="font-semibold text-primary-main hover:underline cursor-pointer">Tekrar dene</button>
          </div>
        ) : posts.length === 0 ? (
          <div className="py-5 text-center text-[11px] text-white/30">İlk notu sen bırak ✍️</div>
        ) : (
          <div className="space-y-0.5">
            <AnimatePresence initial={false}>
              {posts.map(p => (
                <PostItem
                  key={p.id}
                  post={p}
                  now={now}
                  myUsername={username}
                  isMine={p.userId === userId}
                  onVote={handleVote}
                  onReact={handleReact}
                  onDelete={handleDelete}
                />
              ))}
            </AnimatePresence>
            {hasMore && (
              <button type="button" onClick={loadMore} disabled={loadingMore}
                className="mt-1 w-full rounded-xl py-1.5 text-[11px] font-semibold text-white/45 transition-colors hover:bg-white/5 hover:text-white/80 cursor-pointer">
                {loadingMore ? 'Yükleniyor…' : 'Daha eski notlar'}
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
});

export default NotesFeed;
