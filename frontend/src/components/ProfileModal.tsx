import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, User, UserCircle } from 'lucide-react';
import { AVATARS, getAvatarEmoji } from '../constants/avatars';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUsername: string;
  currentFirstName: string;
  currentLastName: string;
  currentAvatarId: string;
  onSave: (data: { username: string; firstName: string; lastName: string; avatarId: string }) => Promise<void>;
}

const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  currentUsername,
  currentFirstName,
  currentLastName,
  currentAvatarId,
  onSave
}) => {
  const [username, setUsername] = useState(currentUsername);
  const [firstName, setFirstName] = useState(currentFirstName);
  const [lastName, setLastName] = useState(currentLastName);
  const [avatarId, setAvatarId] = useState(currentAvatarId);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const [debouncedUsername, setDebouncedUsername] = useState(currentUsername);
  const [debouncedFirstName, setDebouncedFirstName] = useState(currentFirstName);
  const [debouncedLastName, setDebouncedLastName] = useState(currentLastName);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedUsername(username);
      setDebouncedFirstName(firstName);
      setDebouncedLastName(lastName);
    }, 300);
    return () => clearTimeout(handler);
  }, [username, firstName, lastName]);

  useEffect(() => {
    if (isOpen) {
      setUsername(currentUsername);
      setFirstName(currentFirstName);
      setLastName(currentLastName);
      setAvatarId(currentAvatarId);
      setError('');
    }
  }, [isOpen, currentUsername, currentFirstName, currentLastName, currentAvatarId]);

  const handleSave = async () => {
    if (!username.trim()) {
      setError('Kullanıcı adı boş olamaz.');
      return;
    }
    if (username.includes(' ')) {
      setError('Kullanıcı adı boşluk içeremez.');
      return;
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
      setError('Kullanıcı adı sadece harf, rakam, nokta, tire ve alt çizgi içerebilir.');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      await onSave({ username, firstName, lastName, avatarId });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Bir hata oluştu.');
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
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          className="relative w-full max-w-2xl bg-[#0F172A] border border-[#334155] rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row"
        >
          {/* Sol Panel: Form ve Seçim */}
          <div className="flex-1 p-6 border-b md:border-b-0 md:border-r border-[#334155] max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <UserCircle className="text-[#7C3AED]" />
                Profili Düzenle
              </h2>
              <button onClick={onClose} className="p-2 text-white/50 hover:text-white hover:bg-white/5 rounded-full transition-colors md:hidden">
                <X size={20} />
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}

            <div className="space-y-4 mb-6">
              <div className="flex gap-3">
                <div className="flex-1 space-y-1">
                  <label className="text-xs text-white/50 uppercase tracking-wider font-semibold">Ad</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full bg-[#1E293B] border border-[#334155] rounded-xl px-4 py-2.5 text-white outline-none focus:border-[#7C3AED] transition-colors text-sm"
                    placeholder="Adınız"
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <label className="text-xs text-white/50 uppercase tracking-wider font-semibold">Soyad</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full bg-[#1E293B] border border-[#334155] rounded-xl px-4 py-2.5 text-white outline-none focus:border-[#7C3AED] transition-colors text-sm"
                    placeholder="Soyadınız"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-white/50 uppercase tracking-wider font-semibold">Kullanıcı Adı</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-[#1E293B] border border-[#334155] rounded-xl pl-9 pr-4 py-2.5 text-white outline-none focus:border-[#7C3AED] transition-colors text-sm"
                    placeholder="Kullanıcı adınız"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-white/50 uppercase tracking-wider font-semibold">Avatar Seçimi</label>
              <div className="grid grid-cols-3 gap-3">
                {AVATARS.map((avatar) => (
                  <button
                    key={avatar.id}
                    onClick={() => setAvatarId(avatar.id)}
                    className={`relative rounded-xl flex items-center justify-center transition-all overflow-hidden aspect-square text-4xl bg-[#1E293B] ${
                      avatarId === avatar.id
                        ? 'border-2 border-[#7C3AED] shadow-[0_0_20px_rgba(124,58,237,0.5)] scale-[1.02] z-10'
                        : 'border-2 border-transparent hover:border-[#7C3AED]/50 hover:scale-[1.02]'
                    }`}
                  >
                    {avatar.emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Sağ Panel: Live Preview */}
          <div className="w-full md:w-80 bg-[#0B1020] p-6 flex flex-col items-center justify-center relative">
            <button onClick={onClose} className="absolute top-4 right-4 p-2 text-white/50 hover:text-white hover:bg-white/5 rounded-full transition-colors hidden md:block">
              <X size={20} />
            </button>
            
            <h3 className="text-sm font-semibold text-white/50 mb-6 uppercase tracking-widest w-full text-center">Canlı Önizleme</h3>
            
            {/* Mesaj Balonu Önizlemesi */}
            <div className="w-full mb-8">
              <div className="flex gap-3 items-end justify-end mb-2">
                <div className="flex flex-col items-end max-w-[85%]">
                  <span className="text-[11px] font-medium text-white/40 mb-1 max-w-full truncate">
                    {debouncedFirstName || debouncedLastName ? `${debouncedFirstName} ${debouncedLastName}`.trim() : debouncedUsername}
                  </span>
                  <div className="px-4 py-2.5 rounded-2xl shadow-sm text-[13px] bg-gradient-to-br from-[#7C3AED] to-[#8B5CF6] text-white rounded-tr-sm">
                    Merhaba, bu yeni profilim!
                  </div>
                </div>
                <div className="w-8 h-8 rounded-full border border-[#7C3AED] overflow-hidden bg-[#1E293B] shrink-0 flex items-center justify-center text-sm">
                  {getAvatarEmoji(avatarId)}
                </div>
              </div>
            </div>

            {/* Aktif Kullanıcı Listesi Önizlemesi */}
            <div className="w-full bg-[#1E293B]/50 border border-[#334155] rounded-xl p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full border-2 border-[#7C3AED] overflow-hidden shrink-0 flex items-center justify-center text-xl bg-[#1E293B]">
                 {getAvatarEmoji(avatarId)}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold text-white truncate w-full">
                  {debouncedUsername || 'kullanici_adi'}
                </span>
                <span className="text-[10px] text-white/40 truncate w-full">
                  Sohbet Odasında
                </span>
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={isLoading}
              className="mt-8 w-full py-3 rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#8B5CF6] text-white font-semibold text-sm hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Save size={16} />
              {isLoading ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ProfileModal;
