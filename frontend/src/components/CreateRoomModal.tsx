import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Hash, Volume2, MessageSquare, Loader2, Lock, Globe, Check, Copy, Link2 } from 'lucide-react';

interface CreatedRoomInfo {
  name: string;
  isPrivate: boolean;
  roomCode?: string;
}

interface CreateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateRoom: (data: { name: string; description?: string; isPrivate: boolean }) => Promise<CreatedRoomInfo | void>;
}

const CreateRoomModal: React.FC<CreateRoomModalProps> = ({
  isOpen,
  onClose,
  onCreateRoom
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [createdRoom, setCreatedRoom] = useState<CreatedRoomInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // Modal her açıldığında formu sıfırla
  useEffect(() => {
    if (isOpen) {
      setName('');
      setDescription('');
      setIsPrivate(false);
      setError('');
      setIsLoading(false);
      setCreatedRoom(null);
      setCopied(false);
    }
  }, [isOpen]);

  // ESC tuşu ile kapat
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isLoading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, isLoading, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Client-side validation
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Oda adı boş olamaz.');
      return;
    }
    if (trimmedName.length > 50) {
      setError('Oda adı en fazla 50 karakter olabilir.');
      return;
    }
    if (description.length > 200) {
      setError('Açıklama en fazla 200 karakter olabilir.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const result = await onCreateRoom({
        name: trimmedName,
        description: description.trim() || undefined,
        isPrivate
      });
      // Oluşturulan odanın kodunu göster (özellikle gizli odalar için önemli)
      if (result && result.roomCode) {
        setCreatedRoom(result);
      } else {
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Oda oluşturulurken bir hata oluştu.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyCode = async () => {
    if (!createdRoom?.roomCode) return;
    try {
      await navigator.clipboard.writeText(createdRoom.roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* pano erişimi yok */ }
  };

  const handleCopyInviteLink = async () => {
    if (!createdRoom?.roomCode) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/?invite=${createdRoom.roomCode}`);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch { /* pano erişimi yok */ }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget && !isLoading) onClose();
        }}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-md bg-bg-surface border border-[#334155] rounded-3xl overflow-hidden shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Üst Gradient Çizgi */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-primary-main/40 to-transparent" />

          {/* Header */}
          <div className="flex items-center justify-between p-6 pb-2">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{
                  background: 'rgba(var(--accent-rgb), 0.15)',
                  border: '1px solid rgba(var(--accent-rgb), 0.3)',
                  boxShadow: '0 0 20px rgba(var(--accent-rgb), 0.2)',
                }}
              >
                <Plus size={20} className="text-primary-main" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-text-main">Yeni Oda Oluştur</h2>
                <p className="text-xs text-text-muted">Arkadaşlarınla sohbet etmek için bir oda aç</p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isLoading}
              className="p-2 text-text-muted hover:text-text-main hover:bg-surface-subtle rounded-full transition-colors disabled:opacity-50"
            >
              <X size={20} />
            </button>
          </div>

          {/* Oda oluşturuldu — kod gösterim ekranı */}
          {createdRoom ? (
            <div className="p-6 pt-4 space-y-5">
              <div className="flex flex-col items-center text-center gap-3">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{
                    background: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    boxShadow: '0 0 24px rgba(16, 185, 129, 0.2)',
                  }}
                >
                  <Check size={28} className="text-[#10b981]" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-text-main">Oda oluşturuldu!</h3>
                  <p className="text-xs text-text-muted mt-1">
                    <span className="text-text-muted font-semibold">{createdRoom.name}</span> hazır.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-text-muted uppercase tracking-wider font-semibold flex items-center gap-1.5">
                  {createdRoom.isPrivate ? <Lock size={12} /> : <Globe size={12} />}
                  Oda Kodu
                </label>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="w-full flex items-center justify-between gap-3 bg-bg-base border border-[#334155] hover:border-primary-main/50 rounded-xl px-4 py-3.5 transition-colors group"
                >
                  <span className="text-2xl font-mono font-bold tracking-[0.3em] text-text-main">{createdRoom.roomCode}</span>
                  <span className="flex items-center gap-1.5 text-xs text-text-muted group-hover:text-text-main transition-colors">
                    {copied ? <><Check size={14} className="text-[#10b981]" /> Kopyalandı</> : <><Copy size={14} /> Kopyala</>}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyInviteLink}
                  className="w-full flex items-center justify-center gap-2 bg-bg-base border border-[#334155] hover:border-primary-main/50 rounded-xl px-4 py-3 text-sm text-text-muted hover:text-text-main transition-colors"
                >
                  {linkCopied ? <><Check size={15} className="text-[#10b981]" /> Link kopyalandı</> : <><Link2 size={15} /> Davet linkini kopyala</>}
                </button>
                <p className="text-[11px] text-text-muted leading-relaxed">
                  {createdRoom.isPrivate
                    ? 'Bu oda gizli. Sadece bu kodu ya da davet linkini bilenler odayı bulup katılabilir. Paylaşmayı unutma!'
                    : 'Oda herkese açık listede görünür. Kod ya da davet linkiyle de doğrudan katılınabilir.'}
                </p>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-3.5 rounded-xl text-text-main font-semibold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                style={{ background: 'linear-gradient(135deg, var(--color-primary-main) 0%, var(--accent-light) 50%, var(--color-primary-main) 100%)' }}
              >
                Tamam
              </button>
            </div>
          ) : (
          /* Form */
          <form onSubmit={handleSubmit} className="p-6 pt-4 space-y-5">
            {/* Error Message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm"
              >
                {error}
              </motion.div>
            )}

            {/* Oda Adı */}
            <div className="space-y-2">
              <label className="text-xs text-text-muted uppercase tracking-wider font-semibold">
                Oda Adı <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <MessageSquare className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setError(''); }}
                  placeholder="ör. Genel Sohbet"
                  maxLength={50}
                  autoFocus
                  disabled={isLoading}
                  className="w-full bg-bg-base border border-[#334155] rounded-xl pl-10 pr-4 py-3 text-text-main outline-none focus:border-primary-main transition-colors text-sm placeholder:text-text-muted disabled:opacity-50"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] text-text-muted">
                  {name.length}/50
                </span>
              </div>
            </div>

            {/* Kanallar — oda türü seçimi kaldırıldı; her oda metin + ses kanalıyla açılır */}
            <div className="space-y-2">
              <label className="text-xs text-text-muted uppercase tracking-wider font-semibold">
                Kanallar
              </label>
              <div className="rounded-xl border border-[#334155] bg-bg-base p-3 space-y-2.5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary-main/15 flex items-center justify-center shrink-0">
                    <Hash size={16} className="text-primary-main" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-semibold text-text-main">genel</div>
                    <div className="text-[10px] text-text-muted">Metin kanalı — mesajlaşma</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#10b981]/15 flex items-center justify-center shrink-0">
                    <Volume2 size={16} className="text-[#10b981]" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-semibold text-text-main">Sesli Sohbet</div>
                    <div className="text-[10px] text-text-muted">Ses kanalı — sesli sohbet</div>
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-text-muted leading-relaxed">
                Odan bir metin ve bir ses kanalıyla açılır. Sonradan yeni kanallar ekleyebilirsin.
              </p>
            </div>

            {/* Açıklama */}
            <div className="space-y-2">
              <label className="text-xs text-text-muted uppercase tracking-wider font-semibold">
                Açıklama <span className="text-text-muted normal-case">(isteğe bağlı)</span>
              </label>
              <div className="relative">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Bu oda ne hakkında?"
                  maxLength={200}
                  rows={3}
                  disabled={isLoading}
                  className="w-full bg-bg-base border border-[#334155] rounded-xl px-4 py-3 text-text-main outline-none focus:border-primary-main transition-colors text-sm placeholder:text-text-muted resize-none disabled:opacity-50"
                />
                <span className="absolute right-3 bottom-2 text-[10px] text-text-muted">
                  {description.length}/200
                </span>
              </div>
            </div>

            {/* Gizli Oda Toggle */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setIsPrivate(p => !p)}
                disabled={isLoading}
                className={`w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all duration-200 text-left ${
                  isPrivate
                    ? 'bg-primary-main/10 border-primary-main/50 shadow-[0_0_20px_rgba(var(--accent-rgb),0.15)]'
                    : 'bg-bg-base border-[#334155] hover:border-primary-main/30'
                } disabled:opacity-50`}
              >
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all shrink-0 ${
                    isPrivate ? 'bg-primary-main/20' : 'bg-surface-subtle'
                  }`}
                >
                  {isPrivate ? <Lock size={18} className="text-primary-main" /> : <Globe size={18} className="text-text-muted" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-semibold ${isPrivate ? 'text-text-main' : 'text-text-muted'}`}>
                    Gizli Oda
                  </div>
                  <div className="text-[10px] text-text-muted leading-tight">
                    {isPrivate ? 'Sadece oda kodunu bilenler bulabilir' : 'Herkese açık listede görünür'}
                  </div>
                </div>
                {/* Switch */}
                <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${isPrivate ? 'bg-primary-main' : 'bg-surface-subtle-strong'}`}>
                  <span className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white transition-transform ${isPrivate ? 'translate-x-6' : 'translate-x-1'}`} style={{ height: '18px', width: '18px' }} />
                </div>
              </button>
            </div>

            {/* Alt Gradient Ayırıcı */}
            <div className="w-full h-px bg-gradient-to-r from-transparent via-[#334155] to-transparent" />

            {/* Submit Button */}
            <motion.button
              type="submit"
              disabled={isLoading || !name.trim()}
              whileHover={!isLoading && name.trim() ? { scale: 1.02, y: -1 } : {}}
              whileTap={!isLoading && name.trim() ? { scale: 0.98 } : {}}
              className="w-full py-3.5 rounded-xl text-text-main font-semibold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              style={{
                background: 'linear-gradient(135deg, var(--color-primary-main) 0%, var(--accent-light) 50%, var(--color-primary-main) 100%)',
                boxShadow: !isLoading && name.trim()
                  ? '0 8px 32px rgba(var(--accent-rgb),0.35), 0 1px 0 rgba(255,255,255,0.15) inset'
                  : 'none',
              }}
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Oluşturuluyor...
                </>
              ) : (
                <>
                  <Plus size={16} />
                  Oda Oluştur
                </>
              )}
            </motion.button>
          </form>
          )}

          {/* Alt Gradient Çizgi */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2/3 h-px bg-gradient-to-r from-transparent via-primary-main/30 to-transparent" />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default CreateRoomModal;
