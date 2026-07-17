import React, { memo, useEffect, useRef, useState } from 'react';
import { ChevronRight, Hash, Lock, Music, Trash2, Users, Volume2 } from 'lucide-react';

// App'teki RoomData'nin kartin ihtiyac duydugu kesiti — App'e tip bagimliligi
// kurmamak icin yapisal tanim.
export interface RoomCardData {
  id: number;
  name: string;
  type: string;
  description?: string;
  createdBy: string;
  isPrivate?: boolean;
}

interface RoomCardProps {
  room: RoomCardData;
  isOwner: boolean;
  showMeta?: boolean;
  apiBaseUrl: string;
  onJoin: (room: RoomCardData) => void;
  onDelete: (room: RoomCardData) => void;
}

const getRoomVisuals = (room: RoomCardData) => {
  if (room.type === 'voice') {
    return { icon: Volume2, color: '#10b981', glow: 'rgba(16,185,129,0.3)', sub: room.description || 'Sesli Sohbet' };
  }
  if (room.name === 'Ana Salon') {
    return { icon: Users, color: 'var(--color-primary-main)', glow: 'rgba(var(--accent-rgb),0.3)', sub: room.description || 'Sohbet Odası' };
  }
  if (room.name === 'Müzik Odası') {
    return { icon: Music, color: '#10b981', glow: 'rgba(16,185,129,0.3)', sub: room.description || 'Dinleme Odası' };
  }
  return { icon: Hash, color: '#3B82F6', glow: 'rgba(59,130,246,0.3)', sub: room.description || 'Yazı Kanalı' };
};

// Hover gorselleri tamamen CSS'te (index.css: .room-card). Buradaki tek state,
// uzerine gelince odadaki kullanicilari gosteren liste — o da yalnizca bu
// karti yeniden render eder, App'e dokunmaz.
const RoomCard = memo(function RoomCard({ room, isOwner, showMeta = false, apiBaseUrl, onJoin, onDelete }: RoomCardProps) {
  const [users, setUsers] = useState<{ username: string }[]>([]);
  const hoverTimer = useRef<number | null>(null);

  const handleEnter = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/api/rooms/${room.name}/users`);
        if (res.ok) setUsers(await res.json());
      } catch {
        // Liste yuklenemezse kart sessizce kullanicisiz kalir.
      }
    }, 350);
  };

  const handleLeave = () => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    setUsers(prev => (prev.length ? [] : prev));
  };

  useEffect(() => () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  }, []);

  const visuals = getRoomVisuals(room);
  const RoomIcon = visuals.icon;

  return (
    <button
      onClick={() => onJoin(room)}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      className="room-card group w-full flex items-center justify-between p-4 rounded-2xl cursor-pointer text-left relative mb-3"
      style={{ '--rc': visuals.color, '--rc-glow': visuals.glow } as React.CSSProperties}
    >
      <div className="room-card-shadow" aria-hidden />
      <div className="room-card-glow" aria-hidden />

      <div className="relative flex items-center gap-4 min-w-0">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: `color-mix(in srgb, ${visuals.color} 10%, transparent)`,
            border: `1px solid color-mix(in srgb, ${visuals.color} 20%, transparent)`,
          }}>
          <RoomIcon size={18} style={{ color: visuals.color }} />
        </div>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-white flex items-center gap-1.5 truncate">
            {room.name}
            {room.isPrivate && <Lock size={12} className="text-white/40 flex-shrink-0" />}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/70" />
            <span className="text-[12px] truncate" style={{ color: 'rgba(255,255,255,0.3)' }}>{visuals.sub}</span>
          </div>
          {showMeta && room.createdBy && room.createdBy !== 'system' && (
            <div className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.25)' }}>
              Kurucu: {room.createdBy}
            </div>
          )}
          {/* Odadakiler — grid-rows 0fr→1fr: küçük alanda ucuz, akıcı açılma */}
          <div className={`grid transition-[grid-template-rows,margin-top,opacity] duration-200 ease-out ${users.length > 0 ? 'grid-rows-[1fr] mt-2 opacity-100' : 'grid-rows-[0fr] mt-0 opacity-0'}`}>
            <div className="overflow-hidden flex flex-wrap gap-1 text-xs">
              {users.map((u, i) => (
                <span key={i} className="bg-white/10 px-2 py-0.5 rounded text-white/80">{u.username}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="relative flex items-center gap-1 flex-shrink-0">
        {isOwner && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onDelete(room); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onDelete(room); } }}
            title="Odayı sil"
            className="p-2 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
          >
            <Trash2 size={15} />
          </span>
        )}
        <ChevronRight size={18} className="room-card-chevron" />
      </div>
    </button>
  );
});

export default RoomCard;
