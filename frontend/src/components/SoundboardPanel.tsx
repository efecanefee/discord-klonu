import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, Trash2, Volume2, Loader2 } from 'lucide-react';
import signalrService from '../services/signalrService';

interface Sound {
  id: number;
  name: string;
  url: string;
}

interface SoundboardPanelProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  apiBaseUrl: string;
}

// Ana Salon soundboard'u: kullanıcının kişisel mp3/ogg sesleri.
// Bir sese basınca hub üzerinden odadaki HERKESTE çalar.
const SoundboardPanel: React.FC<SoundboardPanelProps> = ({ isOpen, onClose, roomId, apiBaseUrl }) => {
  const [sounds, setSounds] = useState<Sound[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setIsLoading(true);
    setError('');
    fetch(`${apiBaseUrl}/api/sounds`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(data => { if (!cancelled) setSounds(data); })
      .catch(() => { if (!cancelled) setError('Sesler yüklenemedi.'); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, apiBaseUrl]);

  const handlePlay = (sound: Sound) => {
    if (cooldown) return;
    signalrService.playSound(roomId, sound.url, sound.name);
    // Hub tarafındaki 2 sn spam korumasını arayüzde de yansıt
    setCooldown(true);
    setTimeout(() => setCooldown(false), 2000);
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/\.(mp3|ogg)$/i.test(file.name)) {
      setError('Sadece MP3 veya OGG yükleyebilirsin.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Ses dosyası 2MB\'ı geçemez.');
      return;
    }
    const defaultName = file.name.replace(/\.(mp3|ogg)$/i, '').slice(0, 32);
    const name = (window.prompt('Ses adı:', defaultName) || '').trim().slice(0, 32);
    if (!name) return;

    setIsUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const upRes = await fetch(`${apiBaseUrl}/api/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: formData,
      });
      if (!upRes.ok) throw new Error(await upRes.text());
      const upData = await upRes.json();

      const addRes = await fetch(`${apiBaseUrl}/api/sounds`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ name, url: upData.url }),
      });
      if (!addRes.ok) throw new Error(await addRes.text());
      const added = await addRes.json();
      setSounds(prev => [...prev, added]);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Ses yüklenemedi.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (sound: Sound) => {
    if (!window.confirm(`"${sound.name}" silinsin mi?`)) return;
    try {
      const res = await fetch(`${apiBaseUrl}/api/sounds/${sound.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok || res.status === 204) {
        setSounds(prev => prev.filter(s => s.id !== sound.id));
      }
    } catch {
      setError('Ses silinemedi.');
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
          className="w-[300px] max-w-[calc(100vw-1.5rem)] max-h-[360px] overflow-y-auto custom-scrollbar bg-bg-surface border border-border-main rounded-2xl shadow-2xl p-3"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-text-main flex items-center gap-2">
              <Volume2 size={15} className="text-primary-main" /> Soundboard
            </span>
            <button onClick={onClose} className="p-1.5 text-text-muted hover:text-text-main rounded-full hover:bg-surface-subtle transition-colors">
              <X size={15} />
            </button>
          </div>

          {error && (
            <div className="mb-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">{error}</div>
          )}

          {isLoading ? (
            <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-text-muted" /></div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {sounds.map(sound => (
                <div key={sound.id} className="relative group">
                  <button
                    onClick={() => handlePlay(sound)}
                    disabled={cooldown}
                    title={cooldown ? 'Bekle... (2 sn)' : `Herkese çal: ${sound.name}`}
                    className="w-full px-2 py-2.5 rounded-xl bg-bg-base border border-border-main text-text-main text-xs font-medium truncate hover:border-primary-main hover:text-primary-main active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {sound.name}
                  </button>
                  <button
                    onClick={() => handleDelete(sound)}
                    title="Sesi sil"
                    className="absolute -top-1.5 -right-1.5 p-1 rounded-full bg-red-500/90 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
              {sounds.length < 10 && (
                <button
                  onClick={() => !isUploading && fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="px-2 py-2.5 rounded-xl border border-dashed border-border-main text-text-muted text-xs font-medium hover:border-primary-main hover:text-primary-main transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isUploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                  {isUploading ? 'Yükleniyor...' : 'Ses Yükle'}
                </button>
              )}
            </div>
          )}

          {!isLoading && sounds.length === 0 && (
            <p className="mt-2 text-[11px] text-text-muted text-center">
              Henüz sesin yok. MP3/OGG yükle (en çok 2MB, 10 ses) — bastığında odadaki herkes duyar.
            </p>
          )}

          <input type="file" ref={fileInputRef} accept=".mp3,.ogg,audio/mpeg,audio/ogg" className="hidden" onChange={handleFileSelected} />
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SoundboardPanel;
