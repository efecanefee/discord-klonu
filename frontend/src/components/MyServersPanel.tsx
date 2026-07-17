import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Server, Lock, ChevronRight, Compass } from 'lucide-react';
import { roomApi, type MyRoomDto } from '../services/roomApi';
import { roleLabel } from '../utils/roles';

interface MyServersPanelProps {
  refreshSignal?: number;                 // değişince listeyi tazeler
  onSelectRoom: (room: MyRoomDto) => void;
}

const roleStyle = (role: string) => {
  if (role === 'owner') return { color: '#F59E0B', glow: 'rgba(245,158,11,0.35)', badge: '👑' };
  if (role === 'moderator') return { color: '#3B82F6', glow: 'rgba(59,130,246,0.35)', badge: '🛡️' };
  return { color: 'var(--color-primary-main)', glow: 'rgba(var(--accent-rgb),0.30)', badge: '' };
};

const MyServersPanel: React.FC<MyServersPanelProps> = ({ refreshSignal, onSelectRoom }) => {
  const [rooms, setRooms] = useState<MyRoomDto[] | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    roomApi.getMyRooms().then(r => { if (alive) setRooms(r); }).catch(() => { if (alive) setRooms([]); });
    return () => { alive = false; };
  }, [refreshSignal]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35, type: 'spring', stiffness: 260, damping: 28 }}
      className="hidden md:block md:static md:flex-1 z-40 w-[280px] max-h-[calc(100vh-40px)] overflow-hidden"
    >
      {/* üst gradient çizgi */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-primary-main/40 to-transparent" />

      <div className="p-5 max-h-[calc(100vh-40px)] overflow-y-auto custom-scrollbar">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(var(--accent-rgb),0.15)', border: '1px solid rgba(var(--accent-rgb),0.3)' }}>
              <Server size={16} className="text-primary-main" />
            </div>
            <div>
              <h3 className="text-[14px] font-bold text-white leading-none">Sunucularım</h3>
              <span className="text-[11px] text-white/35">Katıldığın odalar</span>
            </div>
          </div>
          {rooms && rooms.length > 0 && (
            <span className="text-[11px] font-semibold text-white/50 bg-white/5 border border-white/10 px-2 py-0.5 rounded-lg">{rooms.length}</span>
          )}
        </div>

        {/* Yükleniyor iskeleti */}
        {rooms === null && (
          <div className="space-y-2.5">
            {[0, 1, 2].map(i => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/[0.05] animate-pulse">
                <div className="w-10 h-10 rounded-xl bg-white/10" />
                <div className="flex-1 space-y-2">
                  <div className="h-2.5 w-24 rounded bg-white/10" />
                  <div className="h-2 w-16 rounded bg-white/[0.07]" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Boş durum */}
        {rooms !== null && rooms.length === 0 && (
          <div className="flex flex-col items-center text-center gap-3 py-8 px-2">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(var(--accent-rgb),0.1)', border: '1px solid rgba(var(--accent-rgb),0.2)' }}>
              <Compass size={26} className="text-primary-main/80" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-white/80">Henüz bir sunucuda değilsin</p>
              <p className="text-[11px] text-white/35 mt-1 leading-relaxed">Bir topluluk odasına katıl ya da kendi odanı oluştur — burada görünür.</p>
            </div>
          </div>
        )}

        {/* Liste */}
        <div className="space-y-2">
          <AnimatePresence>
            {rooms?.map((room, i) => {
              const rs = roleStyle(room.role);
              const isHover = hovered === room.id;
              return (
                <motion.button
                  key={room.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ delay: 0.03 * i, type: 'spring', stiffness: 320, damping: 26 }}
                  whileHover={{ scale: 1.02, x: 2 }}
                  whileTap={{ scale: 0.98 }}
                  onMouseEnter={() => setHovered(room.id)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => onSelectRoom(room)}
                  className="group w-full flex items-center gap-3 p-2.5 rounded-2xl text-left relative overflow-hidden transition-colors"
                  style={{
                    background: isHover ? `${rs.color}12` : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${isHover ? `${rs.color}45` : 'rgba(255,255,255,0.06)'}`,
                    boxShadow: isHover ? `0 8px 28px ${rs.glow}` : 'none',
                  }}
                >
                  {/* Sunucu simgesi — baş harf, role rengiyle */}
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold text-[15px] text-white"
                    style={{ background: `linear-gradient(135deg, ${rs.color} 0%, ${rs.color}99 100%)`, boxShadow: isHover ? `0 0 16px ${rs.glow}` : 'none' }}>
                    {room.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-white flex items-center gap-1 truncate">
                      {room.name}
                      {room.isPrivate && <Lock size={10} className="text-white/40 shrink-0" />}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      {rs.badge && <span className="text-[10px]">{rs.badge}</span>}
                      <span className="text-[11px] font-medium" style={{ color: rs.color }}>{roleLabel(room.role)}</span>
                    </div>
                  </div>
                  <motion.div animate={{ x: isHover ? 2 : 0 }}>
                    <ChevronRight size={16} style={{ color: isHover ? rs.color : 'rgba(255,255,255,0.2)' }} />
                  </motion.div>
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
};

export default MyServersPanel;
