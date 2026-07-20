import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, User, UserCircle, Upload, Loader2 } from 'lucide-react';
import { AVATARS, renderAvatar, isCustomAvatar } from '../constants/avatars';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5098';

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
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [error, setError] = useState('');
  const photoInputRef = useRef<HTMLInputElement>(null);

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

  const handlePhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/\.(png|jpe?g|webp|gif)$/i.test(file.name)) {
      setError('Sadece PNG, JPG, WEBP veya GIF yükleyebilirsin.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Fotoğraf boyutu 5MB\'ı geçemez.');
      return;
    }
    setIsUploadingPhoto(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: formData,
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setAvatarId('url:' + data.url);
    } catch {
      setError('Fotoğraf yüklenemedi, tekrar dene.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

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
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          className="relative w-full max-w-2xl max-h-[calc(100dvh-2rem)] bg-bg-surface border border-[#334155] rounded-3xl overflow-y-auto custom-scrollbar shadow-2xl flex flex-col md:flex-row"
        >
          {/* Sol Panel: Form ve Seçim */}
          <div className="flex-1 p-4 sm:p-6 border-b md:border-b-0 md:border-r border-[#334155]">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-text-main flex items-center gap-2">
                <UserCircle className="text-primary-main" />
                Profili Düzenle
              </h2>
              <button onClick={onClose} className="p-2 text-text-muted hover:text-text-main hover:bg-surface-subtle rounded-full transition-colors md:hidden">
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
                  <label className="text-xs text-text-muted uppercase tracking-wider font-semibold">Ad</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full bg-bg-base border border-[#334155] rounded-xl px-4 py-2.5 text-text-main outline-none focus:border-primary-main transition-colors text-sm"
                    placeholder="Adınız"
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <label className="text-xs text-text-muted uppercase tracking-wider font-semibold">Soyad</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full bg-bg-base border border-[#334155] rounded-xl px-4 py-2.5 text-text-main outline-none focus:border-primary-main transition-colors text-sm"
                    placeholder="Soyadınız"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-text-muted uppercase tracking-wider font-semibold">Kullanıcı Adı</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-bg-base border border-[#334155] rounded-xl pl-9 pr-4 py-2.5 text-text-main outline-none focus:border-primary-main transition-colors text-sm"
                    placeholder="Kullanıcı adınız"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-text-muted uppercase tracking-wider font-semibold">Avatar Seçimi</label>
              <div className="grid grid-cols-3 gap-3">
                {AVATARS.map((avatar) => (
                  <button
                    key={avatar.id}
                    onClick={() => setAvatarId(avatar.id)}
                    className={`relative rounded-full flex items-center justify-center transition-all overflow-hidden aspect-square text-4xl bg-bg-base ${
                      avatarId === avatar.id
                        ? 'border-2 border-primary-main shadow-[0_0_20px_rgba(var(--accent-rgb),0.5)] scale-[1.02] z-10'
                        : 'border-2 border-transparent hover:border-primary-main/50 hover:scale-[1.02]'
                    }`}
                  >
                    {renderAvatar(avatar.id)}
                  </button>
                ))}
                {/* Kendi fotoğrafını yükle */}
                <button
                  onClick={() => !isUploadingPhoto && photoInputRef.current?.click()}
                  title="Kendi fotoğrafını yükle"
                  className={`relative rounded-full flex items-center justify-center transition-all overflow-hidden aspect-square bg-bg-base ${
                    isCustomAvatar(avatarId)
                      ? 'border-2 border-primary-main shadow-[0_0_20px_rgba(var(--accent-rgb),0.5)] scale-[1.02] z-10'
                      : 'border-2 border-dashed border-[#334155] hover:border-primary-main/50 hover:scale-[1.02]'
                  }`}
                >
                  {isUploadingPhoto ? (
                    <Loader2 size={22} className="text-primary-main animate-spin" />
                  ) : isCustomAvatar(avatarId) ? (
                    renderAvatar(avatarId)
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-text-muted">
                      <Upload size={20} />
                      <span className="text-[9px] font-semibold uppercase tracking-wide">Yükle</span>
                    </div>
                  )}
                </button>
                <input
                  type="file"
                  ref={photoInputRef}
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={handlePhotoSelected}
                />
              </div>
            </div>
          </div>

          {/* Sağ Panel: Live Preview */}
          <div className="w-full md:w-80 bg-[#0B1020] p-4 sm:p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] flex flex-col items-center justify-center relative shrink-0">
            <button onClick={onClose} className="absolute top-4 right-4 p-2 text-text-muted hover:text-text-main hover:bg-surface-subtle rounded-full transition-colors hidden md:block">
              <X size={20} />
            </button>
            
            <h3 className="text-sm font-semibold text-text-muted mb-6 uppercase tracking-widest w-full text-center">Canlı Önizleme</h3>
            
            {/* Mesaj Balonu Önizlemesi */}
            <div className="w-full mb-8">
              <div className="flex gap-3 items-end justify-end mb-2">
                <div className="flex flex-col items-end max-w-[85%]">
                  <span className="text-[11px] font-medium text-text-muted mb-1 max-w-full truncate">
                    {debouncedFirstName || debouncedLastName ? `${debouncedFirstName} ${debouncedLastName}`.trim() : debouncedUsername}
                  </span>
                  <div className="px-4 py-2.5 rounded-2xl shadow-sm text-[13px] bg-gradient-to-br from-primary-main to-primary-main text-text-main rounded-tr-sm">
                    Merhaba, bu yeni profilim!
                  </div>
                </div>
                <div className="w-8 h-8 rounded-full border border-primary-main overflow-hidden bg-bg-base shrink-0 flex items-center justify-center text-sm">
                  {renderAvatar(avatarId)}
                </div>
              </div>
            </div>

            {/* Aktif Kullanıcı Listesi Önizlemesi */}
            <div className="w-full bg-bg-base/50 border border-[#334155] rounded-xl p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full border-2 border-primary-main overflow-hidden shrink-0 flex items-center justify-center text-xl bg-bg-base">
                 {renderAvatar(avatarId)}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold text-text-main truncate w-full">
                  {debouncedUsername || 'kullanici_adi'}
                </span>
                <span className="text-[10px] text-text-muted truncate w-full">
                  Sohbet Odasında
                </span>
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={isLoading}
              className="mt-8 w-full py-3 rounded-xl bg-gradient-to-br from-primary-main to-primary-main text-text-main font-semibold text-sm hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
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
