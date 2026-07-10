import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Hash, Volume2, MessageSquare, Loader2 } from 'lucide-react';

interface CreateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateRoom: (data: { name: string; type: string; description?: string }) => Promise<void>;
}

const CreateRoomModal: React.FC<CreateRoomModalProps> = ({
  isOpen,
  onClose,
  onCreateRoom
}) => {
  const [name, setName] = useState('');
  const [type, setType] = useState<'text' | 'voice'>('text');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Modal her açıldığında formu sıfırla
  useEffect(() => {
    if (isOpen) {
      setName('');
      setType('text');
      setDescription('');
      setError('');
      setIsLoading(false);
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
      await onCreateRoom({
        name: trimmedName,
        type,
        description: description.trim() || undefined
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Oda oluşturulurken bir hata oluştu.');
    } finally {
      setIsLoading(false);
    }
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
          className="relative w-full max-w-md bg-[#09090b] border border-[#334155] rounded-3xl overflow-hidden shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Üst Gradient Çizgi */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-[#7C3AED]/40 to-transparent" />

          {/* Header */}
          <div className="flex items-center justify-between p-6 pb-2">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{
                  background: 'rgba(124, 58, 237, 0.15)',
                  border: '1px solid rgba(124, 58, 237, 0.3)',
                  boxShadow: '0 0 20px rgba(124, 58, 237, 0.2)',
                }}
              >
                <Plus size={20} className="text-[#7C3AED]" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Yeni Oda Oluştur</h2>
                <p className="text-xs text-white/40">Arkadaşlarınla sohbet etmek için bir oda aç</p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isLoading}
              className="p-2 text-white/50 hover:text-white hover:bg-white/5 rounded-full transition-colors disabled:opacity-50"
            >
              <X size={20} />
            </button>
          </div>

          {/* Form */}
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
              <label className="text-xs text-white/50 uppercase tracking-wider font-semibold">
                Oda Adı <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <MessageSquare className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setError(''); }}
                  placeholder="ör. Genel Sohbet"
                  maxLength={50}
                  autoFocus
                  disabled={isLoading}
                  className="w-full bg-[#18181b] border border-[#334155] rounded-xl pl-10 pr-4 py-3 text-white outline-none focus:border-[#7C3AED] transition-colors text-sm placeholder:text-white/20 disabled:opacity-50"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] text-white/20">
                  {name.length}/50
                </span>
              </div>
            </div>

            {/* Oda Türü */}
            <div className="space-y-2">
              <label className="text-xs text-white/50 uppercase tracking-wider font-semibold">
                Oda Türü
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setType('text')}
                  disabled={isLoading}
                  className={`relative flex items-center gap-3 p-3.5 rounded-xl border transition-all duration-200 ${
                    type === 'text'
                      ? 'bg-[#7C3AED]/10 border-[#7C3AED]/50 shadow-[0_0_20px_rgba(124,58,237,0.15)]'
                      : 'bg-[#18181b] border-[#334155] hover:border-[#7C3AED]/30'
                  } disabled:opacity-50`}
                >
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                      type === 'text'
                        ? 'bg-[#7C3AED]/20'
                        : 'bg-white/5'
                    }`}
                  >
                    <Hash size={18} className={type === 'text' ? 'text-[#7C3AED]' : 'text-white/40'} />
                  </div>
                  <div className="text-left">
                    <div className={`text-sm font-semibold ${type === 'text' ? 'text-white' : 'text-white/60'}`}>
                      Yazı
                    </div>
                    <div className="text-[10px] text-white/30">Mesajlaşma</div>
                  </div>
                  {type === 'text' && (
                    <motion.div
                      layoutId="typeIndicator"
                      className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#7C3AED]"
                      style={{ boxShadow: '0 0 8px rgba(124, 58, 237, 0.8)' }}
                    />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setType('voice')}
                  disabled={isLoading}
                  className={`relative flex items-center gap-3 p-3.5 rounded-xl border transition-all duration-200 ${
                    type === 'voice'
                      ? 'bg-[#10b981]/10 border-[#10b981]/50 shadow-[0_0_20px_rgba(16,185,129,0.15)]'
                      : 'bg-[#18181b] border-[#334155] hover:border-[#10b981]/30'
                  } disabled:opacity-50`}
                >
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                      type === 'voice'
                        ? 'bg-[#10b981]/20'
                        : 'bg-white/5'
                    }`}
                  >
                    <Volume2 size={18} className={type === 'voice' ? 'text-[#10b981]' : 'text-white/40'} />
                  </div>
                  <div className="text-left">
                    <div className={`text-sm font-semibold ${type === 'voice' ? 'text-white' : 'text-white/60'}`}>
                      Ses
                    </div>
                    <div className="text-[10px] text-white/30">Sesli sohbet</div>
                  </div>
                  {type === 'voice' && (
                    <motion.div
                      layoutId="typeIndicator"
                      className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#10b981]"
                      style={{ boxShadow: '0 0 8px rgba(16, 185, 129, 0.8)' }}
                    />
                  )}
                </button>
              </div>
            </div>

            {/* Açıklama */}
            <div className="space-y-2">
              <label className="text-xs text-white/50 uppercase tracking-wider font-semibold">
                Açıklama <span className="text-white/20 normal-case">(isteğe bağlı)</span>
              </label>
              <div className="relative">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Bu oda ne hakkında?"
                  maxLength={200}
                  rows={3}
                  disabled={isLoading}
                  className="w-full bg-[#18181b] border border-[#334155] rounded-xl px-4 py-3 text-white outline-none focus:border-[#7C3AED] transition-colors text-sm placeholder:text-white/20 resize-none disabled:opacity-50"
                />
                <span className="absolute right-3 bottom-2 text-[10px] text-white/20">
                  {description.length}/200
                </span>
              </div>
            </div>

            {/* Alt Gradient Ayırıcı */}
            <div className="w-full h-px bg-gradient-to-r from-transparent via-[#334155] to-transparent" />

            {/* Submit Button */}
            <motion.button
              type="submit"
              disabled={isLoading || !name.trim()}
              whileHover={!isLoading && name.trim() ? { scale: 1.02, y: -1 } : {}}
              whileTap={!isLoading && name.trim() ? { scale: 0.98 } : {}}
              className="w-full py-3.5 rounded-xl text-white font-semibold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              style={{
                background: 'linear-gradient(135deg, #7C3AED 0%, #8B5CF6 50%, #7C3AED 100%)',
                boxShadow: !isLoading && name.trim()
                  ? '0 8px 32px rgba(124,58,237,0.35), 0 1px 0 rgba(255,255,255,0.15) inset'
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

          {/* Alt Gradient Çizgi */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2/3 h-px bg-gradient-to-r from-transparent via-[#7C3AED]/30 to-transparent" />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default CreateRoomModal;
