import React, { useEffect, useRef } from 'react';
import { renderAvatar } from '../constants/avatars';

export interface MentionCandidate {
  username: string;
  avatarId?: string;
}

interface MentionAutocompleteProps {
  candidates: MentionCandidate[];
  activeIndex: number;
  onSelect: (username: string) => void;
  onHover: (index: number) => void;
}

// Input üstünde açılan @mention önerileri. Klavye kontrolü (ok/Enter/Tab/Esc)
// parent'ın input onKeyDown'ında — bu bileşen yalnızca listeyi çizer.
const MentionAutocomplete: React.FC<MentionAutocompleteProps> = ({ candidates, activeIndex, onSelect, onHover }) => {
  const listRef = useRef<HTMLDivElement>(null);

  // Aktif satır görünür kalsın
  useEffect(() => {
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (candidates.length === 0) return null;

  return (
    <div className="absolute bottom-full mb-2 left-0 z-50 w-64 max-w-[calc(100vw-2rem)] bg-bg-surface border border-border-main rounded-2xl shadow-2xl overflow-hidden">
      <div className="px-3 py-2 text-[10px] uppercase tracking-wider font-bold text-text-muted border-b border-border-main">
        Üyeler
      </div>
      <div ref={listRef} className="max-h-48 overflow-y-auto custom-scrollbar py-1">
        {candidates.map((c, i) => (
          <button
            key={c.username}
            type="button"
            // onMouseDown: input focus'u kaybolmadan seçim yapılsın
            onMouseDown={(e) => { e.preventDefault(); onSelect(c.username); }}
            onMouseEnter={() => onHover(i)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
              i === activeIndex ? 'bg-primary-main/15 text-text-main' : 'text-text-muted hover:text-text-main'
            }`}
          >
            <div className="w-6 h-6 rounded-full overflow-hidden shrink-0 [&>*]:w-full [&>*]:h-full">
              {renderAvatar(c.avatarId || 'default')}
            </div>
            <span className="text-sm font-medium truncate">@{c.username}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default MentionAutocomplete;
