import React from 'react';

export interface ReactionGroup {
  emoji: string;
  count: number;
  usernames: string[];
}

interface ReactionChipsProps {
  reactions: ReactionGroup[];
  myUsername: string;
  onToggle: (emoji: string) => void;
}

// Mesaj altındaki emoji tepki chip'leri. Benim tepkim vurgulu; tıkla = toggle.
const ReactionChips: React.FC<ReactionChipsProps> = ({ reactions, myUsername, onToggle }) => {
  if (!reactions || reactions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {reactions.map(r => {
        const mine = r.usernames.includes(myUsername);
        return (
          <button
            key={r.emoji}
            type="button"
            onClick={() => onToggle(r.emoji)}
            title={r.usernames.join(', ')}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[12px] leading-none transition-colors cursor-pointer ${
              mine
                ? 'bg-primary-main/20 border-primary-main/50 text-primary-main'
                : 'bg-bg-surface border-border-main text-text-muted hover:border-primary-main/40 hover:text-text-main'
            }`}
          >
            <span className="text-[13px]">{r.emoji}</span>
            <span className="font-semibold">{r.count}</span>
          </button>
        );
      })}
    </div>
  );
};

export default ReactionChips;
