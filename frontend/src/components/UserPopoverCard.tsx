import React from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, Pencil, Shield, ShieldOff, LogOut, Ban } from 'lucide-react';
import { renderAvatar } from '../constants/avatars';

export interface PopoverUser {
  userId?: string;
  username: string;
  avatarId?: string;
  customStatus?: string;
  role?: string; // "owner" | "moderator" | "member" | "" (sistem odası)
}

interface UserPopoverCardProps {
  user: PopoverUser;
  isSelf: boolean;
  onSendMessage: () => void;
  onEditProfile: () => void;
  viewerRole?: string;              // mevcut kullanıcının bu odadaki rolü
  onSetModerator?: (make: boolean) => void; // rol ata/al (sadece kurucu)
  onKick?: () => void;
  onBan?: () => void;
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

const roleBadge = (role?: string) => {
  if (role === 'owner') return { icon: '👑', label: 'Kurucu', color: '#F59E0B' };
  if (role === 'moderator') return { icon: '🛡️', label: 'Moderatör', color: '#3B82F6' };
  return null;
};

const rank = (role?: string) => (role === 'owner' ? 2 : role === 'moderator' ? 1 : role === 'member' ? 0 : -1);

const UserPopoverCard: React.FC<UserPopoverCardProps> = ({
  user, isSelf, onSendMessage, onEditProfile, viewerRole, onSetModerator, onKick, onBan,
}) => {
  const st = statusInfo(user.customStatus);
  const badge = roleBadge(user.role);

  // Yönetim yetkisi (backend hiyerarşisinin aynası)
  const viewerRank = rank(viewerRole);
  const targetRank = rank(user.role);
  const canModerate = !isSelf && viewerRank >= 1 && viewerRank > targetRank;
  const canSetModerator = !isSelf && viewerRole === 'owner' && user.role !== 'owner';
  const showManagement = canModerate || canSetModerator;

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
      <div className="h-12 bg-gradient-to-r from-primary-main/40 to-primary-main/20" />
      <div className="px-4 pb-4 -mt-6">
        <div className="w-14 h-14 rounded-full bg-[#18181b] border-4 border-[#09090b] flex items-center justify-center text-2xl overflow-hidden">
          {renderAvatar(user.avatarId || 'default')}
        </div>
        <div className="mt-2">
          <div className="text-white font-bold text-[15px] truncate flex items-center gap-1.5">
            {user.username}
            {badge && <span title={badge.label}>{badge.icon}</span>}
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <div className={`w-2 h-2 rounded-full ${st.color}`} />
            <span className="text-[11px] text-white/50">{isSelf ? 'Sen' : st.label}</span>
            {badge && <span className="text-[11px] font-semibold" style={{ color: badge.color }}>· {badge.label}</span>}
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
            style={{ background: 'linear-gradient(135deg, var(--color-primary-main) 0%, var(--accent-light) 100%)' }}
          >
            <MessageSquare size={14} /> Mesaj Gönder
          </button>
        )}

        {/* Yönetim bölümü — yalnızca yetkin varsa */}
        {showManagement && (
          <>
            <div className="mt-3 flex items-center gap-2">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-[9px] uppercase tracking-widest text-white/30">Yönetim</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>
            <div className="mt-2 space-y-1.5">
              {canSetModerator && (
                <button
                  onClick={() => onSetModerator?.(user.role !== 'moderator')}
                  className="w-full flex items-center gap-2 py-2 px-2.5 rounded-lg text-[13px] font-medium text-blue-300 hover:bg-blue-500/10 transition-colors"
                >
                  {user.role === 'moderator'
                    ? (<><ShieldOff size={14} /> Moderatörlüğü Al</>)
                    : (<><Shield size={14} /> Moderatör Yap</>)}
                </button>
              )}
              {canModerate && (
                <>
                  <button
                    onClick={onKick}
                    className="w-full flex items-center gap-2 py-2 px-2.5 rounded-lg text-[13px] font-medium text-amber-300 hover:bg-amber-500/10 transition-colors"
                  >
                    <LogOut size={14} /> Odadan At
                  </button>
                  <button
                    onClick={onBan}
                    className="w-full flex items-center gap-2 py-2 px-2.5 rounded-lg text-[13px] font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Ban size={14} /> Yasakla
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
};

export default UserPopoverCard;
