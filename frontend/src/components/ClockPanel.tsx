import { memo, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const pad = (n: number) => n.toString().padStart(2, '0');

// Deger degisince eski rakam yukari kayarak cikar, yenisi asagidan girer.
// w-[2ch] + tabular-nums: rakamlar es genislikte, kayarken hic titremez.
const Digits = ({ value }: { value: string }) => (
  <span className="relative inline-flex w-[2ch] justify-center overflow-hidden">
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={value}
        initial={{ y: '0.7em', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '-0.7em', opacity: 0 }}
        transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        {value}
      </motion.span>
    </AnimatePresence>
  </span>
);

interface ClockPanelProps {
  compact?: boolean; // mobil: yatay ince serit; masaustu: panel
}

// Saat dakikada bir guncellenir (dakika basina hizali) — saniyelik render
// maliyeti yok. Saniyenin nabzini iki nokta veriyor: saf CSS opacity
// animasyonu, compositor'da calisir ve "Animasyonlari Azalt" ile soner.
const ClockPanel = memo(function ClockPanel({ compact = false }: ClockPanelProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: number;
    const schedule = () => {
      timer = window.setTimeout(() => {
        setNow(new Date());
        schedule();
      }, 60000 - (Date.now() % 60000) + 50);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);

  const hh = pad(now.getHours());
  const mm = pad(now.getMinutes());
  const weekday = new Intl.DateTimeFormat('tr-TR', { weekday: 'long' }).format(now);
  const dateLong = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }).format(now);

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.3, ease: 'easeOut' }}
        className="flex items-center justify-between px-5 py-3 bg-bg-surface/60 border border-white/10 rounded-3xl"
      >
        <div className="flex items-baseline text-white font-bold text-[22px] tracking-tight tabular-nums leading-none">
          <Digits value={hh} />
          <span className="clock-colon text-primary-main mx-0.5">:</span>
          <Digits value={mm} />
        </div>
        <div className="text-right">
          <div className="text-[12px] font-semibold text-white/70 leading-tight capitalize">{weekday}</div>
          <div className="text-[10px] text-white/35">{dateLong}</div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25, duration: 0.3, ease: 'easeOut' }}
      className="relative shrink-0 p-5 bg-[rgba(20,20,26,0.55)] border border-white/10 rounded-[28px] shadow-[0_8px_32px_rgba(0,0,0,0.3)] backdrop-blur-[18px] overflow-hidden"
    >
      {/* üst gradient çizgi — Sunucularım paneliyle aynı dil */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-primary-main/40 to-transparent" />
      <div className="flex items-baseline justify-center text-white font-bold text-[34px] tracking-tight tabular-nums leading-none">
        <Digits value={hh} />
        <span className="clock-colon text-primary-main mx-1">:</span>
        <Digits value={mm} />
      </div>
      <div className="mt-2 text-center">
        <span className="text-[12px] font-semibold text-white/70 capitalize">{weekday}</span>
        <span className="text-[12px] text-white/30"> · </span>
        <span className="text-[12px] text-white/40">{dateLong}</span>
      </div>
    </motion.div>
  );
});

export default ClockPanel;
