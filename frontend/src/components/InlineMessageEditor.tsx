import React, { useEffect, useRef } from 'react';

interface InlineMessageEditorProps {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onDark?: boolean;
  compact?: boolean;
}

const MAX_MESSAGE_LENGTH = 2000;

// Mesaj balonunun içinde açılan düzenleyici (Discord tarzı).
// Enter kaydet, Shift+Enter yeni satır, Esc iptal.
const InlineMessageEditor: React.FC<InlineMessageEditorProps> = ({ value, onChange, onSave, onCancel, onDark = false, compact = false }) => {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Açılınca imleç sona; yükseklik içeriğe göre büyür
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); onSave(); }
  };

  const hint = onDark ? 'text-white/70' : 'text-text-muted';
  const link = onDark ? 'text-white font-semibold hover:underline' : 'text-primary-main font-semibold hover:underline';

  return (
    <div className={`flex flex-col gap-1 ${compact ? 'min-w-[180px]' : 'min-w-[220px] sm:min-w-[320px]'}`} onClick={e => e.stopPropagation()}>
      <textarea
        ref={ref}
        value={value}
        maxLength={MAX_MESSAGE_LENGTH}
        rows={1}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="Mesajı düzenle"
        className={`w-full resize-none rounded-lg px-2.5 py-2 leading-relaxed focus:outline-none custom-scrollbar ${compact ? 'text-[13px]' : 'text-[15px]'} ${
          onDark ? 'bg-black/20 text-white placeholder:text-white/50 focus:ring-2 focus:ring-white/40' : 'bg-bg-base text-text-main border border-border-main focus:border-primary-main'
        }`}
      />
      <span className={`text-[10px] ${hint}`}>
        Esc ile <button type="button" onClick={onCancel} className={`${link} cursor-pointer`}>iptal</button> · Enter ile <button type="button" onClick={onSave} className={`${link} cursor-pointer`}>kaydet</button>
      </span>
    </div>
  );
};

export default InlineMessageEditor;
