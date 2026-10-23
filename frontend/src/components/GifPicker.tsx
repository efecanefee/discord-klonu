import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, X } from 'lucide-react';
import { popoverMotion } from '../utils/motion';
import { fetchGifs, GifNotConfiguredError, type Gif } from '../services/gifApi';

interface GifPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (gif: Gif) => void;
}

const QUICK_TAGS = ['komik', 'tamam', 'alkış', 'şok', 'üzgün', 'dans', 'kedi', 'aşk'];

// Mesaj kutusunun üstünde açılan GIF arama paneli (GIPHY)
const GifPicker: React.FC<GifPickerProps> = ({ isOpen, onClose, onSelect }) => {
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<Gif[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<'no_key' | 'failed' | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = (q: string, offset: number) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    fetchGifs(q, offset, ctrl.signal)
      .then(list => {
        setError(null);
        setGifs(prev => (offset === 0 ? list : [...prev, ...list.filter(g => !prev.some(p => p.id === g.id))]));
        setHasMore(list.length > 0);
      })
      .catch(err => {
        if (ctrl.signal.aborted) return;
        setError(err instanceof GifNotConfiguredError ? 'no_key' : 'failed');
      })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
  };

  // Yazmayı bırakınca ara (350 ms); açılışta trend GIF'ler
  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => load(query, 0), query ? 350 : 0);
    return () => clearTimeout(t);
  }, [query, isOpen]);

  useEffect(() => {
    if (isOpen) requestAnimationFrame(() => inputRef.current?.focus());
    else abortRef.current?.abort();
  }, [isOpen]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (!loading && hasMore && !error && el.scrollTop + el.clientHeight > el.scrollHeight - 120) load(query, gifs.length);
  };

  // İki sütunlu "masonry": her GIF daha kısa olan sütuna
  const columns: Gif[][] = [[], []];
  const heights = [0, 0];
  for (const g of gifs) {
    const i = heights[0] <= heights[1] ? 0 : 1;
    columns[i].push(g);
    heights[i] += g.width > 0 ? g.height / g.width : 1;
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={onClose} />
          <motion.div
            {...popoverMotion}
            className="absolute bottom-full mb-2 left-0 z-50 w-[360px] max-w-[calc(100vw-1.5rem)] rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            style={{ background: 'var(--color-bg-card, #1a2035)', border: '1px solid var(--color-border-main, #242b3d)' }}
            onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
          >
            <div className="px-3 pt-3 pb-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="GIF ara..."
                  maxLength={50}
                  className="w-full bg-bg-surface border border-border-main rounded-xl pl-8 pr-8 py-2 text-xs text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary-main"
                />
                {query && (
                  <button type="button" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-main cursor-pointer" aria-label="Aramayı temizle">
                    <X size={12} />
                  </button>
                )}
              </div>
              <div className="flex gap-1 mt-2 overflow-x-auto scrollbar-hide">
                {QUICK_TAGS.map(t => (
                  <button key={t} type="button" onClick={() => setQuery(t)}
                    className={`px-2 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors cursor-pointer ${query === t ? 'bg-primary-main text-white' : 'bg-bg-surface text-text-muted hover:text-text-main'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-2 pb-2 h-[300px] overflow-y-auto custom-scrollbar" onScroll={handleScroll}>
              {error === 'no_key' ? (
                <div className="h-full flex items-center justify-center text-center text-xs text-text-muted px-6">GIF araması henüz ayarlanmadı. Sunucuya GIPHY anahtarı eklenince açılacak.</div>
              ) : error === 'failed' && gifs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-xs text-text-muted">
                  GIF'ler yüklenemedi.
                  <button type="button" onClick={() => load(query, 0)} className="text-primary-main font-semibold hover:underline cursor-pointer">Tekrar dene</button>
                </div>
              ) : !loading && gifs.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-text-muted">“{query}” için GIF bulunamadı</div>
              ) : (
                <div className="flex gap-1.5">
                  {columns.map((col, ci) => (
                    <div key={ci} className="flex-1 flex flex-col gap-1.5 min-w-0">
                      {col.map(g => (
                        <button key={g.id} type="button" onClick={() => { onSelect(g); onClose(); }} title={g.title}
                          className="relative block w-full overflow-hidden rounded-lg bg-bg-surface cursor-pointer group/gif focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-main"
                          style={{ aspectRatio: g.width && g.height ? `${g.width} / ${g.height}` : '1 / 1' }}>
                          <img src={g.preview} alt={g.title} loading="lazy" className="absolute inset-0 w-full h-full object-cover transition-transform duration-200 group-hover/gif:scale-105" />
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              {loading && gifs.length > 0 && <div className="py-2 text-center text-[11px] text-text-muted">Yükleniyor…</div>}
              {loading && gifs.length === 0 && !error && (
                <div className="grid grid-cols-2 gap-1.5">
                  {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-24 rounded-lg bg-bg-surface animate-pulse" />)}
                </div>
              )}
            </div>
            <div className="px-3 py-1.5 border-t border-border-main text-[10px] text-text-muted text-right">Powered by GIPHY</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default GifPicker;
