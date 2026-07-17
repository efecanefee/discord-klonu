import React from 'react';
import { motion } from 'framer-motion';
import { Plus, Settings, LogOut } from 'lucide-react';
import { renderAvatar } from '../constants/avatars';
import type { UserData as ModalUserData } from './NewMessageModal';

interface MiniDockProps {
  avatarId: string;
  myCustomStatus: string;
  activeDMs: ModalUserData[];
  unreadCounts: Record<string, number>;
  activeDMUserId?: string | null;
  onLogoClick: () => void;
  onSelectDM: (user: ModalUserData) => void;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
  onNewMessage: () => void;
}

const statusColor = (s?: string) =>
  s === 'online' ? 'bg-green-500' : s === 'idle' ? 'bg-yellow-500' : s === 'dnd' ? 'bg-red-500' : 'bg-gray-500';

const MiniDock: React.FC<MiniDockProps> = ({
  avatarId,
  myCustomStatus,
  activeDMs,
  unreadCounts,
  activeDMUserId,
  onLogoClick,
  onSelectDM,
  onOpenProfile,
  onOpenSettings,
  onNewMessage,
}) => {
  return (
    <div className="flex flex-col items-center gap-2 w-[72px] shrink-0 h-full bg-[#09090b] border-r border-white/10 py-3 z-40">
      {/* Logo → Lobiye dön */}
      <button
        onClick={onLogoClick}
        title="Lobiye dön"
        className="group relative w-11 h-11 rounded-2xl overflow-hidden border border-white/10 hover:border-[#7C3AED]/50 hover:shadow-[0_0_16px_rgba(124,58,237,0.4)] transition-all shrink-0"
      >
        <img src="/logo.png" alt="Lobi" className="w-full h-full object-cover group-hover:brightness-110 transition-all" />
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity">
          <LogOut size={16} className="text-white" />
        </div>
      </button>

      <div className="w-8 h-px bg-white/10 my-1 shrink-0" />

      {/* Aktif DM avatarları */}
      <div className="flex-1 flex flex-col items-center gap-2 overflow-y-auto scrollbar-hide w-full px-1 min-h-0">
        {activeDMs.map((user) => {
          const isActive = activeDMUserId === user.id;
          const unread = unreadCounts[user.id] || 0;
          return (
            <button
              key={user.id}
              onClick={() => onSelectDM(user)}
              title={user.username}
              className="relative group shrink-0"
            >
              {/* Aktif göstergesi (sol çubuk) */}
              <div className={`absolute -left-2 top-1/2 -translate-y-1/2 w-1 rounded-r-full bg-[#7C3AED] transition-all duration-200 ${isActive ? 'h-7' : 'h-0 group-hover:h-4'}`} />
              <div className={`relative w-11 h-11 rounded-full overflow-hidden flex items-center justify-center text-lg bg-[#18181b] border-2 transition-all ${isActive ? 'border-[#7C3AED] shadow-[0_0_12px_rgba(124,58,237,0.4)]' : 'border-[#334155] group-hover:border-[#7C3AED]/50'}`}>
                {renderAvatar(user.avatarId)}
              </div>
              <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#09090b] ${statusColor(user.customStatus)}`} />
              {unread > 0 && (
                <div className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-[0_0_8px_rgba(239,68,68,0.6)] animate-pulse">
                  {unread > 9 ? '9+' : unread}
                </div>
              )}
            </button>
          );
        })}

        {/* Yeni mesaj */}
        <button
          onClick={onNewMessage}
          title="Yeni Mesaj"
          className="w-11 h-11 rounded-full flex items-center justify-center bg-[#7C3AED]/10 text-[#7C3AED] hover:bg-[#7C3AED] hover:text-white border border-[#7C3AED]/30 transition-all shrink-0"
        >
          <Plus size={18} />
        </button>
      </div>

      <div className="w-8 h-px bg-white/10 my-1 shrink-0" />

      {/* Ayarlar */}
      <button
        onClick={onOpenSettings}
        title="Ayarlar"
        className="w-10 h-10 rounded-xl flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors shrink-0"
      >
        <Settings size={19} />
      </button>

      {/* Kendi avatarın → Profil */}
      <button
        onClick={onOpenProfile}
        title="Profili Düzenle"
        className="relative group shrink-0"
      >
        <div className="w-11 h-11 rounded-full overflow-hidden border border-[#7C3AED] bg-[#18181b] flex items-center justify-center text-lg group-hover:opacity-80 transition-opacity">
          {renderAvatar(avatarId)}
        </div>
        <motion.div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 border-2 border-[#09090b] rounded-full ${statusColor(myCustomStatus)}`} />
      </button>
    </div>
  );
};

export default MiniDock;
