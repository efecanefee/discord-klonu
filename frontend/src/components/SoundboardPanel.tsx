import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Upload, Trash2, Volume2, VolumeX, Loader2, Star, Store, LayoutGrid,
  Search, Plus, Check, Play, Square, Globe, Lock, Flame, Sparkles, TrendingUp, FileAudio,
} from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';
import signalrService from '../services/signalrService';
import { renderAvatar } from '../constants/avatars';

// Kişisel soundboard'daki ses (kendi yüklediğim ya da mağazadan eklediğim)
interface Sound {
  id: number;
  name: string;
  url: string;
  isPublic: boolean;
  isMine: boolean;
  uploaderUsername: string | null;
  saveCount: number;
  playCount: number;
  isFavorite: boolean;
}

// Ses Mağazası'ndaki ses
interface StoreSound {
  id: number;
  name: string;
  url: string;
  createdAt: string;
  uploaderId: string;
  uploaderUsername: string;
  uploaderAvatarId: string;
  saveCount: number;
  playCount: number;
  isSaved: boolean;
  isMine: boolean;
}

type Tab = 'board' | 'store';
type StoreSort = 'new' | 'popular' | 'played';

const MAX_OWN = 10;
const MAX_SAVED = 30;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const AUDIO_EXT = /\.(mp3|ogg)$/i;

const SORTS: { id: StoreSort; label: string; icon: React.ReactNode }[] = [
  { id: 'new', label: 'Yeni', icon: <Sparkles size={12} /> },
  { id: 'popular', label: 'Popüler', icon: <Flame size={12} /> },
  { id: 'played', label: 'En çok çalınan', icon: <TrendingUp size={12} /> },
];

interface SoundboardPanelProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  apiBaseUrl: string;
}

const authHeaders = (json = false): HeadersInit => ({
  ...(json ? { 'Content-Type': 'application/json' } : {}),
  'Authorization': `Bearer ${localStorage.getItem('token')}`,
});

