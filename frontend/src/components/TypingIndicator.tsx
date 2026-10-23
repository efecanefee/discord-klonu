import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface TypingIndicatorProps {
  names: string[];
  compact?: boolean;
}

// Mesaj listesinin altındaki "yazıyor..." balonu. İsimler kalın, noktalar
// CSS ile zıplar (framer döngüsü yerine — çok kişi yazarken daha hafif).
const TypingIndicator: React.FC<TypingIndicatorProps> = ({ names, compact = false }) => {
  // 4+ kişide ilk ikisi + "N kişi daha"
  const shown = names.length > 3 ? names.slice(0, 2) : names;
  const extra = names.length - shown.length;
  return (
    <AnimatePresence>
      {names.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.18 }}
          className="flex items-center gap-2 px-1"
          role="status"
          aria-live="polite"
        >
          <span className={`typing-bubble inline-flex items-center gap-[3px] rounded-full bg-bg-surface border border-border-main ${compact ? 'px-2 py-1.5' : 'px-2.5 py-2'}`} aria-hidden>
            {[0, 1, 2].map(i => (
              <span key={i} className={`typing-dot rounded-full bg-text-muted ${compact ? 'w-1 h-1' : 'w-1.5 h-1.5'}`} style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </span>
          <span className={`${compact ? 'text-[11px]' : 'text-[13px]'} text-text-muted truncate`}>
            {shown.map((n, i) => (
              <React.Fragment key={n}>
                {i > 0 && (i === shown.length - 1 && extra === 0 ? ' ve ' : ', ')}
                <b className="font-semibold text-text-main/90">{n}</b>
              </React.Fragment>
            ))}
            {extra > 0 && ` ve ${extra} kişi daha`}
            {' yazıyor…'}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default TypingIndicator;
