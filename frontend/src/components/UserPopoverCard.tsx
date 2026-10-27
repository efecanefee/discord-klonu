import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { popoverMotion } from '../utils/motion';
import { MessageSquare, Pencil, Shield, ShieldOff, LogOut, Ban, Gamepad2, ShieldCheck } from 'lucide-react';
import { useChatPrefs, blockUser, unblockUser } from '../utils/chatPrefs';
import { useUserProfile, bannerBackground } from '../utils/userProfile';
import { parseGameStatus } from '../utils/activity';
import { renderAvatar } from '../constants/avatars';
import AvatarLightbox from './AvatarLightbox';
import WeeklyBadges from './WeeklyBadges';

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
  if (role === 'moderator') return { icon: '🛡️', label: 'Moderatör', color: 'var(--accent-light)' };
  return null;
};

const rank = (role?: string) => (role === 'owner' ? 2 : role === 'moderator' ? 1 : role === 'member' ? 0 : -1);

const UserPopoverCard: React.FC<UserPopoverCardProps> = ({
  user, isSelf, onSendMessage, onEditProfile, viewerRole, onSetModerator, onKick, onBan,
}) => {
  const [showAvatar, setShowAvatar] = useState(false);
  const chatPrefs = useChatPrefs();
  const iBlocked = !!user.userId && chatPrefs.blocked.some(b => b.id === user.userId);
  const [blockBusy, setBlockBusy] = useState(false);
  const toggleBlock = async () => {
    if (!user.userId) return;
    if (!iBlocked && !window.confirm(`${user.username} engellensin mi?\n\nSana mesaj gönderemez, odalardaki mesajları gizlenir.`)) return;
    setBlockBusy(true);
    if (iBlocked) await unblockUser(user.userId);
    else await blockUser({ id: user.userId, username: user.username, avatarId: user.avatarId });
    setBlockBusy(false);
  };
  // Banner, vurgu rengi, hakkımda ve durum mesajı sunucudan (önbellekli) okunur
  const profile = useUserProfile(user.userId);
  const st = statusInfo(profile?.customStatus ?? user.customStatus);
  const accent = profile?.accentColor || null;
  const statusMessage = profile?.customStatusMessage?.trim() || '';
  const game = parseGameStatus(statusMessage);
  const badge = roleBadge(user.role);

  // Yönetim yetkisi (backend hiyerarşisinin aynası)
  const viewerRank = rank(viewerRole);
  const targetRank = rank(user.role);
  const canModerate = !isSelf && viewerRank >= 1 && viewerRank > targetRank;
  const canSetModerator = !isSelf && viewerRole === 'owner' && user.role !== 'owner';
  const showManagement = canModerate || canSetModerator;

  return (
    <motion.div
      {...popoverMotion}
      onClick={(e) => e.stopPropagation()}
      className="w-56 rounded-2xl overflow-hidden shadow-2xl"
      style={{ background: 'var(--panel-deep)', border: '1px solid var(--panel-line)' }}
    >
      {/* Üst banner */}
      <div className="h-14 transition-[background] duration-500" style={{ background: bannerBackground(profile?.bannerColor) }} />
      <div className="px-4 pb-4 -mt-6">
        <button
          onClick={() => setShowAvatar(true)}
          title="Fotoğrafı büyüt"
          aria-label="Profil fotoğrafını büyüt"
          className="w-14 h-14 rounded-full bg-panel-raised border-4 border-panel-deep flex items-center justify-center text-2xl overflow-hidden cursor-zoom-in hover:brightness-110 transition-all"
          style={accent ? { boxShadow: `0 0 0 2px ${accent}` } : undefined}
        >
          {renderAvatar(user.avatarId || 'default')}
        </button>
        <AnimatePresence>
          {showAvatar && (
            <AvatarLightbox avatarId={user.avatarId || 'default'} username={user.username} onClose={() => setShowAvatar(false)} />
          )}
        </AnimatePresence>
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

        {(game || statusMessage) && (
          <div className="mt-2.5 flex items-center gap-1.5 rounded-lg px-2 py-1.5 bg-white/[0.04] text-[12px] text-white/80">
            {game ? (
              <><Gamepad2 size={13} className="shrink-0" style={{ color: accent || 'var(--accent-light)' }} /><span className="truncate">Oyunda · <span className="font-semibold text-white">{game}</span></span></>
            ) : (
              <span className="truncate">{statusMessage}</span>
            )}
          </div>
        )}

        <WeeklyBadges userId={user.userId} />

        {profile?.bio && (
          <div className="mt-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/40">Hakkımda</div>
            <p className="mt-0.5 text-[12px] leading-snug text-white/80 whitespace-pre-wrap break-words line-clamp-4">{profile.bio}</p>
          </div>
        )}

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
            style={{ background: accent ? `linear-gradient(135deg, ${accent} 0%, ${accent}cc 100%)` : 'linear-gradient(135deg, var(--color-primary-main) 0%, var(--accent-fill-end) 100%)' }}
          >
            <MessageSquare size={14} /> Mesaj Gönder
          </button>
        )}
        {!isSelf && user.userId && (
          <button
            onClick={toggleBlock}
            disabled={blockBusy}
            className={`mt-1.5 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors disabled:opacity-50 ${iBlocked ? 'text-emerald-300 hover:bg-emerald-500/10' : 'text-white/45 hover:text-red-400 hover:bg-red-500/10'}`}
          >
            {iBlocked ? <><ShieldCheck size={13} /> Engeli Kaldır</> : <><Ban size={13} /> Engelle</>}
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
