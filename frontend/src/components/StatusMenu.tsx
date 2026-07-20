import React, { useRef, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Circle, Moon, MinusCircle, UserX, MessageSquare, Check, X } from 'lucide-react';

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

  const handleSaveMessage = () => {
    onUpdateStatus(currentStatus, tempMessage);
    setIsEditingMessage(false);
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        ref={menuRef}
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.15 }}
        style={{
          position: 'fixed',
          top: pos?.top ?? 0,
          left: pos?.left ?? 0,
          width: MENU_WIDTH,
          visibility: pos ? 'visible' : 'hidden',
        }}
        className="bg-[#09090b] border border-white/10 rounded-xl shadow-2xl p-2 z-[100]"
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
