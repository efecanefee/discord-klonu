import React from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, Pencil } from 'lucide-react';
import { getAvatarEmoji } from '../constants/avatars';

export interface PopoverUser {
  userId?: string;
  username: string;
  avatarId?: string;
  customStatus?: string;
}

interface UserPopoverCardProps {
  user: PopoverUser;
  isSelf: boolean;
  onSendMessage: () => void;
  onEditProfile: () => void;
}

const statusInfo = (s?: string) => {
  switch (s) {
    case 'idle': return { color: 'bg-yellow-400', label: 'Uzakta' };
    case 'dnd': return { color: 'bg-red-500', label: 'Rahatsız Etmeyin' };
    case 'offline':
    case 'invisible': return { color: 'bg-gray-500', label: 'Çevrimdışı' };
    default: return { color: 'bg-emerald-500', label: 'Çevrimiçi' };
  }
};

const UserPopoverCard: React.FC<UserPopoverCardProps> = ({ user, isSelf, onSendMessage, onEditProfile }) => {
  const st = statusInfo(user.customStatus);
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.15 }}
      onClick={(e) => e.stopPropagation()}
      className="w-56 rounded-2xl overflow-hidden shadow-2xl"
      style={{ background: '#09090b', border: '1px solid #334155' }}
    >
      {/* Üst banner */}
      <div className="h-12 bg-gradient-to-r from-[#7C3AED]/40 to-[#8B5CF6]/20" />
      <div className="px-4 pb-4 -mt-6">
        <div className="w-14 h-14 rounded-full bg-[#18181b] border-4 border-[#09090b] flex items-center justify-center text-2xl overflow-hidden">
          {getAvatarEmoji(user.avatarId || 'default')}
        </div>
        <div className="mt-2">
          <div className="text-white font-bold text-[15px] truncate">{user.username}</div>
          <div className="flex items-center gap-1.5 mt-1">
            <div className={`w-2 h-2 rounded-full ${st.color}`} />
            <span className="text-[11px] text-white/50">{isSelf ? 'Sen' : st.label}</span>
          </div>
        </div>

        <div className="mt-3 h-px bg-white/10" />

        {isSelf ? (
          <button
            onClick={onEditProfile}
            className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 hover:text-white text-sm font-semibold transition-colors"
          >
            <Pencil size={14} /> Profili Düzenle
          </button>
        ) : (
          <button
            onClick={onSendMessage}
            disabled={!user.userId}
            className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #8B5CF6 100%)' }}
          >
            <MessageSquare size={14} /> Mesaj Gönder
          </button>
        )}
      </div>
    </motion.div>
  );
};

export default UserPopoverCard;
