import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { modalMotion, overlayMotion } from '../utils/motion';
import { X, Save, User, UserCircle, Upload, Loader2, Palette, RotateCcw } from 'lucide-react';
import WeeklyBadges from './WeeklyBadges';
import { fetchUserProfile, invalidateUserProfile, bannerBackground, PROFILE_SWATCHES, MAX_BIO_LENGTH } from '../utils/userProfile';
import { AVATARS, renderAvatar, isCustomAvatar } from '../constants/avatars';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5098';

export interface ProfileSaveData {
  username: string;
  firstName: string;
  lastName: string;
  avatarId: string;
  bannerColor: string; // "" = varsayılan
  accentColor: string;
  bio: string;
}

// Renk seçici: hazır tonlar + serbest renk + sıfırla
const ColorRow: React.FC<{ label: string; value: string; onChange: (c: string) => void }> = ({ label, value, onChange }) => (
  <div className="space-y-1.5">
    <span className="text-[11px] text-text-muted font-semibold">{label}</span>
    <div className="flex flex-wrap items-center gap-1.5">
      {PROFILE_SWATCHES.map(c => (
        <button key={c} type="button" onClick={() => onChange(c)} title={c} aria-label={`${label}: ${c}`}
          className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${value.toLowerCase() === c ? 'ring-2 ring-white ring-offset-2 ring-offset-bg-surface scale-110' : ''}`}
          style={{ background: c }} />
      ))}
      <label title="Özel renk" className="relative w-6 h-6 rounded-full cursor-pointer overflow-hidden border border-dashed border-white/30 hover:border-white/60 flex items-center justify-center"
        style={value && !PROFILE_SWATCHES.includes(value.toLowerCase()) ? { background: value, borderStyle: 'solid' } : undefined}>
        <Palette size={12} className="text-white/70 pointer-events-none" />
        <input type="color" value={value || '#2563eb'} onChange={e => onChange(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" aria-label={`${label}: özel renk`} />
      </label>
      {value && (
        <button type="button" onClick={() => onChange('')} title="Varsayılana dön"
          className="w-6 h-6 rounded-full flex items-center justify-center text-text-muted hover:text-text-main hover:bg-white/10 transition-colors">
          <RotateCcw size={12} />
        </button>
      )}
    </div>
  </div>
);

interface ProfileModalProps {
  isOpen: boolean;
  userId: string;
  onClose: () => void;
  currentUsername: string;
  currentFirstName: string;
  currentLastName: string;
  currentAvatarId: string;
  onSave: (data: ProfileSaveData) => Promise<void>;
}

const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  userId,
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
  const [bannerColor, setBannerColor] = useState('');
  const [accentColor, setAccentColor] = useState('');
  const [bio, setBio] = useState('');
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

  // Banner/vurgu/hakkımda sunucuda tutulur; modal her açıldığında taze okunur
  useEffect(() => {
    if (!isOpen || !userId) return;
    let alive = true;
    invalidateUserProfile(userId);
    fetchUserProfile(userId).then(p => {
      if (!alive || !p) return;
      setBannerColor(p.bannerColor || '');
      setAccentColor(p.accentColor || '');
      setBio(p.bio || '');
    });
    return () => { alive = false; };
  }, [isOpen, userId]);

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
    // Bazı klavyeler "İ", "Ş" gibi harfleri harf + birleşik işaret olarak yollar;
    // tek karaktere indir ki doğrulama ve benzersizlik kontrolü tutarlı olsun.
    const name = username.normalize('NFC');
    if (!name.trim()) {
      setError('Kullanıcı adı boş olamaz.');
      return;
    }
    if (name.includes(' ')) {
      setError('Kullanıcı adı boşluk içeremez.');
      return;
    }
    // \p{L}: Türkçe dahil tüm dillerdeki harfler (ğ, ü, ş, ı, ö, ç, İ ...)
    if (!/^[\p{L}\p{N}_.-]+$/u.test(name)) {
      setError('Kullanıcı adı sadece harf, rakam, nokta, tire ve alt çizgi içerebilir.');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      await onSave({ username: name, firstName, lastName, avatarId, bannerColor, accentColor, bio: bio.trim() });
      invalidateUserProfile(userId);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Bir hata oluştu.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
      <motion.div
        key="ProfileModal"
        {...overlayMotion}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      >
        <motion.div
          {...modalMotion}
          className="relative w-full max-w-2xl max-h-[calc(100dvh-2rem)] bg-bg-surface border border-panel-line rounded-3xl overflow-y-auto custom-scrollbar shadow-2xl flex flex-col md:flex-row"
        >
          {/* Sol Panel: Form ve Seçim */}
          <div className="flex-1 p-4 sm:p-6 border-b md:border-b-0 md:border-r border-panel-line">
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
                    className="w-full bg-bg-base border border-panel-line rounded-xl px-4 py-2.5 text-text-main outline-none focus:border-primary-main transition-colors text-sm"
                    placeholder="Adınız"
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <label className="text-xs text-text-muted uppercase tracking-wider font-semibold">Soyad</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full bg-bg-base border border-panel-line rounded-xl px-4 py-2.5 text-text-main outline-none focus:border-primary-main transition-colors text-sm"
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
                    maxLength={32}
                    className="w-full bg-bg-base border border-panel-line rounded-xl pl-9 pr-4 py-2.5 text-text-main outline-none focus:border-primary-main transition-colors text-sm"
                    placeholder="Kullanıcı adınız"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-baseline justify-between">
                  <label className="text-xs text-text-muted uppercase tracking-wider font-semibold">Hakkımda</label>
                  <span className={`text-[10px] tabular-nums ${bio.length > MAX_BIO_LENGTH - 20 ? 'text-amber-400' : 'text-text-muted'}`}>{bio.length}/{MAX_BIO_LENGTH}</span>
                </div>
                <textarea
                  value={bio}
                  maxLength={MAX_BIO_LENGTH}
                  rows={2}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full resize-none bg-bg-base border border-panel-line rounded-xl px-4 py-2.5 text-text-main outline-none focus:border-primary-main transition-colors text-sm"
                  placeholder="Kendinden kısaca bahset..."
                />
              </div>

              <div className="space-y-3 p-3 rounded-2xl bg-bg-base/60 border border-panel-line">
                <label className="text-xs text-text-muted uppercase tracking-wider font-semibold flex items-center gap-1.5"><Palette size={13} /> Profil Renkleri</label>
                <ColorRow label="Banner" value={bannerColor} onChange={setBannerColor} />
                <ColorRow label="Vurgu" value={accentColor} onChange={setAccentColor} />
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
                      : 'border-2 border-dashed border-panel-line hover:border-primary-main/50 hover:scale-[1.02]'
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
          <div className="w-full md:w-80 bg-[var(--profile-aside,#0B1020)] p-4 sm:p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] flex flex-col items-center justify-center relative shrink-0">
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

            {/* Profil Kartı Önizlemesi */}
            <div className="w-full rounded-2xl overflow-hidden border border-panel-line bg-panel-deep">
              <div className="h-16 transition-[background] duration-500" style={{ background: bannerBackground(bannerColor) }} />
              <div className="px-4 pb-4 -mt-7">
                <div className="w-14 h-14 rounded-full border-4 border-panel-deep overflow-hidden flex items-center justify-center text-2xl bg-bg-base transition-shadow duration-300"
                  style={{ boxShadow: `0 0 0 2px ${accentColor || 'var(--accent)'}` }}>
                  {renderAvatar(avatarId)}
                </div>
                <div className="mt-2 text-sm font-bold text-text-main truncate">{debouncedUsername || 'kullanici_adi'}</div>
                {(debouncedFirstName || debouncedLastName) && (
                  <div className="text-[11px] text-text-muted truncate">{`${debouncedFirstName} ${debouncedLastName}`.trim()}</div>
                )}
                {bio.trim() && (
                  <p className="mt-2 text-[12px] leading-snug text-text-main/80 whitespace-pre-wrap break-words line-clamp-3">{bio}</p>
                )}
                <WeeklyBadges userId={userId} />
                <div className="mt-3 h-1 rounded-full" style={{ background: accentColor || 'var(--accent)' }} />
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
      )}
    </AnimatePresence>
  );
};

export default ProfileModal;
