import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, PlusCircle, Trash2 } from 'lucide-react';
import signalrService from '../services/signalrService';

interface FeedRoom {
  id: number;
  name: string;
  createdBy: string;
  createdAt: string;
  isPrivate?: boolean;
}

interface ActivityFeedProps {
  rooms: FeedRoom[];
}

type FeedItem = {
  key: string;
  kind: 'created' | 'deleted';
  roomName: string;
  by?: string;
  at: number; // epoch ms
};

const MAX_ITEMS = 4;

const relTime = (at: number, now: number) => {
  const m = Math.floor(Math.max(0, now - at) / 60000);
  if (m < 1) return 'az önce';
  if (m < 60) return `${m} dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} sa önce`;
  return `${Math.floor(h / 24)} gün önce`;
};

// Son aktiviteler: gecmis, oda listesinin createdAt verisinden turetilir;
// canli olaylar SignalR'dan dinlenir (RoomCreated / RoomDeleted). Backend'e
// yeni bir sey eklemeden calisir. Yalnizca bu kucuk panel render olur.
const ActivityFeed = memo(function ActivityFeed({ rooms }: ActivityFeedProps) {
  const [liveItems, setLiveItems] = useState<FeedItem[]>([]);
  const [now, setNow] = useState(() => Date.now());

  // Silme olayinda oda adini cozebilmek icin guncel listenin ref'i
  const roomsRef = useRef(rooms);
  useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);

  // Goreli zaman etiketleri dakikada bir tazelenir
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onCreated = (room: FeedRoom) => {
      if (room.isPrivate) return; // gizli odalar akista gorunmez
      setLiveItems(prev => [
        { key: `c-${room.id}`, kind: 'created' as const, roomName: room.name, by: room.createdBy, at: Date.now() },
        ...prev.filter(i => i.key !== `c-${room.id}`),
      ].slice(0, MAX_ITEMS));
    };
    const onDeleted = (roomId: number) => {
      const name = roomsRef.current.find(r => r.id === roomId)?.name;
      if (!name) return; // adi bilinmeyen (ör. gizli) odayi duyurma
      setLiveItems(prev => [
        { key: `d-${roomId}-${Date.now()}`, kind: 'deleted' as const, roomName: name, at: Date.now() },
        ...prev.filter(i => i.key !== `c-${roomId}`), // kurulus kaydini dusur
      ].slice(0, MAX_ITEMS));
    };
    signalrService.onRoomCreated(onCreated);
    signalrService.onRoomDeleted(onDeleted);
    return () => {
      signalrService.offRoomCreated(onCreated);
      signalrService.offRoomDeleted(onDeleted);
    };
  }, []);

  // Gecmis: topluluk odalarinin kurulus kayitlari
  const seedItems = useMemo<FeedItem[]>(() =>
    rooms
      .filter(r => r.id > 0 && r.createdBy && r.createdBy !== 'system' && !r.isPrivate)
      .map(r => ({
        key: `c-${r.id}`,
        kind: 'created' as const,
        roomName: r.name,
        by: r.createdBy,
        at: Date.parse(r.createdAt) || 0,
      })),
    [rooms]
  );

  const items = useMemo(() => {
    const liveKeys = new Set(liveItems.map(i => i.key));
    return [...liveItems, ...seedItems.filter(s => !liveKeys.has(s.key))]
      .sort((a, b) => b.at - a.at)
      .slice(0, MAX_ITEMS);
  }, [liveItems, seedItems]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.3, ease: 'easeOut' }}
      className="relative shrink-0 p-4 bg-[rgba(20,20,26,0.55)] border border-white/10 rounded-[28px] shadow-[0_8px_32px_rgba(0,0,0,0.3)] backdrop-blur-[18px] overflow-hidden"
    >
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-primary-main/40 to-transparent" />

      <div className="flex items-center gap-2 mb-3 px-1">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(var(--accent-rgb),0.15)', border: '1px solid rgba(var(--accent-rgb),0.3)' }}>
          <Activity size={14} className="text-primary-main" />
        </div>
        <h3 className="text-[13px] font-bold text-white leading-none">Son Aktiviteler</h3>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-4 text-white/30 text-[11px]">Henüz aktivite yok.</div>
      ) : (
        <div className="space-y-1">
          <AnimatePresence initial={false}>
            {items.map(item => (
              <motion.div
                key={item.key}
                layout
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="flex items-start gap-2.5 px-1 py-1.5"
              >
                {item.kind === 'created' ? (
                  <PlusCircle size={14} className="text-emerald-400/80 mt-0.5 shrink-0" />
                ) : (
                  <Trash2 size={14} className="text-rose-400/70 mt-0.5 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] text-white/80 leading-snug truncate">
                    <span className="font-semibold text-white">{item.roomName}</span>
                    {item.kind === 'created' ? ' odası kuruldu' : ' odası silindi'}
                  </div>
                  <div className="text-[10px] text-white/35 mt-0.5 truncate">
                    {item.kind === 'created' && item.by ? `${item.by} · ` : ''}{relTime(item.at, now)}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
});

export default ActivityFeed;
