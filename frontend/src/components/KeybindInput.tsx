import React, { useState, useEffect } from 'react';
import { Keyboard } from 'lucide-react';

interface KeybindInputProps {
  value: string;          // KeyboardEvent.code (ör. "Space", "KeyF", "PageUp")
  onChange: (code: string) => void;
  disabled?: boolean;
}

// KeyboardEvent.code → okunabilir etiket (klavye düzeninden bağımsız)
export const formatKeyCode = (code: string): string => {
  if (!code) return 'Atanmadı';
  if (code === 'Space') return 'Boşluk';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  if (code.startsWith('Arrow')) return code.slice(5) + ' Ok';
  const map: Record<string, string> = {
    ControlLeft: 'Sol Ctrl', ControlRight: 'Sağ Ctrl',
    ShiftLeft: 'Sol Shift', ShiftRight: 'Sağ Shift',
    AltLeft: 'Sol Alt', AltRight: 'Sağ Alt',
    PageUp: 'Page Up', PageDown: 'Page Down',
    CapsLock: 'Caps Lock', Backquote: '`', Enter: 'Enter', Tab: 'Tab',
  };
  return map[code] || code;
};

const KeybindInput: React.FC<KeybindInputProps> = ({ value, onChange, disabled }) => {
  const [listening, setListening] = useState(false);

  useEffect(() => {
    if (!listening) return;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') { setListening(false); return; }      // iptal
      if (e.key === 'Backspace' || e.key === 'Delete') {            // temizle
        onChange('');
        setListening(false);
        return;
      }
      onChange(e.code);
      setListening(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [listening, onChange]);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setListening(true)}
      onBlur={() => setListening(false)}
      className={`min-w-[130px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
        listening
          ? 'border-primary-main bg-primary-main/15 text-white animate-pulse'
          : 'border-white/10 bg-[#18181b] text-white/80 hover:border-primary-main/40 hover:text-white'
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      <Keyboard size={14} className="opacity-60" />
      {listening ? 'Bir tuşa bas…' : formatKeyCode(value)}
    </button>
  );
};

export default KeybindInput;
