import React from 'react';
import { motion } from 'framer-motion';
import { spring } from '../utils/motion';
import { useUserBadges, BADGE_COLORS, formatBadgeValue, formatVoice, type BadgeHolder } from '../utils/weeklyBadges';

interface WeeklyBadgesProps {
  userId?: string;
  showStats?: boolean; // bu haftanın sayıları (ses süresi, mesaj)
}

const Chip: React.FC<{ badge: BadgeHolder; live?: boolean; index: number }> = ({ badge, live, index }) => {
  const color = BADGE_COLORS[badge.key];
  const tip = live
    ? `Bu hafta önde · ${badge.description} (${formatBadgeValue(badge.key, badge.value)})`
    : `Geçen hafta kazandı · ${badge.description} (${formatBadgeValue(badge.key, badge.value)})`;
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.8, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0, transition: { ...spring.bouncy, delay: index * 0.05 } }}
      title={tip}
      className={`relative inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[11px] font-semibold overflow-hidden ${live ? 'border border-dashed' : 'border'}`}
      style={live
        ? { color, borderColor: `${color}80`, background: `${color}0f` }
        : { color: '#fff', borderColor: `${color}66`, background: `linear-gradient(135deg, ${color}55 0%, ${color}22 100%)`, boxShadow: `0 0 12px -4px ${color}` }}
    >
      {!live && <span aria-hidden className="badge-shine" />}
      <span aria-hidden>{badge.emoji}</span>
      <span className="truncate">{badge.title}</span>
      {live && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: color }} aria-label="canlı" />}
    </motion.span>
  );
};

// Profil kartlarında haftalık rozetler: dolu çipler geçen haftanın kazanımları,
// kesik kenarlı çipler bu hafta şu an önde olunan yarışlar.
const WeeklyBadges: React.FC<WeeklyBadgesProps> = ({ userId, showStats = true }) => {
  const data = useUserBadges(userId);
  if (!data) return null;

  // Aynı rozet hem kazanılmış hem önde ise tek (dolu) çip yeter
  const earnedKeys = new Set(data.earned.map(b => b.key));
  const leading = data.leading.filter(b => !earnedKeys.has(b.key));
  const { voiceSeconds, messages } = data.stats;
  const hasStats = showStats && (voiceSeconds >= 60 || messages > 0);
  if (data.earned.length === 0 && leading.length === 0 && !hasStats) return null;

  return (
    <div className="mt-2.5">
      <div className="text-[10px] font-bold uppercase tracking-wider text-white/40">Haftalık Rozetler</div>
      {(data.earned.length > 0 || leading.length > 0) && (
        <div className="mt-1 flex flex-wrap gap-1">
          {data.earned.map((b, i) => <Chip key={`e-${b.key}`} badge={b} index={i} />)}
          {leading.map((b, i) => <Chip key={`l-${b.key}`} badge={b} live index={data.earned.length + i} />)}
        </div>
      )}
      {hasStats && (
        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-white/55">
          <span>Bu hafta:</span>
          {voiceSeconds >= 60 && <span title="Seste geçen süre">🎙️ {formatVoice(voiceSeconds)}</span>}
          {messages > 0 && <span title="Gönderilen mesaj">💬 {messages}</span>}
        </div>
      )}
    </div>
  );
};

export default WeeklyBadges;
