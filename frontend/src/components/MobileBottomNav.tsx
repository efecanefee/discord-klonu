import React from 'react';
import { motion } from 'framer-motion';
import { Home, MessageSquare, Plus, Settings } from 'lucide-react';
import { renderAvatar } from '../constants/avatars';
import { spring } from '../utils/motion';

export type MobileTab = 'rooms' | 'messages';

interface MobileBottomNavProps {
  activeTab: MobileTab;
  unreadCount: number;
  avatarId: string;
  statusColor: string; // tailwind bg-* sınıfı
  onRooms: () => void;
  onMessages: () => void;
  onCreateRoom: () => void;
  onProfile: () => void;
  onSettings: () => void;
}

// Mobil lobi alt menüsü: tek elle ulaşılan beş eylem. Aktif sekmenin
// arkasındaki hap layoutId ile sekmeler arasında kayar.
const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab, unreadCount, avatarId, statusColor, onRooms, onMessages, onCreateRoom, onProfile, onSettings,
}) => {
  const tab = (id: MobileTab, label: string, icon: React.ReactNode, onClick: () => void, badge?: number) => {
    const active = activeTab === id;
    return (
      <button onClick={onClick} aria-label={label} aria-current={active ? 'page' : undefined}
        className="relative flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 cursor-pointer">
        {active && (
          <motion.span layoutId="mobile-nav-pill" transition={spring.snappy}
            className="absolute inset-x-2 inset-y-0.5 rounded-2xl bg-primary-main/15 border border-primary-main/25" />
        )}
        <span className={`relative transition-colors ${active ? 'text-primary-main' : 'text-white/55'}`}>
          {icon}
          {!!badge && badge > 0 && (
            <span className="anim-pop absolute -top-1.5 -right-2.5 min-w-[17px] h-[17px] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold shadow-[0_0_8px_rgba(239,68,68,0.6)]">
              {badge > 99 ? '99+' : badge}
            </span>
          )}
        </span>
        <span className={`relative text-[10px] font-semibold transition-colors ${active ? 'text-white' : 'text-white/45'}`}>{label}</span>
      </button>
    );
  };

  return (
    <motion.nav
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ ...spring.smooth, delay: 0.2 }}
      className="md:hidden fixed bottom-0 inset-x-0 z-30 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 pointer-events-none"
      aria-label="Ana menü"
    >
      <div className="glass-panel !rounded-[22px] flex items-stretch px-1 py-1 pointer-events-auto">
        {tab('rooms', 'Odalar', <Home size={21} />, onRooms)}
        {tab('messages', 'Mesajlar', <MessageSquare size={21} />, onMessages, unreadCount)}

        <div className="flex-1 flex items-center justify-center">
          <motion.button whileTap={{ scale: 0.9 }} onClick={onCreateRoom} aria-label="Oda oluştur"
            className="w-12 h-12 -mt-5 rounded-2xl flex items-center justify-center text-white shadow-[0_8px_24px_-6px_rgba(var(--accent-rgb),0.7)] border border-white/15 cursor-pointer"
            style={{ background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-fill-end) 100%)' }}>
            <Plus size={24} />
          </motion.button>
        </div>

        <button onClick={onProfile} aria-label="Profil" className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 cursor-pointer">
          <span className="relative">
            <span className="block w-[22px] h-[22px] rounded-full overflow-hidden bg-panel-raised border border-white/20 text-xs flex items-center justify-center">
              {renderAvatar(avatarId)}
            </span>
            <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-bg-surface ${statusColor}`} />
          </span>
          <span className="text-[10px] font-semibold text-white/45">Profil</span>
        </button>
        <button onClick={onSettings} aria-label="Ayarlar" className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 cursor-pointer">
          <Settings size={21} className="text-white/55" />
          <span className="text-[10px] font-semibold text-white/45">Ayarlar</span>
        </button>
      </div>
    </motion.nav>
  );
};

export default MobileBottomNav;
