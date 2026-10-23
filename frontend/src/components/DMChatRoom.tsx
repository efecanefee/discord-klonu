import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Check, CheckCheck, X, Pencil, Reply, Smile, Paperclip } from 'lucide-react';
import { renderAvatar } from '../constants/avatars';
import signalrService from '../services/signalrService';
import EmojiPicker from './EmojiPicker';
import GifPicker from './GifPicker';
import MessageFileAttachment from './MessageFileAttachment';
import InlineMessageEditor from './InlineMessageEditor';
import TypingIndicator from './TypingIndicator';
import EditedTag from './EditedTag';
import LinkPreviews from './LinkPreviews';
import { useStickToBottom } from '../hooks/useStickToBottom';

// Metindeki http(s) linklerini tıklanabilir yapar; doğrudan resim/GIF linki görsel olarak açılır
const linkify = (text: string, onDark: boolean): React.ReactNode[] =>
  text.split(/(https?:\/\/[^\s]+)/g).map((part, i) => {
    if (i % 2 === 0) return part;
    if (/\.(jpe?g|gif|png|webp)(\?.*)?$/i.test(part)) {
      return (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="block my-1 w-fit" onClick={e => e.stopPropagation()}>
          <img src={part} alt="" loading="lazy" className="max-w-[260px] sm:max-w-[340px] max-h-64 rounded-lg object-contain bg-black/20" />
        </a>
      );
    }
    return (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
        className={`underline underline-offset-2 break-all ${onDark ? 'text-white' : 'text-blue-400 hover:text-blue-300'}`}>
        {part}
      </a>
    );
  });

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
  fileUrl?: string;
  fileName?: string;
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
  const [editText, setEditText] = useState('');
  // Giden "yazıyor" sinyali her tuşta değil ~2.5 sn'de bir gönderilir
  const lastTypingSentRef = useRef(0);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // "Yeni Mesajlar" ayracının üstünde duracağı mesajın id'si (history'den)
  const [firstUnreadId, setFirstUnreadId] = useState<number | null>(null);

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
      setMessages(prev => prev.filter(m => m.id !== msgId));
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

  // Sohbet en son mesajdan açılır, alttayken yeni mesajda altta kalır
  const lastMessage = messages[messages.length - 1];
  const { onScroll: handleChatScroll, scrollToBottom } = useStickToBottom(chatScrollRef, {
    contentKey: `${isLoading}:${messages.length}:${lastMessage?.id}:${isTyping}`,
    resetKey: targetUser.id,
  });

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/directmessages/${targetUser.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data: DirectMessage[] = await res.json();
        // "Yeni Mesajlar" ayracı: karşı taraftan gelen ilk okunmamış mesaj
        // (sendMarkAsRead hepsini okundu yapmadan önce yakala)
        const firstUnread = data.find(m => m.senderId === targetUser.id && !m.isRead);
        setFirstUnreadId(firstUnread ? firstUnread.id : null);
        setMessages(data);
      }
    } catch (e) {
      console.error("DM geçmişi çekilemedi:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    scrollToBottom();

    await signalrService.sendDirectMessage(targetUser.id, newMessage.trim(), replyingToMessage?.id);
    lastTypingSentRef.current = 0;
    setNewMessage('');
    setReplyingToMessage(null);
  };

  const startEditing = (msg: DirectMessage) => {
    setEditingMessageId(msg.id);
    setEditText(msg.content);
  };
  const cancelEditing = () => {
    setEditingMessageId(null);
    setEditText('');
  };
  const saveEditing = () => {
    const next = editText.trim();
    const original = messages.find(m => m.id === editingMessageId)?.content;
    if (editingMessageId && next && next !== original) {
      signalrService.editDirectMessage(editingMessageId, next);
      setMessages(prev => prev.map(m => m.id === editingMessageId ? { ...m, content: next, isEdited: true } : m));
    }
    cancelEditing();
  };

  // Boş kutuda ↑ = son mesajını düzenle
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'ArrowUp' || newMessage) return;
    const lastMine = [...messages].reverse().find(m => m.senderId === currentUser.id && !m.isDeleted && !m.fileUrl);
    if (lastMine) { e.preventDefault(); startEditing(lastMine); }
  };

  const handleTypingStart = () => {
    const now = Date.now();
    if (now - lastTypingSentRef.current < 2500) return;
    lastTypingSentRef.current = now;
    signalrService.sendUserTyping(targetUser.id);
  };

  const handleFileUpload = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      alert('Dosya boyutu 10MB\'ı geçemez.');
      return;
    }
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: formData,
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      await signalrService.sendDirectFileMessage(targetUser.id, data.url, file.name);
    } catch (err) {
      console.error('DM dosya yükleme hatası:', err);
      alert('Dosya yüklenemedi.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
    e.target.value = '';
  };

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-[#09090b] relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -right-[10%] w-[70vw] h-[70vw] rounded-full bg-primary-main/5 blur-[120px]" />
        <div className="absolute -bottom-[20%] -left-[10%] w-[60vw] h-[60vw] rounded-full bg-[#3B82F6]/5 blur-[120px]" />
      </div>

      <div className="h-[88px] shrink-0 border-b border-white/5 bg-white/[0.02] flex items-center justify-between px-4 sm:px-8 relative z-10">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <button
            onClick={onLeave}
            className="shrink-0 p-3 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-white/10 rounded-xl text-white/50 hover:text-white transition-colors cursor-pointer"
          >
            ←
          </button>
          <div className="relative shrink-0">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full overflow-hidden flex items-center justify-center text-2xl bg-[#18181b] border border-[#334155] shadow-lg">
              {renderAvatar(targetUser.avatarId)}
            </div>
            <div className={`absolute -bottom-1 -right-1 w-4 h-4 border-2 border-[#09090b] rounded-full ${targetUser.customStatus === 'online' ? 'bg-green-500' : targetUser.customStatus === 'idle' ? 'bg-yellow-500' : targetUser.customStatus === 'dnd' ? 'bg-red-500' : 'bg-gray-500'}`} />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2 truncate">
              {targetUser.username}
            </h2>
            <p className="text-xs sm:text-sm text-white/50 truncate">
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

      <div ref={chatScrollRef} onScroll={handleChatScroll} className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
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
              <React.Fragment key={msg.id || idx}>
              {msg.id === firstUnreadId && (
                <div className="flex items-center gap-3 my-3" aria-label="Yeni mesajlar">
                  <div className="flex-1 h-px bg-red-400/50" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">Yeni Mesajlar</span>
                  <div className="flex-1 h-px bg-red-400/50" />
                </div>
              )}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
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
                        <button onClick={() => setReplyingToMessage(msg)} className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white" title="Yanıtla">
                           <Reply size={12} />
                        </button>
                    </div>

                    <div 
                      className={`rounded-2xl px-5 py-3 cursor-pointer ${editingMessageId === msg.id ? 'msg-editing' : ''} ${isMe ? 'bg-primary-main text-white rounded-br-none shadow-[0_4px_20px_rgba(var(--accent-rgb),0.3)]' : 'bubble-in text-white/90 rounded-bl-none shadow-lg'}`}
                      title="Kopyalamak için tıkla"
                      onClick={() => { if (!msg.fileUrl && editingMessageId !== msg.id) navigator.clipboard.writeText(msg.content); }}
                    >
                      {msg.fileUrl && <MessageFileAttachment fileUrl={msg.fileUrl} fileName={msg.fileName} onDark={isMe} />}
                      {editingMessageId === msg.id ? (
                        <InlineMessageEditor value={editText} onChange={setEditText} onSave={saveEditing} onCancel={cancelEditing} onDark={isMe} />
                      ) : (!msg.fileUrl || !msg.content.startsWith('[Dosya:')) && (
                        <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap">{linkify(msg.content, isMe)}{msg.isEdited && <EditedTag />}</p>
                      )}
                      <div className={`flex items-center gap-1.5 mt-2 text-[10px] ${isMe ? 'text-white/60 justify-end' : 'text-white/40'}`}>
                        <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {isMe && (
                          msg.isRead ? <CheckCheck size={12} className="text-blue-300" /> : <Check size={12} />
                        )}
                      </div>
                    </div>
                  </div>
                  {!msg.fileUrl && !msg.isDeleted && editingMessageId !== msg.id && <LinkPreviews text={msg.content} align={isMe ? 'end' : 'start'} />}
                </div>
              </motion.div>
              </React.Fragment>
            );
          })
        )}

        <TypingIndicator names={isTyping ? [targetUser.username] : []} />
      </div>

      {/* Input Area */}
      <div className="p-4 sm:p-6 bg-[#09090b] border-t border-white/5 sticky bottom-0 z-20 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {replyingToMessage && (
          <div className="flex items-center justify-between mb-2 bg-white/5 rounded-xl px-4 py-2 border border-white/10">
            <div className="flex items-center gap-2 text-sm text-white/70">
              <Reply size={14} className="text-primary-main" />
              <span className="font-semibold">{replyingToMessage.senderId === currentUser.id ? 'Kendine' : targetUser.username}</span>
              <span>yanıt veriliyor:</span>
              <span className="truncate max-w-[200px] text-white/40">{replyingToMessage.content}</span>
            </div>
            <button onClick={() => setReplyingToMessage(null)} className="text-white/40 hover:text-white transition-colors cursor-pointer">
              <X size={16} />
            </button>
          </div>
        )}
        <form onSubmit={handleSendMessage} className="relative flex items-center bg-[#18181b]/50 border border-white/10 rounded-2xl transition-all shadow-inner focus-within:border-primary-main/50 focus-within:bg-[#18181b]/80">
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
          <div className="relative">
            <button type="button" onClick={() => { setShowGifPicker(p => !p); setShowEmojiPicker(false); }} title="GIF gönder" aria-label="GIF gönder"
              className={`p-2 transition-colors cursor-pointer ${showGifPicker ? 'text-primary-main' : 'text-white/30 hover:text-white'}`}>
              <span className="text-[10px] font-black leading-none tracking-wide border-[1.5px] border-current rounded-[5px] px-1 py-[3px]">GIF</span>
            </button>
            <GifPicker isOpen={showGifPicker} onClose={() => setShowGifPicker(false)}
              onSelect={g => { scrollToBottom(); signalrService.sendDirectMessage(targetUser.id, g.url, replyingToMessage?.id); setReplyingToMessage(null); }} />
          </div>
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="p-3 text-white/30 hover:text-white transition-colors cursor-pointer disabled:opacity-50">
            <Paperclip size={20} />
          </button>
          <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileInputChange} />

          <input
            type="text"
            value={newMessage}
            onChange={(e) => {
              setNewMessage(e.target.value);
              handleTypingStart();
            }}
            onKeyDown={handleInputKeyDown}
            placeholder={isUploading ? 'Dosya yükleniyor...' : `@${targetUser.username} kişisine mesaj gönder...`}
            disabled={isUploading}
            className="w-full bg-transparent py-4 text-[15px] text-white placeholder:text-white/30 outline-none flex-1"
          />
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className="mr-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-primary-main text-white hover:bg-primary-hover disabled:opacity-50 disabled:hover:bg-primary-main transition-all cursor-pointer"
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
};

export default DMChatRoom;
