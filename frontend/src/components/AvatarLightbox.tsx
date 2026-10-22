import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { renderAvatar, isCustomAvatar } from '../constants/avatars';

interface AvatarLightboxProps {
  avatarId: string;
  username: string;
  onClose: () => void;
}

// Profil fotoğrafını tam ekran büyütür. Yüklenmiş fotoğraf kırpılmadan
// gösterilir; hazır avatarlar büyük daire içinde. Esc veya arka plan kapatır.
const AvatarLightbox: React.FC<AvatarLightboxProps> = ({ avatarId, username, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const custom = isCustomAvatar(avatarId);

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-4 p-4 bg-black/85 backdrop-blur-sm"
      onClick={(e) => { e.stopPropagation(); onClose(); }}
      role="dialog"
      aria-label={`${username} profil fotoğrafı`}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        aria-label="Kapat"
      >
        <X size={20} />
      </button>
      <motion.div
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        onClick={(e) => e.stopPropagation()}
      >
        {custom ? (
          <img
            src={avatarId.slice(4)}
            alt={`${username} profil fotoğrafı`}
            className="max-w-[min(90vw,640px)] max-h-[75vh] rounded-2xl object-contain shadow-2xl"
          />
        ) : (
          <div className="w-[min(70vw,320px)] h-[min(70vw,320px)] rounded-full overflow-hidden bg-[#18181b] flex items-center justify-center text-[120px] shadow-2xl">
            {renderAvatar(avatarId)}
          </div>
        )}
      </motion.div>
      <span className="text-white font-semibold text-base">{username}</span>
    </motion.div>,
    document.body
  );
};

export default AvatarLightbox;
