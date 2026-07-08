import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Check, CheckCheck } from 'lucide-react';
import { getAvatarEmoji } from '../constants/avatars';
import signalrService from '../services/signalrService';

interface DirectMessage {
  id: number;
  senderId: string;
  receiverId: string;
  content: string;
  createdAt: string;
  isRead: boolean;
}

interface UserData {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  avatarId: string;
  customStatus: string;
  lastSeen: string;
}

interface DMChatRoomProps {
  currentUser: { id: string; username: string };
  targetUser: UserData;
  API_BASE_URL: string;
  onLeave: () => void;
}

const DMChatRoom: React.FC<DMChatRoomProps> = ({ currentUser, targetUser, API_BASE_URL, onLeave }) => {
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchHistory();

    const handleReceiveMessage = (dm: DirectMessage) => {
      // Sadece bu iki kişi arasındaki mesajları ekle
      if (
        (dm.senderId === currentUser.id && dm.receiverId === targetUser.id) ||
        (dm.senderId === targetUser.id && dm.receiverId === currentUser.id)
      ) {
        setMessages(prev => [...prev, dm]);
        if (dm.senderId === targetUser.id) {
          setIsTyping(false); // Mesaj gelince yazıyor durumunu kapat
        }
      }
    };

    const handleTyping = (userId: string) => {
      if (userId === targetUser.id) {
        setIsTyping(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
          setIsTyping(false);
        }, 3000);
      }
    };

    signalrService.onReceiveDirectMessage(handleReceiveMessage);
    signalrService.onUserTyping(handleTyping);

    return () => {
      signalrService.offReceiveDirectMessage(handleReceiveMessage);
      signalrService.offUserTyping(handleTyping);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [targetUser.id, currentUser.id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/directmessages/${targetUser.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (e) {
      console.error("DM geçmişi çekilemedi:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    await signalrService.sendDirectMessage(targetUser.id, newMessage);
    setNewMessage('');
  };

  const handleTypingStart = () => {
    signalrService.sendUserTyping(targetUser.id);
  };

  return (
    <div className="flex flex-col h-[100vh] w-[100vw] bg-[#0F172A] relative">
      {/* Odanın arkaplan efektleri */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -right-[10%] w-[70vw] h-[70vw] rounded-full bg-[#7C3AED]/5 blur-[120px]" />
        <div className="absolute -bottom-[20%] -left-[10%] w-[60vw] h-[60vw] rounded-full bg-[#3B82F6]/5 blur-[120px]" />
      </div>

      {/* Header */}
      <div className="h-[88px] shrink-0 border-b border-white/5 bg-white/[0.02] flex items-center justify-between px-8 relative z-10">
        <div className="flex items-center gap-4">
          <button 
            onClick={onLeave}
            className="mr-2 p-2 hover:bg-white/10 rounded-xl text-white/50 hover:text-white transition-colors"
          >
            ← Geri
          </button>
          <div className="relative">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl bg-[#1E293B] border border-[#334155] shadow-lg">
              {getAvatarEmoji(targetUser.avatarId)}
            </div>
            <div className={`absolute -bottom-1 -right-1 w-4 h-4 border-2 border-[#0F172A] rounded-full ${targetUser.customStatus === 'online' ? 'bg-green-500' : 'bg-gray-500'}`} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              {targetUser.username}
            </h2>
            <p className="text-sm text-white/50">
              {targetUser.customStatus === 'online' ? 'Çevrimiçi' : `Son görülme: ${new Date(targetUser.lastSeen).toLocaleDateString()}`}
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-white/30">Yükleniyor...</div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-white/30 text-sm">
            Mesaj geçmişi bulunmuyor. İlk mesajı sen gönder!
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isMe = msg.senderId === currentUser.id;
            return (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={msg.id || idx}
                className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[70%] rounded-2xl px-5 py-3 ${isMe ? 'bg-[#7C3AED] text-white rounded-br-none shadow-[0_4px_20px_rgba(124,58,237,0.3)]' : 'bg-white/5 text-white/90 rounded-bl-none border border-white/10 shadow-lg'}`}>
                  <p className="text-[15px] leading-relaxed break-words">{msg.content}</p>
                  <div className={`flex items-center gap-1.5 mt-2 text-[10px] ${isMe ? 'text-white/60 justify-end' : 'text-white/40'}`}>
                    <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {isMe && (
                      msg.isRead ? <CheckCheck size={12} className="text-blue-300" /> : <Check size={12} />
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })
        )}

        <AnimatePresence>
          {isTyping && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex items-center gap-2 text-white/40 text-sm ml-2"
            >
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              {targetUser.username} yazıyor...
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-6 bg-white/[0.02] border-t border-white/5 backdrop-blur-md">
        <form onSubmit={handleSendMessage} className="relative flex items-center">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => {
              setNewMessage(e.target.value);
              handleTypingStart();
            }}
            placeholder={`@${targetUser.username} kişisine mesaj gönder...`}
            className="w-full bg-[#1E293B]/50 border border-white/10 rounded-2xl pl-5 pr-14 py-4 text-[15px] text-white placeholder:text-white/30 outline-none focus:border-[#7C3AED]/50 focus:bg-[#1E293B]/80 transition-all shadow-inner"
          />
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className="absolute right-2 p-2.5 rounded-xl bg-[#7C3AED] text-white hover:bg-[#6D28D9] disabled:opacity-50 disabled:hover:bg-[#7C3AED] transition-all"
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
};

export default DMChatRoom;
