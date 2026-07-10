import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Check, CheckCheck, X, Pencil, Reply, Smile, Paperclip } from 'lucide-react';
import { getAvatarEmoji } from '../constants/avatars';
import signalrService from '../services/signalrService';
import EmojiPicker from './EmojiPicker';

interface DirectMessage {
  id: number;
  senderId: string;
  receiverId: string;
  content: string;
  createdAt: string;
  isRead: boolean;
  isDeleted: boolean;
  isEdited?: boolean;
  replyToId?: number;
  senderUsername?: string;
  senderAvatarId?: string;
  senderCustomStatus?: string;
}

interface UserData {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  avatarId: string;
  customStatus: string;
  lastSeen?: string;
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
  const [replyingToMessage, setReplyingToMessage] = useState<DirectMessage | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchHistory();

    const handleReceiveMessage = (dm: DirectMessage) => {
      if (
        (dm.senderId === currentUser.id && dm.receiverId === targetUser.id) ||
        (dm.senderId === targetUser.id && dm.receiverId === currentUser.id)
      ) {
        setMessages(prev => [...prev, dm]);
        if (dm.senderId === targetUser.id) {
          setIsTyping(false);
          signalrService.sendMarkAsRead(targetUser.id);
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

    const handleMessagesRead = (userId: string) => {
      if (userId === targetUser.id) {
        setMessages(prev => prev.map(m => 
          (m.senderId === currentUser.id && !m.isRead) ? { ...m, isRead: true } : m
        ));
      }
    };

    signalrService.sendMarkAsRead(targetUser.id);

    signalrService.onReceiveDirectMessage(handleReceiveMessage);
    signalrService.onUserTyping(handleTyping);
    signalrService.onMessagesRead(handleMessagesRead);

    // Düzenleme ve silme eventleri
    const handleMessageEdited = (msgId: number, newContent: string) => {
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: newContent, isEdited: true } : m));
    };

