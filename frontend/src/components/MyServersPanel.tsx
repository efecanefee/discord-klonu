import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Server, Lock, ChevronRight, ChevronDown, Compass } from 'lucide-react';
import { roomApi, type MyRoomDto } from '../services/roomApi';
import { roleLabel } from '../utils/roles';

interface MyServersPanelProps {
  open: boolean;                          // panel acik mi (state App'te: sarmalayici boyutu da ona gore degisiyor)
  onToggle: () => void;
  refreshSignal?: number;                 // degisince listeyi tazeler (yalnizca panel acikken)
  onSelectRoom: (room: MyRoomDto) => void;
}

const roleStyle = (role: string) => {
  if (role === 'owner') return { color: '#F59E0B', glow: 'rgba(245,158,11,0.35)', badge: '👑' };
  if (role === 'moderator') return { color: '#3B82F6', glow: 'rgba(59,130,246,0.35)', badge: '🛡️' };
  return { color: 'var(--color-primary-main)', glow: 'rgba(var(--accent-rgb),0.30)', badge: '' };
};

const MyServersPanel: React.FC<MyServersPanelProps> = ({ open, onToggle, refreshSignal, onSelectRoom }) => {
  const [rooms, setRooms] = useState<MyRoomDto[] | null>(null);
  // Tembel yukleme: liste ilk acilista (ve acikken refreshSignal degisince)
  // cekilir — lobi acilirken bosuna istek atilip render maliyeti odenmez.
  const loadedSignalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    if (loadedSignalRef.current === (refreshSignal ?? 0)) return;
    loadedSignalRef.current = refreshSignal ?? 0;
    let alive = true;
    roomApi.getMyRooms().then(r => { if (alive) setRooms(r); }).catch(() => { if (alive) setRooms([]); });
    return () => { alive = false; };
  }, [open, refreshSignal]);

  return (
    <div className="hidden md:flex flex-col min-h-0 w-full">
      {/* üst gradient çizgi */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-primary-main/40 to-transparent" />

      {/* Baslik — tiklaninca acilir/kapanir */}
      <button
        onClick={onToggle}
        className="flex items-center justify-between p-5 pb-4 w-full text-left cursor-pointer group shrink-0 hover:bg-white/[0.03] transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(var(--accent-rgb),0.15)', border: '1px solid rgba(var(--accent-rgb),0.3)' }}>
            <Server size={16} className="text-primary-main" />
          </div>
          <div>
            <h3 className="text-[14px] font-bold text-white leading-none">Sunucularım</h3>
            <span className="text-[11px] text-white/35">Katıldığın odalar</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {rooms && rooms.length > 0 && (
            <span className="text-[11px] font-semibold text-white/50 bg-white/5 border border-white/10 px-2 py-0.5 rounded-lg">{rooms.length}</span>
          )}
          <ChevronDown size={16} className={`text-white/40 group-hover:text-white/80 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Icerik yalnizca opacity/transform ile girer — yukseklik olcumu ve
          layout animasyonu yok. */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="server-list"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-5 pb-5"
          >
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

            {/* Liste — hover gorselleri tamamen CSS'te (.room-card), state yok */}
            <div className="space-y-2">
              {rooms?.map((room, i) => {
                const rs = roleStyle(room.role);
                return (
                  <motion.button
                    key={room.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(0.03 * i, 0.15), duration: 0.22, ease: 'easeOut' }}
                    onClick={() => onSelectRoom(room)}
                    className="room-card group w-full flex items-center gap-3 p-2.5 rounded-2xl text-left relative"
                    style={{ '--rc': rs.color, '--rc-glow': rs.glow } as React.CSSProperties}
                  >
                    <div className="room-card-shadow" aria-hidden />
                    <div className="room-card-glow" aria-hidden />
                    {/* Sunucu simgesi — baş harf, role rengiyle */}
                    <div className="relative w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold text-[15px] text-white"
                      style={{ background: `linear-gradient(135deg, ${rs.color} 0%, ${rs.color}99 100%)` }}>
                      {room.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="relative min-w-0 flex-1">
                      <div className="text-[13px] font-semibold text-white flex items-center gap-1 truncate">
                        {room.name}
                        {room.isPrivate && <Lock size={10} className="text-white/40 shrink-0" />}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        {rs.badge && <span className="text-[10px]">{rs.badge}</span>}
                        <span className="text-[11px] font-medium" style={{ color: rs.color }}>{roleLabel(room.role)}</span>
                      </div>
                    </div>
                    <ChevronRight size={16} className="room-card-chevron relative" />
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MyServersPanel;