const formatCount = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1).replace('.0', '')}B` : String(n);

// Ana Salon soundboard'u + Ses Mağazası.
// Soundboard'daki bir sese basınca hub üzerinden odadaki HERKESTE çalar.
// Mağazada başkalarının yüklediği sesler (yükleyeniyle) listelenir, önizlenir ve soundboard'a eklenir.
const SoundboardPanel: React.FC<SoundboardPanelProps> = ({ isOpen, onClose, roomId, apiBaseUrl }) => {
  const [tab, setTab] = useState<Tab>('board');
  const [sounds, setSounds] = useState<Sound[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Bilgisayardan seçilen, henüz yüklenmemiş ses (ad + paylaşım seçimi bekliyor)
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingName, setPendingName] = useState('');
  const [pendingPublic, setPendingPublic] = useState(true);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { settings, updateSettings } = useSettings();
  const soundboardVolume = settings.soundboardVolume;

  // Mağaza durumu
  const [storeItems, setStoreItems] = useState<StoreSound[]>([]);
  const [storeSort, setStoreSort] = useState<StoreSort>('new');
  const [storeQuery, setStoreQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [storePage, setStorePage] = useState(1);
  const [storeHasMore, setStoreHasMore] = useState(false);
  const [storeLoading, setStoreLoading] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());

  // Önizleme (yalnızca bu cihazda çalar)
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const [previewId, setPreviewId] = useState<number | null>(null);

  const ownCount = sounds.filter(s => s.isMine).length;
  const savedCount = sounds.length - ownCount;

  const stopPreview = useCallback(() => {
    previewRef.current?.pause();
    previewRef.current = null;
    setPreviewId(null);
  }, []);

  useEffect(() => { if (!isOpen) stopPreview(); }, [isOpen, stopPreview]);
  useEffect(() => () => { previewRef.current?.pause(); }, []);

  const loadBoard = useCallback(async (signal?: { cancelled: boolean }) => {
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch(`${apiBaseUrl}/api/sounds`, { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (!signal?.cancelled) setSounds(data);
    } catch {
      if (!signal?.cancelled) setError('Sesler yüklenemedi.');
    } finally {
      if (!signal?.cancelled) setIsLoading(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    if (!isOpen) return;
    const signal = { cancelled: false };
    loadBoard(signal);
    return () => { signal.cancelled = true; };
  }, [isOpen, loadBoard]);

  // Arama kutusu: yazmayı bitirince sorgula
  useEffect(() => {
    // Sorgu değişince ilk sayfadan başla (iki set aynı turda birleşir)
    const t = setTimeout(() => { setDebouncedQuery(storeQuery.trim()); setStorePage(1); }, 300);
    return () => clearTimeout(t);
  }, [storeQuery]);

  useEffect(() => {
    if (!isOpen || tab !== 'store') return;
    let cancelled = false;
    setStoreLoading(true);
    setError('');
    const params = new URLSearchParams({ sort: storeSort, page: String(storePage) });
    if (debouncedQuery) params.set('q', debouncedQuery);
    fetch(`${apiBaseUrl}/api/sounds/store?${params}`, { headers: authHeaders() })
      .then(res => res.ok ? res.json() : Promise.reject())
      .then((data: { items: StoreSound[]; hasMore: boolean }) => {
        if (cancelled) return;
        setStoreItems(prev => storePage === 1 ? data.items : [...prev, ...data.items.filter(i => !prev.some(p => p.id === i.id))]);
        setStoreHasMore(data.hasMore);
      })
      .catch(() => { if (!cancelled) setError('Mağaza yüklenemedi.'); })
      .finally(() => { if (!cancelled) setStoreLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, tab, storeSort, debouncedQuery, storePage, apiBaseUrl]);

  const handlePlay = (sound: Sound) => {
    if (cooldown) return;
    signalrService.playSound(roomId, sound.url, sound.name);
    setSounds(prev => prev.map(s => s.id === sound.id ? { ...s, playCount: s.playCount + 1 } : s));
    // Hub tarafındaki 2 sn spam korumasını arayüzde de yansıt
    setCooldown(true);
    setTimeout(() => setCooldown(false), 2000);
  };

  const togglePreview = (item: { id: number; url: string }) => {
    if (previewId === item.id) { stopPreview(); return; }
    previewRef.current?.pause();
    const audio = new Audio(item.url);
    audio.volume = Math.min(1, soundboardVolume);
    audio.onended = () => setPreviewId(cur => cur === item.id ? null : cur);
    previewRef.current = audio;
    setPreviewId(item.id);
    audio.play().catch(() => setPreviewId(null));
  };

  // Önizleme için yerel URL; dosya değişince/iptalde serbest bırak
  useEffect(() => {
    if (!pendingFile) { setPendingUrl(null); return; }
    const url = URL.createObjectURL(pendingFile);
    setPendingUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    if (!AUDIO_EXT.test(file.name)) {
      setError('Sadece MP3 veya OGG yükleyebilirsin.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('Ses dosyası 2MB\'ı geçemez.');
      return;
    }
    if (ownCount >= MAX_OWN) {
      setError(`En fazla ${MAX_OWN} ses yükleyebilirsin. Yer açmak için birini sil.`);
      return;
    }
    stopPreview();
    setError('');
    setPendingFile(file);
    setPendingName(file.name.replace(AUDIO_EXT, '').replace(/[_-]+/g, ' ').trim().slice(0, 32));
    setPendingPublic(true);
  };

  const cancelPending = () => {
    if (previewId === -1) stopPreview();
    setPendingFile(null);
    setPendingName('');
  };

  const handleUpload = async () => {
    const file = pendingFile;
    const name = pendingName.trim().slice(0, 32);
    if (!file || !name || isUploading) return;
    if (previewId === -1) stopPreview();

    setIsUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const upRes = await fetch(`${apiBaseUrl}/api/upload`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      });
      if (!upRes.ok) throw new Error(await upRes.text());
      const upData = await upRes.json();

      const addRes = await fetch(`${apiBaseUrl}/api/sounds`, {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({ name, url: upData.url, isPublic: pendingPublic }),
      });
      if (!addRes.ok) throw new Error(await addRes.text());
      const added: Sound = await addRes.json();
      setSounds(prev => [...prev.filter(s => s.isFavorite), ...prev.filter(s => !s.isFavorite), added]);
      setPendingFile(null);
      setPendingName('');
      setTab('board');
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Ses yüklenemedi.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = async (sound: Sound) => {
    const question = sound.isMine
      ? `"${sound.name}" silinsin mi?${sound.saveCount > 0 ? ' (Soundboard\'una ekleyenlerde kalmaya devam eder.)' : ''}`
      : `"${sound.name}" soundboard'undan çıkarılsın mı?`;
    if (!window.confirm(question)) return;
    try {
      const res = await fetch(`${apiBaseUrl}/api/sounds/${sound.id}`, { method: 'DELETE', headers: authHeaders() });
      if (!res.ok) throw new Error();
      setSounds(prev => prev.filter(s => s.id !== sound.id));
      setStoreItems(prev => sound.isMine
        ? prev.filter(i => i.id !== sound.id)
        : prev.map(i => i.id === sound.id ? { ...i, isSaved: false, saveCount: Math.max(0, i.saveCount - 1) } : i));
    } catch {
      setError(sound.isMine ? 'Ses silinemedi.' : 'Ses çıkarılamadı.');
    }
  };

  const toggleFavorite = async (sound: Sound) => {
    const next = !sound.isFavorite;
    // İyimser güncelleme: favoriler öne geçer
    const apply = (fav: boolean) => setSounds(prev => {
      const updated = prev.map(s => s.id === sound.id ? { ...s, isFavorite: fav } : s);
      return [...updated.filter(s => s.isFavorite), ...updated.filter(s => !s.isFavorite)];
    });
    apply(next);
    try {
      const res = await fetch(`${apiBaseUrl}/api/sounds/${sound.id}/favorite`, { method: next ? 'PUT' : 'DELETE', headers: authHeaders() });
      if (!res.ok) throw new Error();
    } catch {
      apply(!next);
      setError('Favori güncellenemedi.');
    }
  };

  const toggleVisibility = async (sound: Sound) => {
    const next = !sound.isPublic;
    setSounds(prev => prev.map(s => s.id === sound.id ? { ...s, isPublic: next } : s));
    try {
      const res = await fetch(`${apiBaseUrl}/api/sounds/${sound.id}/visibility`, {
        method: 'PATCH', headers: authHeaders(true), body: JSON.stringify({ isPublic: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setSounds(prev => prev.map(s => s.id === sound.id ? { ...s, isPublic: !next } : s));
      setError('Görünürlük değiştirilemedi.');
    }
  };

  const toggleSave = async (item: StoreSound) => {
    if (item.isMine || pendingIds.has(item.id)) return;
    const saving = !item.isSaved;
    if (saving && savedCount >= MAX_SAVED) {
      setError(`Mağazadan en fazla ${MAX_SAVED} ses ekleyebilirsin.`);
      return;
    }
    setPendingIds(prev => new Set(prev).add(item.id));
    setError('');
    try {
      const res = await fetch(`${apiBaseUrl}/api/sounds/${item.id}/save`, { method: saving ? 'POST' : 'DELETE', headers: authHeaders() });
      if (!res.ok) throw new Error(await res.text());
      setStoreItems(prev => prev.map(i => i.id === item.id
        ? { ...i, isSaved: saving, saveCount: Math.max(0, i.saveCount + (saving ? 1 : -1)) }
        : i));
      if (saving) {
        setSounds(prev => prev.some(s => s.id === item.id) ? prev : [...prev, {
          id: item.id, name: item.name, url: item.url, isPublic: true, isMine: false,
          uploaderUsername: item.uploaderUsername, saveCount: 0, playCount: item.playCount, isFavorite: false,
        }]);
      } else {
        setSounds(prev => prev.filter(s => s.id !== item.id));
      }
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'İşlem başarısız.');
    } finally {
      setPendingIds(prev => { const n = new Set(prev); n.delete(item.id); return n; });
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.97 }}
          transition={{ duration: 0.15 }}
          className={`sb-panel relative w-full sm:w-[360px] max-h-[min(520px,75vh)] flex flex-col rounded-2xl overflow-hidden ${isDragging ? 'ring-2 ring-[var(--sb-to)]' : ''}`}
          onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setIsDragging(true); } }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false); }}
          onDrop={e => { e.preventDefault(); setIsDragging(false); pickFile(e.dataTransfer.files?.[0]); }}
        >
          {isDragging && (
            <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[rgba(10,11,17,0.85)] text-sm font-semibold">
              <Upload size={22} className="text-[var(--sb-to)]" />
              <span className="sb-gradient-text">MP3'ü bırak, soundboard'una ekleyelim</span>
            </div>
          )}
          {/* Başlık */}
          <div className="relative px-3 pt-3 pb-2 shrink-0">
            <div className="pointer-events-none absolute inset-0 opacity-25 sb-gradient [mask-image:linear-gradient(to_bottom,black,transparent)]" />
            <div className="relative flex items-center justify-between">
              <span className="text-sm font-bold flex items-center gap-2 font-display">
                <span className="w-7 h-7 rounded-lg sb-gradient flex items-center justify-center text-white shadow-[0_4px_14px_-2px_rgba(var(--sb-rgb),0.7)]">
                  <Volume2 size={15} />
                </span>
                <span className="sb-gradient-text text-[15px]">Soundboard</span>
              </span>
              <button onClick={onClose} className="p-1.5 text-text-muted hover:text-text-main rounded-full hover:bg-surface-subtle transition-colors" aria-label="Kapat">
                <X size={15} />
              </button>
            </div>

            {/* Sekmeler */}
            <div className="relative mt-3 grid grid-cols-2 gap-1 p-1 rounded-xl bg-bg-base/70 border border-border-main">
              {([['board', 'Soundboard\'um', <LayoutGrid size={13} key="b" />], ['store', 'Ses Mağazası', <Store size={13} key="s" />]] as const).map(([id, label, icon]) => (
                <button
                  key={id}
                  onClick={() => { setTab(id); setError(''); }}
                  className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${tab === id ? 'sb-gradient text-white shadow-[0_4px_12px_-4px_rgba(var(--sb-rgb),0.8)]' : 'text-text-muted hover:text-text-main'}`}
                >
                  {icon} {label}
                </button>
              ))}
            </div>
          </div>

          <div className="px-3 pb-3 overflow-y-auto custom-scrollbar flex-1 min-h-0">
            {error && (
              <div className="mb-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">{error}</div>
            )}

            {/* Bilgisayardan ses yükleme: önce dosya seç, sonra ad ver ve paylaşımı seç */}
            {pendingFile ? (
              <div className="mb-3 p-2.5 rounded-xl sb-pad">
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={() => pendingUrl && togglePreview({ id: -1, url: pendingUrl })}
                    title={previewId === -1 ? 'Durdur' : 'Dinle (sadece sen duyarsın)'}
                    aria-label={previewId === -1 ? 'Önizlemeyi durdur' : 'Önizle'}
                    className="w-8 h-8 shrink-0 rounded-lg sb-gradient text-white flex items-center justify-center active:scale-90 transition-transform"
                  >
                    {previewId === -1 ? <Square size={11} fill="currentColor" /> : <Play size={12} fill="currentColor" className="ml-0.5" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] text-text-muted truncate flex items-center gap-1"><FileAudio size={11} className="shrink-0" /> {pendingFile.name}</div>
                    <div className="text-[10px] text-text-muted">{(pendingFile.size / 1024).toFixed(0)} KB</div>
                  </div>
                  <button onClick={cancelPending} disabled={isUploading} className="p-1 text-text-muted hover:text-text-main rounded-full disabled:opacity-40" aria-label="İptal">
                    <X size={14} />
                  </button>
                </div>
                <input
                  value={pendingName}
                  onChange={e => setPendingName(e.target.value.slice(0, 32))}
                  onKeyDown={e => { if (e.key === 'Enter') handleUpload(); }}
                  placeholder="Ses adı"
                  maxLength={32}
                  autoFocus
                  className="w-full px-3 py-2 mb-2 rounded-lg bg-bg-base border border-border-main text-xs text-text-main placeholder:text-text-muted focus:outline-none focus:border-[var(--sb-from)] transition-colors"
                />
                <label className="flex items-center gap-2 mb-2.5 text-[11px] text-text-main cursor-pointer select-none">
                  <input type="checkbox" checked={pendingPublic} onChange={e => setPendingPublic(e.target.checked)} className="accent-[var(--sb-from)]" />
                  <Globe size={12} className="text-text-muted" /> Ses Mağazası'nda herkesle paylaş
                </label>
                <button
                  onClick={handleUpload}
                  disabled={isUploading || !pendingName.trim()}
                  className="w-full py-2 rounded-lg sb-gradient text-white text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform disabled:opacity-50"
                >
                  {isUploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                  {isUploading ? 'Yükleniyor...' : 'Yükle ve soundboard\'uma ekle'}
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={ownCount >= MAX_OWN || isLoading}
                title="MP3 veya OGG, en çok 2MB. Dosyayı panelin üzerine sürükleyip bırakabilirsin."
                className="mb-3 w-full py-2.5 rounded-xl border border-dashed border-[rgba(var(--sb-rgb),0.6)] bg-[rgba(var(--sb-rgb),0.06)] text-xs font-semibold text-text-main hover:border-[var(--sb-to)] hover:bg-[rgba(var(--sb-to-rgb),0.1)] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Upload size={14} className="text-[var(--sb-from)]" />
                {ownCount >= MAX_OWN ? `Yükleme sınırı doldu (${MAX_OWN}/${MAX_OWN})` : 'Bilgisayarından MP3 yükle'}
                {ownCount < MAX_OWN && <span className="text-[10px] font-medium text-text-muted">{ownCount}/{MAX_OWN}</span>}
              </button>
            )}

            {tab === 'board' ? (
              <>
                {/* Soundboard ses seviyesi — yalnizca bu cihazda, digerlerini etkilemez */}
                <div className="mb-3 flex items-center gap-2 px-1" title="Soundboard ses seviyesi (sadece senin için)">
                  <button
                    onClick={() => updateSettings({ soundboardVolume: soundboardVolume === 0 ? 0.5 : 0 })}
                    className="p-1 text-text-muted hover:text-text-main transition-colors shrink-0"
                    aria-label={soundboardVolume === 0 ? 'Soundboard sesini aç' : 'Soundboard sesini kapat'}
                  >
                    {soundboardVolume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  </button>
                  <input
                    type="range" min="0" max="1" step="0.01" value={soundboardVolume}
                    onChange={e => updateSettings({ soundboardVolume: parseFloat(e.target.value) })}
                    className="flex-1 h-1.5 bg-bg-base rounded-full appearance-none cursor-pointer accent-[var(--sb-from)]"
                    aria-label="Soundboard ses seviyesi"
                  />
                  <span className="text-[11px] text-text-muted w-8 text-right tabular-nums">{Math.round(soundboardVolume * 100)}%</span>
                </div>

                {isLoading ? (
                  <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-text-muted" /></div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {sounds.map(sound => (
                      <div key={sound.id} className="relative group">
                        <button
                          onClick={() => handlePlay(sound)}
                          disabled={cooldown}
                          data-fav={sound.isFavorite}
                          title={cooldown ? 'Bekle... (2 sn)' : `Herkese çal: ${sound.name}`}
                          className="sb-pad w-full pl-2.5 pr-7 py-2 rounded-xl text-left active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <span className="block text-xs font-semibold text-text-main truncate">{sound.name}</span>
                          <span className="block text-[10px] text-text-muted truncate">
                            {sound.isMine ? 'Senin' : `${sound.uploaderUsername ?? 'silinmiş'} ekledi`}
                            {sound.playCount > 0 && ` · ${formatCount(sound.playCount)} çalma`}
                          </span>
                        </button>
                        <button
                          onClick={() => toggleFavorite(sound)}
                          title={sound.isFavorite ? 'Favoriden çıkar' : 'Favorile (en başa al)'}
                          aria-label={sound.isFavorite ? 'Favoriden çıkar' : 'Favorile'}
                          className={`absolute top-1/2 -translate-y-1/2 right-1.5 p-1 rounded-md transition-all ${sound.isFavorite ? 'text-yellow-400' : 'text-text-muted opacity-60 sm:opacity-0 group-hover:opacity-100 hover:text-yellow-300'}`}
                        >
                          <Star size={13} fill={sound.isFavorite ? 'currentColor' : 'none'} />
                        </button>
                        <div className="absolute -top-1.5 -right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {sound.isMine && (
                            <button
                              onClick={() => toggleVisibility(sound)}
                              title={sound.isPublic ? 'Mağazada görünüyor — gizle' : 'Gizli — mağazada paylaş'}
                              className="p-1 rounded-full bg-bg-card border border-border-main text-text-main"
                            >
                              {sound.isPublic ? <Globe size={10} /> : <Lock size={10} />}
                            </button>
                          )}
                          <button
                            onClick={() => handleRemove(sound)}
                            title={sound.isMine ? 'Sesi sil' : 'Soundboard\'umdan çıkar'}
                            className="p-1 rounded-full bg-red-500/90 text-white"
                          >
                            {sound.isMine ? <Trash2 size={10} /> : <X size={10} />}
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={() => setTab('store')}
                      className="px-2 py-2.5 rounded-xl border border-dashed border-[rgba(var(--sb-rgb),0.45)] text-text-muted text-xs font-medium hover:text-[var(--sb-to)] hover:border-[var(--sb-to)] transition-all flex items-center justify-center gap-1.5"
                    >
                      <Store size={13} /> Mağazaya göz at
                    </button>
                  </div>
                )}

                {!isLoading && sounds.length === 0 && (
                  <p className="mt-2 text-[11px] text-text-muted text-center">
                    Henüz sesin yok. Yukarıdan bilgisayarından MP3 yükle ya da mağazadan başkalarının seslerini ekle. Bastığında odadaki herkes duyar.
                  </p>
                )}
                {!isLoading && sounds.length > 0 && (
                  <p className="mt-3 text-[10px] text-text-muted text-center">
                    Yüklediklerin: {ownCount}/{MAX_OWN} · Mağazadan: {savedCount}/{MAX_SAVED} · ⭐ favoriler en başta durur
                  </p>
                )}
              </>
            ) : (
              <>
                {/* Arama + sıralama */}
                <div className="relative mb-2">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    value={storeQuery}
                    onChange={e => setStoreQuery(e.target.value)}
                    placeholder="Ses ya da kullanıcı ara..."
                    maxLength={50}
                    className="w-full pl-8 pr-3 py-2 rounded-xl bg-bg-base border border-border-main text-xs text-text-main placeholder:text-text-muted focus:outline-none focus:border-[var(--sb-from)] transition-colors"
                  />
                </div>
                <div className="flex gap-1.5 mb-3 overflow-x-auto no-scrollbar">
                  {SORTS.map(s => (
                    <button
                      key={s.id}
                      onClick={() => { setStoreSort(s.id); setStorePage(1); }}
                      className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${storeSort === s.id ? 'sb-gradient text-white border-transparent' : 'border-border-main text-text-muted hover:text-text-main'}`}
                    >
                      {s.icon} {s.label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col gap-1.5">
                  {storeItems.map((item, idx) => (
                    <div key={item.id} className="flex items-center gap-2.5 p-2 rounded-xl bg-bg-base/60 border border-border-main hover:border-[rgba(var(--sb-rgb),0.45)] transition-colors">
                      <button
                        onClick={() => togglePreview(item)}
                        title={previewId === item.id ? 'Durdur' : 'Önizle (sadece sen duyarsın)'}
                        aria-label={previewId === item.id ? 'Önizlemeyi durdur' : 'Önizle'}
                        className="w-8 h-8 shrink-0 rounded-lg sb-gradient text-white flex items-center justify-center active:scale-90 transition-transform"
                      >
                        {previewId === item.id ? <Square size={11} fill="currentColor" /> : <Play size={12} fill="currentColor" className="ml-0.5" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {storeSort !== 'new' && idx < 3 && !debouncedQuery && (
                            <span className="text-[10px] font-bold sb-gradient-text">#{idx + 1}</span>
                          )}
                          <span className="text-xs font-semibold text-text-main truncate">{item.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-text-muted min-w-0">
                          <span className="w-4 h-4 rounded-full overflow-hidden bg-bg-card flex items-center justify-center text-[9px] shrink-0">
                            {renderAvatar(item.uploaderAvatarId || 'default')}
                          </span>
                          <span className="truncate">{item.isMine ? 'Sen' : item.uploaderUsername}</span>
                          <span className="shrink-0">· {formatCount(item.saveCount)} ekleme · {formatCount(item.playCount)} çalma</span>
                        </div>
                      </div>
                      {item.isMine ? (
                        <span className="shrink-0 text-[10px] font-semibold px-2 py-1 rounded-lg border border-border-main text-text-muted">Senin</span>
                      ) : (
                        <button
                          onClick={() => toggleSave(item)}
                          disabled={pendingIds.has(item.id)}
                          title={item.isSaved ? 'Soundboard\'umdan çıkar' : 'Soundboard\'uma ekle'}
                          className={`shrink-0 flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-all active:scale-95 disabled:opacity-50 ${item.isSaved ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30' : 'sb-gradient text-white'}`}
                        >
                          {pendingIds.has(item.id) ? <Loader2 size={12} className="animate-spin" /> : item.isSaved ? <Check size={12} /> : <Plus size={12} />}
                          {item.isSaved ? 'Ekli' : 'Ekle'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {storeLoading && (
                  <div className="flex justify-center py-4"><Loader2 size={18} className="animate-spin text-text-muted" /></div>
                )}
                {!storeLoading && storeItems.length === 0 && (
                  <p className="py-6 text-[11px] text-text-muted text-center">
                    {debouncedQuery ? 'Aramana uyan ses yok.' : 'Mağaza henüz boş. İlk sesi sen yükle, herkes görsün!'}
                  </p>
                )}
                {!storeLoading && storeHasMore && (
                  <button
                    onClick={() => setStorePage(p => p + 1)}
                    className="mt-2 w-full py-2 rounded-xl text-xs font-semibold text-text-muted border border-border-main hover:text-text-main transition-colors"
                  >
                    Daha fazla göster
                  </button>
                )}
              </>
            )}
          </div>

          <input type="file" ref={fileInputRef} accept=".mp3,.ogg,audio/mpeg,audio/ogg" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; pickFile(f); }} />
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SoundboardPanel;