    const handleMessageDeleted = (msgId: number) => {
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, isDeleted: true, content: "Bu mesaj silindi." } : m));
    };

    signalrService.onDirectMessageEdited(handleMessageEdited);
    signalrService.onDirectMessageDeleted(handleMessageDeleted);

    return () => {
      signalrService.offReceiveDirectMessage(handleReceiveMessage);
      signalrService.offUserTyping(handleTyping);
      signalrService.offMessagesRead(handleMessagesRead);
      signalrService.offDirectMessageEdited(handleMessageEdited);
      signalrService.offDirectMessageDeleted(handleMessageDeleted);
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
    if (editingMessageId) {
      if (!newMessage.trim()) return;
      await signalrService.editDirectMessage(editingMessageId, newMessage.trim());
      setNewMessage('');
      setEditingMessageId(null);
      return;
    }

    if (!newMessage.trim()) return;

    await signalrService.sendDirectMessage(targetUser.id, newMessage.trim(), replyingToMessage?.id);
    setNewMessage('');
    setReplyingToMessage(null);
  };

  const startEditing = (msg: DirectMessage) => {
    setEditingMessageId(msg.id);
    setNewMessage(msg.content);
  };

  const handleTypingStart = () => {
    signalrService.sendUserTyping(targetUser.id);
  };

  return (
    <div className="flex flex-col h-[100dvh] w-[100vw] bg-[#0F172A] relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -right-[10%] w-[70vw] h-[70vw] rounded-full bg-[#7C3AED]/5 blur-[120px]" />
        <div className="absolute -bottom-[20%] -left-[10%] w-[60vw] h-[60vw] rounded-full bg-[#3B82F6]/5 blur-[120px]" />
      </div>

      <div className="h-[88px] shrink-0 border-b border-white/5 bg-white/[0.02] flex items-center justify-between px-8 relative z-10">
        <div className="flex items-center gap-4">
          <button 
            onClick={onLeave}
            className="mr-1 p-3 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-white/10 rounded-xl text-white/50 hover:text-white transition-colors cursor-pointer"
          >
            ← Geri
          </button>
          <div className="relative">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl bg-[#1E293B] border border-[#334155] shadow-lg">
              {getAvatarEmoji(targetUser.avatarId)}
            </div>
            <div className={`absolute -bottom-1 -right-1 w-4 h-4 border-2 border-[#0F172A] rounded-full ${targetUser.customStatus === 'online' ? 'bg-green-500' : targetUser.customStatus === 'idle' ? 'bg-yellow-500' : targetUser.customStatus === 'dnd' ? 'bg-red-500' : 'bg-gray-500'}`} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              {targetUser.username}
            </h2>
            <p className="text-sm text-white/50">
              {targetUser.customStatus === 'online' ? 'Çevrimiçi' : targetUser.customStatus === 'idle' ? 'Boşta' : targetUser.customStatus === 'dnd' ? 'Rahatsız Etmeyin' : targetUser.lastSeen ? `Son görülme: ${(() => {
                const date = new Date(targetUser.lastSeen);
                const now = new Date();
                const isToday = date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
                const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return isToday ? `Bugün ${timeStr}` : `${date.toLocaleDateString()} ${timeStr}`;
              })()}` : 'Çevrimdışı'}
            </p>
          </div>
        </div>
      </div>

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
            const replyMsg = msg.replyToId ? messages.find(m => m.id === msg.replyToId) : null;

            return (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={msg.id || idx}
                className={`flex w-full group/msg ${isMe ? 'justify-end' : 'justify-start'}`}
              >
                <div className="flex flex-col max-w-[70%]">
                  {replyMsg && (
                    <div className={`flex items-center gap-2 mb-1 text-xs text-white/50 cursor-pointer hover:text-white/80 transition-colors ${isMe ? 'justify-end' : 'justify-start'}`} onClick={() => {
                        const el = document.getElementById(`msg-${replyMsg.id}`);
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }}>
                      <div className="w-4 h-4 rounded border-l-2 border-t-2 border-white/20 opacity-50 ml-2" />
                      <span className="font-semibold">{replyMsg.senderId === currentUser.id ? 'Sen' : replyMsg.senderUsername || targetUser.username}</span>
                      <span className="truncate max-w-[150px]">{replyMsg.content}</span>
                    </div>
                  )}
                  
                  <div className="relative flex items-center gap-2" id={`msg-${msg.id}`}>
                    <div className={`absolute top-1 ${isMe ? '-left-24' : '-right-8'} flex gap-1 opacity-0 group-hover/msg:opacity-100 transition-opacity z-20`}>
                        {isMe && !msg.isDeleted && (
                          <>
                            <button onClick={() => startEditing(msg)} className="w-6 h-6 rounded-full bg-blue-500/80 hover:bg-blue-500 flex items-center justify-center text-white" title="Düzenle">
                               <Pencil size={11} />
                            </button>
                            <button onClick={() => signalrService.deleteDirectMessage(msg.id)} className="w-6 h-6 rounded-full bg-red-500/80 hover:bg-red-500 flex items-center justify-center text-white" title="Sil">
                               <X size={11} />
                            </button>
                          </>
                        )}
                        {!msg.isDeleted && (
                          <button onClick={() => setReplyingToMessage(msg)} className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white" title="Yanıtla">
                             <Reply size={12} />
                          </button>
                        )}
                    </div>

                    <div 
                      className={`rounded-2xl px-5 py-3 cursor-pointer ${msg.isDeleted ? 'bg-white/5 text-white/40 italic' : isMe ? 'bg-[#7C3AED] text-white rounded-br-none shadow-[0_4px_20px_rgba(124,58,237,0.3)]' : 'bg-white/5 text-white/90 rounded-bl-none border border-white/10 shadow-lg'}`}
                      title="Kopyalamak için tıkla"
                      onClick={() => navigator.clipboard.writeText(msg.content)}
                    >
                      <p className="text-[15px] leading-relaxed break-words">{msg.content}</p>
                      <div className={`flex items-center gap-1.5 mt-2 text-[10px] ${isMe ? 'text-white/60 justify-end' : 'text-white/40'}`}>
                        <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {msg.isEdited && !msg.isDeleted && <span>(Düzenlendi)</span>}
                        {isMe && !msg.isDeleted && (
                          msg.isRead ? <CheckCheck size={12} className="text-blue-300" /> : <Check size={12} />
                        )}
                      </div>
                    </div>
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
      <div className="p-4 sm:p-6 bg-[#0F172A]/90 border-t border-white/5 backdrop-blur-xl sticky bottom-0 z-20 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {editingMessageId && (
          <div className="flex items-center justify-between mb-2 bg-blue-500/10 rounded-xl px-4 py-2 border border-blue-500/20">
            <div className="flex items-center gap-2 text-sm text-blue-200">
              <Pencil size={14} className="text-blue-400" />
              <span>Mesajı düzenliyorsun</span>
            </div>
            <button onClick={() => { setEditingMessageId(null); setNewMessage(''); }} className="text-white/40 hover:text-white transition-colors cursor-pointer">
              <X size={16} />
            </button>
          </div>
        )}
        {!editingMessageId && replyingToMessage && (
          <div className="flex items-center justify-between mb-2 bg-white/5 rounded-xl px-4 py-2 border border-white/10">
            <div className="flex items-center gap-2 text-sm text-white/70">
              <Reply size={14} className="text-[#7C3AED]" />
              <span className="font-semibold">{replyingToMessage.senderId === currentUser.id ? 'Kendine' : targetUser.username}</span>
              <span>yanıt veriliyor:</span>
              <span className="truncate max-w-[200px] text-white/40">{replyingToMessage.content}</span>
            </div>
            <button onClick={() => setReplyingToMessage(null)} className="text-white/40 hover:text-white transition-colors cursor-pointer">
              <X size={16} />
            </button>
          </div>
        )}
        <form onSubmit={handleSendMessage} className="relative flex items-center bg-[#1E293B]/50 border border-white/10 rounded-2xl transition-all shadow-inner focus-within:border-[#7C3AED]/50 focus-within:bg-[#1E293B]/80">
          <div className="relative">
            <button type="button" onClick={() => setShowEmojiPicker(!showEmojiPicker)} className="p-3 text-white/30 hover:text-white transition-colors cursor-pointer">
              <Smile size={20} />
            </button>
            <AnimatePresence>
              {showEmojiPicker && (
                <div className="absolute bottom-full left-0 mb-2 z-50">
                  <EmojiPicker onEmojiSelect={(emoji) => {
                    setNewMessage(prev => prev + emoji);
                    setShowEmojiPicker(false);
                    handleTypingStart();
                  }} isOpen={showEmojiPicker} onClose={() => setShowEmojiPicker(false)} />
                </div>
              )}
            </AnimatePresence>
          </div>
          <button type="button" onClick={() => fileInputRef.current?.click()} className="p-3 text-white/30 hover:text-white transition-colors cursor-pointer">
            <Paperclip size={20} />
          </button>
          <input type="file" ref={fileInputRef} className="hidden" onChange={() => alert("Dosya yükleme yakında...")} />

          <input
            type="text"
            value={newMessage}
            onChange={(e) => {
              setNewMessage(e.target.value);
              handleTypingStart();
            }}
            placeholder={`@${targetUser.username} kişisine mesaj gönder...`}
            className="w-full bg-transparent py-4 text-[15px] text-white placeholder:text-white/30 outline-none flex-1"
          />
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className="mr-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-[#7C3AED] text-white hover:bg-[#6D28D9] disabled:opacity-50 disabled:hover:bg-[#7C3AED] transition-all cursor-pointer"
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
};

export default DMChatRoom;
