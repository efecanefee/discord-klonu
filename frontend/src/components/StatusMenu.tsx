import React, { useRef, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { popoverMotion } from '../utils/motion';
import { Circle, Moon, MinusCircle, UserX, MessageSquare, Check, X, Gamepad2 } from 'lucide-react';
import { GAME_PRESETS, gameStatusMessage, parseGameStatus } from '../utils/activity';

interface StatusMenuProps {
  isOpen: boolean;
  onClose: () => void;
  currentStatus: string;
  currentMessage: string;
  onUpdateStatus: (status: string, message: string) => void;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
}

const MENU_WIDTH = 288; // w-72

export default function StatusMenu({ isOpen, onClose, currentStatus, currentMessage, onUpdateStatus, buttonRef }: StatusMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [isEditingMessage, setIsEditingMessage] = useState(false);
  const [isPickingGame, setIsPickingGame] = useState(false);
  const [gameInput, setGameInput] = useState('');
  const [tempMessage, setTempMessage] = useState(currentMessage);
  // Tetikleyici buton sayfanın herhangi bir yerinde olabilir (bu uygulamada
  // profil çipi kenar çubuğunun ÜSTÜNDE); sabit "bottom-[80px]" varsayımı
  // butonun ekranın altında olduğunu varsayıyordu ve menü ekran dışında
  // açılıyordu. Bunun yerine butonun gerçek konumuna göre hesaplanır.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    setTempMessage(currentMessage);
  }, [currentMessage, isOpen]);

  useLayoutEffect(() => {
    if (!isOpen || !buttonRef.current) { setPos(null); return; }
    const rect = buttonRef.current.getBoundingClientRect();
    const gap = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const menuHeight = menuRef.current?.offsetHeight ?? 260;

    let left = rect.left;
    if (left + MENU_WIDTH > vw - 8) left = Math.max(8, vw - MENU_WIDTH - 8);

    // Önce butonun altına aç; sığmazsa üstüne
    let top = rect.bottom + gap;
    if (top + menuHeight > vh - 8) top = rect.top - menuHeight - gap;
    if (top < 8) top = 8;

    setPos({ top, left });
  }, [isOpen, buttonRef]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        onClose();
        setIsEditingMessage(false);
        setIsPickingGame(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose, buttonRef]);

  if (!isOpen) return null;

  const statuses = [
    { id: 'online', label: 'Çevrimiçi', icon: Circle, color: 'text-green-500', fill: 'fill-green-500' },
    { id: 'idle', label: 'Boşta', icon: Moon, color: 'text-yellow-500', fill: 'fill-yellow-500' },
    { id: 'dnd', label: 'Rahatsız Etmeyin', icon: MinusCircle, color: 'text-red-500', fill: 'fill-red-500' },
    { id: 'invisible', label: 'Görünmez', icon: UserX, color: 'text-gray-500', fill: '' },
  ];

  const handleStatusSelect = (statusId: string) => {
    onUpdateStatus(statusId, currentMessage);
    onClose();
  };

  const currentGame = parseGameStatus(currentMessage);

  const handleSetGame = (game: string) => {
    const name = game.trim();
    if (!name) return;
    onUpdateStatus(currentStatus, gameStatusMessage(name));
    setIsPickingGame(false);
    setGameInput('');
  };

  const handleSaveMessage = () => {
    onUpdateStatus(currentStatus, tempMessage);
    setIsEditingMessage(false);
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        ref={menuRef}
        {...popoverMotion}
        style={{
          position: 'fixed',
          top: pos?.top ?? 0,
          left: pos?.left ?? 0,
          width: MENU_WIDTH,
          visibility: pos ? 'visible' : 'hidden',
        }}
        className="bg-panel-deep border border-white/10 rounded-xl shadow-2xl p-2 z-[100]"
      >
        <div className="mb-2 p-2">
          {isEditingMessage ? (
            <div className="flex flex-col gap-2">
              <input 
                type="text"
                autoFocus
                value={tempMessage}
                onChange={(e) => setTempMessage(e.target.value)}
                placeholder="Bugün ne yapıyorsun?"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-main"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveMessage();
                  if (e.key === 'Escape') {
                    setIsEditingMessage(false);
                    setTempMessage(currentMessage);
                  }
                }}
              />
              <div className="flex justify-end gap-1">
                <button onClick={() => { setIsEditingMessage(false); setTempMessage(currentMessage); }} className="p-1 text-white/50 hover:text-white bg-white/5 rounded-md"><X size={14}/></button>
                <button onClick={handleSaveMessage} className="p-1 text-white bg-primary-main hover:bg-primary-hover rounded-md"><Check size={14}/></button>
              </div>
            </div>
          ) : (
            <button 
              onClick={() => setIsEditingMessage(true)}
              className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 transition-colors text-left group"
            >
              <MessageSquare size={16} className="text-white/40 group-hover:text-primary-main" />
              <span className="text-sm text-white/80 group-hover:text-white truncate flex-1">
                {currentMessage || "Özel durum belirle"}
              </span>
            </button>
          )}
        </div>

        {/* Oyunda — özel durum mesajını "🎮 X oynuyor" olarak ayarlar */}
        <div className="mb-2 px-2">
          {isPickingGame ? (
            <div className="flex flex-col gap-2 p-2 rounded-lg bg-white/[0.03] border border-white/5">
              <div className="flex flex-wrap gap-1.5">
                {GAME_PRESETS.map(g => (
                  <button key={g} onClick={() => handleSetGame(g)}
                    className="px-2.5 py-1 rounded-full text-xs font-medium bg-white/5 hover:bg-primary-main/25 text-white/80 hover:text-white border border-white/10 transition-colors">
                    {g}
                  </button>
                ))}
              </div>
              <div className="flex gap-1">
                <input
                  type="text"
                  autoFocus
                  value={gameInput}
                  maxLength={40}
                  onChange={(e) => setGameInput(e.target.value)}
                  placeholder="Başka bir oyun yaz..."
                  className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-primary-main"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSetGame(gameInput);
                    if (e.key === 'Escape') setIsPickingGame(false);
                  }}
                />
                <button onClick={() => setIsPickingGame(false)} className="p-1.5 text-white/50 hover:text-white bg-white/5 rounded-md" aria-label="Vazgeç"><X size={14}/></button>
                <button onClick={() => handleSetGame(gameInput)} className="p-1.5 text-white bg-primary-main hover:bg-primary-hover rounded-md" aria-label="Kaydet"><Check size={14}/></button>
              </div>
            </div>
          ) : currentGame ? (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-primary-main/15 border border-primary-main/25">
              <Gamepad2 size={16} className="text-primary-main shrink-0" />
              <span className="text-sm text-white truncate flex-1">Oyunda · <span className="font-semibold">{currentGame}</span></span>
              <button onClick={() => onUpdateStatus(currentStatus, '')} title="Oyundan çık"
                className="p-1 text-white/50 hover:text-white hover:bg-white/10 rounded-md"><X size={14}/></button>
            </div>
          ) : (
            <button
              onClick={() => setIsPickingGame(true)}
              className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 transition-colors text-left group"
            >
              <Gamepad2 size={16} className="text-white/40 group-hover:text-primary-main" />
              <span className="text-sm text-white/80 group-hover:text-white">Oyunda olarak göster</span>
            </button>
          )}
        </div>

        <div className="h-px bg-white/10 mx-2 mb-2" />

        <div className="flex flex-col gap-1">
          {statuses.map(s => {
            const Icon = s.icon;
            const isActive = currentStatus === s.id;
            return (
              <button
                key={s.id}
                onClick={() => handleStatusSelect(s.id)}
                className={`flex items-center justify-between p-2 rounded-lg transition-colors ${isActive ? 'bg-primary-main/20' : 'hover:bg-white/5'}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-5 flex justify-center">
                    <Icon size={16} className={`${s.color} ${s.fill}`} />
                  </div>
                  <span className={`text-sm ${isActive ? 'text-white font-medium' : 'text-white/70'}`}>
                    {s.label}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
