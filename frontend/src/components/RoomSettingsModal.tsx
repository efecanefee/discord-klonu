import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Ban, Loader2, Check } from 'lucide-react';
import { renderAvatar } from '../constants/avatars';
import { roomApi, type RoomBanDto } from '../services/roomApi';

interface RoomSettingsModalProps {
  roomDbId: number;
  roomName: string;
  initialDescription?: string;
  onClose: () => void;
  onDescriptionSaved?: (description: string) => void;
}

const RoomSettingsModal: React.FC<RoomSettingsModalProps> = ({
  roomDbId, roomName, initialDescription = '', onClose, onDescriptionSaved,
}) => {
  const [description, setDescription] = useState(initialDescription);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [bans, setBans] = useState<RoomBanDto[]>([]);
  const [loadingBans, setLoadingBans] = useState(true);
  const [unbanning, setUnbanning] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    roomApi.getBans(roomDbId).then((b) => { if (alive) { setBans(b); setLoadingBans(false); } });
    return () => { alive = false; };
  }, [roomDbId]);

  const saveDescription = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await roomApi.updateRoom(roomDbId, description.trim());
      onDescriptionSaved?.(description.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  const unban = async (userId: string) => {
    setUnbanning(userId);
    try {
      await roomApi.unban(roomDbId, userId);
      setBans((prev) => prev.filter((b) => b.userId !== userId));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'İşlem başarısız.');
    } finally {
      setUnbanning(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: '#0f0f12', border: '1px solid #27272a' }}
      >
        {/* Başlık */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <h2 className="text-white font-bold text-[16px]">Oda Ayarları</h2>
            <p className="text-white/40 text-[12px] mt-0.5">{roomName}</p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {/* Açıklama */}
          <div>
            <label className="text-[12px] font-semibold uppercase tracking-wider text-white/40">Açıklama</label>
            <textarea
              value={description}
              maxLength={200}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Oda hakkında kısa bir açıklama..."
              className="mt-2 w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-white/25 outline-none focus:border-[#7C3AED]/50 transition-colors resize-none"
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-[11px] text-white/30">{description.length}/200</span>
              <button
                onClick={saveDescription}
                disabled={saving || description.trim() === initialDescription.trim()}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #8B5CF6 100%)' }}
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : null}
                {saved ? 'Kaydedildi' : 'Kaydet'}
              </button>
            </div>
            <p className="text-[11px] text-white/25 mt-1">Oda adı değiştirilemez (mesaj geçmişine bağlıdır).</p>
          </div>

          {/* Yasaklılar */}
          <div>
            <label className="text-[12px] font-semibold uppercase tracking-wider text-white/40 flex items-center gap-1.5">
              <Ban size={13} /> Yasaklılar {!loadingBans && `(${bans.length})`}
            </label>
            <div className="mt-2 space-y-1.5">
              {loadingBans ? (
                <div className="text-center py-4 text-white/30 text-[12px] flex items-center justify-center gap-2">
                  <Loader2 size={14} className="animate-spin" /> Yükleniyor...
                </div>
              ) : bans.length === 0 ? (
                <div className="text-center py-4 text-white/25 text-[12px]">Yasaklı kullanıcı yok.</div>
              ) : (
                bans.map((b) => (
                  <div key={b.userId} className="flex items-center gap-2.5 p-2 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <div className="w-8 h-8 rounded-full bg-[#18181b] flex items-center justify-center text-lg overflow-hidden flex-shrink-0">
                      {renderAvatar(b.avatarId || 'default')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-white text-[13px] font-medium truncate">{b.username}</div>
                      {b.reason && <div className="text-white/30 text-[11px] truncate">{b.reason}</div>}
                    </div>
                    <button
                      onClick={() => unban(b.userId)}
                      disabled={unbanning === b.userId}
                      className="px-2.5 py-1 rounded-lg text-[12px] font-medium text-emerald-300 hover:bg-emerald-500/10 transition-colors disabled:opacity-40"
                    >
                      {unbanning === b.userId ? <Loader2 size={13} className="animate-spin" /> : 'Yasağı Kaldır'}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default RoomSettingsModal;
