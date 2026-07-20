import React from 'react';
import { motion } from 'framer-motion';
import { PhoneOff, ArrowRight } from 'lucide-react';

interface VoiceConnectedPillProps {
  roomName: string;
  onReturn: () => void;
  onDisconnect: () => void;
}

// Lobideyken arkaplanda süren sesli sohbet oturumunu gösteren sabit pill.
const VoiceConnectedPill: React.FC<VoiceConnectedPillProps> = ({ roomName, onReturn, onDisconnect }) => (
  <motion.div
    initial={{ y: 60, opacity: 0 }}
    animate={{ y: 0, opacity: 1 }}
    className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 sm:gap-3 pl-4 pr-2 py-2 rounded-full bg-bg-surface/95 backdrop-blur border border-green-500/40 shadow-[0_4px_24px_rgba(0,0,0,0.5)]"
  >
    <span className="relative flex w-2.5 h-2.5 shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
      <span className="relative inline-flex rounded-full w-2.5 h-2.5 bg-green-500" />
    </span>
    <span className="text-sm text-text-main whitespace-nowrap">
      Sese bağlısın · <span className="font-semibold">{roomName}</span>
    </span>
    <button
      onClick={onReturn}
      title="Odaya geri dön"
      className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary-main/20 text-primary-main hover:bg-primary-main/30 text-xs font-semibold transition-colors"
    >
      Geri dön <ArrowRight size={13} />
    </button>
    <button
      onClick={onDisconnect}
      title="Sesli sohbetten ayrıl"
      className="p-2 rounded-full bg-red-500/15 text-red-400 hover:bg-red-500/30 transition-colors"
    >
      <PhoneOff size={15} />
    </button>
  </motion.div>
);

export default VoiceConnectedPill;
