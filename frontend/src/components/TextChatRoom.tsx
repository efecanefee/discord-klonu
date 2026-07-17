import React, { useState, useEffect, useRef, useCallback } from 'react';
import signalrService from '../services/signalrService';
import { useAudioNotifications } from '../hooks/useAudioNotifications';
import { LogOut, Send, Search, X, Code, Smile, Paperclip, Pencil, FileText, Reply, Users, Hash, Info, Settings, Volume2, Plus, Trash2, Mic, MicOff, PhoneOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Variants } from 'framer-motion';
import EmojiPicker from './EmojiPicker';
import MessageFileAttachment from './MessageFileAttachment';
import UserPopoverCard, { type PopoverUser } from './UserPopoverCard';
import PopoverPortal from './PopoverPortal';
import RoomSettingsModal from './RoomSettingsModal';
import { renderAvatar } from '../constants/avatars';
import { roomApi, type RoomMemberDto, type ChannelDto } from '../services/roomApi';
import { useVoiceChannel } from '../hooks/useVoiceChannel';
import { roleBadgeEmoji, sortByRole, roleRank, roleLabel } from '../utils/roles';
import { useSettings } from '../contexts/SettingsContext';
import { applySinkId } from '../utils/audioOutput';

export interface TextRoomInfo {
    name: string;
    description?: string;
    createdBy?: string;
}

// Uzak katilimcinin sesi. Ayarlardaki cikis cihazina yonlendirilir.
const VoiceAudio: React.FC<{ stream: MediaStream; sinkId: string }> = ({ stream, sinkId }) => {
    const ref = useRef<HTMLAudioElement>(null);
    useEffect(() => { if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream; }, [stream]);
    useEffect(() => { applySinkId(ref.current, sinkId); }, [sinkId, stream]);
    return <audio ref={ref} autoPlay playsInline />;
};

interface TextChatRoomProps {
    username: string;
    avatarId?: string;
    roomId: string;
    roomDbId: number;
    myUserId: string;
    roomInfo?: TextRoomInfo;
    onLeave: () => void;
    onOpenDM?: (user: PopoverUser) => void;
    onOpenProfile?: () => void;
}

interface Message {
    id: number;
    serverId?: number;
    username: string;
    avatarId?: string;
    text: string;
    type: 'message' | 'system';
    pending?: boolean;
    timestamp: number;
    isEdited?: boolean;
    fileUrl?: string;
    fileName?: string;
    replyToId?: number;
}

const TextChatRoom: React.FC<TextChatRoomProps> = ({ username, avatarId = 'default', roomId, roomDbId, myUserId, roomInfo, onLeave, onOpenDM, onOpenProfile }) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [usersInRoom, setUsersInRoom] = useState<{ connectionId: string; username: string; avatarId?: string; userId?: string; role?: string }[]>([]);
    const [popoverUserKey, setPopoverUserKey] = useState<string | null>(null);
    const [popoverAnchor, setPopoverAnchor] = useState<DOMRect | null>(null);

    // Kanallar (Özellik 8 — Faz 2b). Varsayılan aktif kanal = #genel (messageKey === oda adı = roomId)
    const [channels, setChannels] = useState<ChannelDto[]>([]);
    const [activeChannelKey, setActiveChannelKey] = useState<string>(roomId);
    const [activeChannelId, setActiveChannelId] = useState<number | null>(null);
    const [showAddChannel, setShowAddChannel] = useState(false);
    const [newChannelName, setNewChannelName] = useState('');
    const [newChannelType, setNewChannelType] = useState<'text' | 'voice'>('text');

    // Rol sistemi (Özellik 6)
    const myRole = usersInRoom.find(u => u.userId === myUserId)?.role;
    const canManageRoom = roleRank(myRole) >= 1;
    const [showRoomSettings, setShowRoomSettings] = useState(false);

    // Kalıcı üye listesi (Özellik 9 — "Odaya Katılanlar" çevrimiçi/çevrimdışı)
    const [allMembers, setAllMembers] = useState<RoomMemberDto[]>([]);
    const refreshMembers = useCallback(() => {
        if (roomDbId > 0) roomApi.getMembers(roomDbId).then(setAllMembers).catch(() => { });
    }, [roomDbId]);
    useEffect(() => { refreshMembers(); }, [refreshMembers]);

    // Anlık bağlı kullanıcıları (SignalR) kalıcı üyelerle birleştir → çevrimiçi/çevrimdışı
    type MemberRow = { userId: string; username: string; avatarId?: string; role?: string; isOnline: boolean };
    const onlineByUserId = new Map(usersInRoom.filter(u => u.userId).map(u => [u.userId as string, u]));
    const memberRows: MemberRow[] = allMembers.map(m => ({
        userId: m.userId, username: m.username, avatarId: m.avatarId, role: m.role, isOnline: onlineByUserId.has(m.userId),
    }));
    // Henüz kalıcı listede olmayan bağlı kullanıcılar (yeni katılan / sistem odası)
    const extraOnline: MemberRow[] = usersInRoom
        .filter(u => u.userId && !allMembers.some(m => m.userId === u.userId))
        .map(u => ({ userId: u.userId as string, username: u.username, avatarId: u.avatarId, role: u.role, isOnline: true }));
    const merged = [...memberRows, ...extraOnline];
    const onlineMembers = merged.filter(r => r.isOnline).sort(sortByRole);
    const offlineMembers = merged.filter(r => !r.isOnline).sort(sortByRole);

    const handleSetModerator = async (uId: string, make: boolean) => {
        setPopoverUserKey(null);
        try { await roomApi.setRole(roomDbId, uId, make ? 'moderator' : 'member'); }
        catch (e) { alert(e instanceof Error ? e.message : 'İşlem başarısız.'); }
    };
    const handleKickUser = async (uId: string) => {
        setPopoverUserKey(null);
        try { await roomApi.kick(roomDbId, uId); }
        catch (e) { alert(e instanceof Error ? e.message : 'İşlem başarısız.'); }
    };
    const handleBanUser = async (uId: string) => {
        if (!window.confirm('Bu kullanıcıyı odadan yasaklamak istediğine emin misin?')) return;
        setPopoverUserKey(null);
        try { await roomApi.ban(roomDbId, uId); }
        catch (e) { alert(e instanceof Error ? e.message : 'İşlem başarısız.'); }
    };

    // Tek bir üye satırı (çevrimiçi + çevrimdışı gruplarında paylaşılır)
    const renderMemberRow = (m: MemberRow) => {
        const badge = roleBadgeEmoji(m.role);
        const isSelf = m.userId === myUserId;
        return (
            <motion.div layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} key={m.userId}
                onClick={(e) => { setPopoverAnchor(e.currentTarget.getBoundingClientRect()); setPopoverUserKey(prev => prev === m.userId ? null : m.userId); }}
                className={`relative flex items-center gap-3 p-3 rounded-[16px] border border-transparent hover:border-border-main hover:bg-bg-surface transition-colors duration-200 cursor-pointer ${m.isOnline ? '' : 'opacity-60'}`}>
                <div className="relative">
                    <div className={`w-10 h-10 rounded-full bg-bg-surface flex items-center justify-center overflow-hidden border-2 shadow-sm text-xl ${m.isOnline ? 'border-[#7C3AED]' : 'border-border-main grayscale'}`}>
                        {renderAvatar(m.avatarId || 'default')}
                    </div>
                    <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-[2.5px] border-bg-card ${m.isOnline ? 'bg-emerald-500' : 'bg-gray-500'}`} />
                </div>
                <div className="min-w-0">
                    <span className="font-semibold text-[14px] text-text-main truncate max-w-[150px] flex items-center gap-1">
                        {m.username} {badge && <span title={roleLabel(m.role)}>{badge}</span>} {isSelf && <span className="text-[11px] text-text-muted font-normal">(Sen)</span>}
                    </span>
                    <span className="text-[11px] text-text-muted">{m.isOnline ? 'Çevrimiçi' : 'Çevrimdışı'}</span>
                </div>

                {popoverUserKey === m.userId && (
                    <PopoverPortal anchorRect={popoverAnchor} onClose={() => setPopoverUserKey(null)}>
                        <UserPopoverCard
                            user={{ userId: m.userId, username: m.username, avatarId: m.avatarId, customStatus: m.isOnline ? 'online' : 'offline', role: m.role }}
                            isSelf={isSelf}
                            viewerRole={myRole}
                            onSendMessage={() => { setPopoverUserKey(null); onOpenDM?.({ userId: m.userId, username: m.username, avatarId: m.avatarId }); }}
                            onEditProfile={() => { setPopoverUserKey(null); onOpenProfile?.(); }}
                            onSetModerator={m.userId ? (make) => handleSetModerator(m.userId, make) : undefined}
                            onKick={m.userId ? () => handleKickUser(m.userId) : undefined}
                            onBan={m.userId ? () => handleBanUser(m.userId) : undefined}
                        />
                    </PopoverPortal>
                )}
            </motion.div>
        );
    };
    // ===== Kanallar (Özellik 8 — Faz 2b) =====
    const refreshChannels = useCallback(() => {
        if (roomDbId > 0) roomApi.getChannels(roomDbId).then(setChannels).catch(() => { });
    }, [roomDbId]);
    useEffect(() => { refreshChannels(); }, [refreshChannels]);

    // Kanallar yüklenince aktif kanal id'sini işaretle (anahtar zaten roomId = #genel)
    useEffect(() => {
        if (activeChannelId != null || channels.length === 0) return;
        const def = channels.find(c => c.messageKey === activeChannelKey) || channels.find(c => c.type === 'text');
        if (def) { setActiveChannelId(def.id); setActiveChannelKey(def.messageKey); }
    }, [channels, activeChannelId, activeChannelKey]);

    // Kanal oluşturma / silme canlı bildirimleri
    useEffect(() => {
        const onCreated = (rid: number, ch: ChannelDto) => {
            if (rid !== roomDbId) return;
            setChannels(prev => prev.some(c => c.id === ch.id) ? prev : [...prev, ch].sort((a, b) => a.position - b.position));
        };
        const onDeleted = (rid: number, cid: number) => {
            if (rid !== roomDbId) return;
            setChannels(prev => prev.filter(c => c.id !== cid));
            if (cid === activeChannelId) { setActiveChannelId(null); setActiveChannelKey(roomId); }
        };
        signalrService.onChannelCreated(onCreated);
        signalrService.onChannelDeleted(onDeleted);
        return () => {
            signalrService.offChannelCreated(onCreated);
            signalrService.offChannelDeleted(onDeleted);
        };
    }, [roomDbId, roomId, activeChannelId]);

    const switchChannel = (ch: ChannelDto) => {
        if (ch.type === 'voice') {
            const connId = signalrService.connectionId;
            if (!connId) return;
            if (voice.activeVoiceKey === ch.messageKey) { voice.leaveVoice(); return; }
            voice.joinVoice(ch.messageKey, { connectionId: connId, username, avatarId, userId: myUserId });
            return;
        }
        if (ch.id === activeChannelId) return;
        setActiveChannelId(ch.id);
        setActiveChannelKey(ch.messageKey);
    };

    const handleAddChannel = async () => {
        const name = newChannelName.trim();
        if (!name) return;
        try {
            const ch = await roomApi.createChannel(roomDbId, name, newChannelType);
            setChannels(prev => prev.some(c => c.id === ch.id) ? prev : [...prev, ch].sort((a, b) => a.position - b.position));
            setNewChannelName('');
            setShowAddChannel(false);
        } catch (e) { alert(e instanceof Error ? e.message : 'Kanal oluşturulamadı.'); }
    };

    const handleDeleteChannel = async (ch: ChannelDto) => {
        if (!window.confirm(`"${ch.name}" kanalını silmek istediğine emin misin?`)) return;
        try {
            await roomApi.deleteChannel(roomDbId, ch.id);
            setChannels(prev => prev.filter(c => c.id !== ch.id));
            if (activeChannelId === ch.id) {
                const fallback = channels.find(c => c.type === 'text' && c.id !== ch.id);
                setActiveChannelId(fallback?.id ?? null);
                setActiveChannelKey(fallback?.messageKey ?? roomId);
            }
        } catch (e) { alert(e instanceof Error ? e.message : 'Kanal silinemedi.'); }
    };

    const textChannels = channels.filter(c => c.type === 'text');
    const voiceChannels = channels.filter(c => c.type === 'voice');

    const [messageInput, setMessageInput] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
    const [isTyping, setIsTyping] = useState(false);
    // Yalnizca sekme basligini beslediginden ref: state olsaydi her gelen
    // mesajda bu bilesen bos yere yeniden render olurdu.
    const unreadCount = useRef(0);
    const isPageVisible = useRef(true);
    const originalTitle = useRef(document.title);
    const notificationPermission = useRef<NotificationPermission>('default');
    // Pagination
    const [displayCount, setDisplayCount] = useState(50);
    const chatScrollRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const messageIdCounter = useRef(0);
    // Emoji picker
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    // Mesaj düzenleme / yanıtlama
    const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
    const [editText, setEditText] = useState('');
    const [replyingToMessage, setReplyingToMessage] = useState<Message | null>(null);
    // Dosya yükleme
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5098';

    const { playJoinSound, playLeaveSound, playSendSound, playReceiveSound } = useAudioNotifications();
    const voice = useVoiceChannel();
    const { settings } = useSettings();

    // Tema — koyu tema değişkenleri (ChatRoom ile aynı varsayılan)
    useEffect(() => {
        const root = document.documentElement;
        root.classList.remove('theme-dark', 'theme-light', 'theme-oled');
        root.classList.add('theme-dark');
        root.style.setProperty('--color-bg-base', '#0f1117');
        root.style.setProperty('--color-bg-surface', '#161b27');
        root.style.setProperty('--color-bg-card', '#1a2035');
        root.style.setProperty('--color-text-main', '#e8eaf0');
        root.style.setProperty('--color-text-muted', '#5c6380');
        root.style.setProperty('--color-border-main', '#242b3d');
    }, []);

    // SignalR event'leri
    useEffect(() => {
        let isMounted = true;

        const handleUserJoined = (u: string, connId: string) => {
            if (!isMounted) return;
            playJoinSound();
            setMessages(prev => [...prev, { id: ++messageIdCounter.current, username: 'System', text: `${u} odaya katıldı.`, type: 'system', timestamp: Date.now() }]);
            setUsersInRoom(prev => prev.find(x => x.connectionId === connId) ? prev : [...prev, { username: u, connectionId: connId }]);
            // Yeni katılan kalıcı üye tablosuna eklendi → listeyi tazele (ayrılınca çevrimdışı görünsün)
            refreshMembers();
        };

        const handleUserLeft = (u: string, connId: string) => {
            if (!isMounted) return;
            playLeaveSound();
            setMessages(prev => [...prev, { id: ++messageIdCounter.current, username: 'System', text: `${u} odadan ayrıldı.`, type: 'system', timestamp: Date.now() }]);
            setUsersInRoom(prev => prev.filter(x => x.connectionId !== connId));
            setTypingUsers(prev => { const n = new Set(prev); n.delete(u); return n; });
        };

        const handleReceiveMessage = (u: string, senderAvatarId: string, m: string, serverId: number, timestamp: number, replyToId?: number) => {
            if (!isMounted) return;
            if (u === username) {
                setMessages(prev => prev.map(msg =>
                    msg.pending && msg.username === username && msg.text === m
                        ? { ...msg, serverId: serverId || undefined, timestamp, pending: false }
                        : msg
                ));
                return;
            }
            playReceiveSound();
            setMessages(prev => [...prev, {
                id: timestamp,
                serverId: serverId || undefined,
                username: u,
                avatarId: senderAvatarId,
                text: m,
                type: 'message',
                timestamp,
                replyToId
            }]);
            setTypingUsers(prev => { const n = new Set(prev); n.delete(u); return n; });
        };

        const handleMessageIdAssigned = (timestamp: number, serverId: number) => {
            if (!isMounted) return;
            setMessages(prev => prev.map(msg =>
                msg.timestamp === timestamp ? { ...msg, id: serverId, serverId } : msg
            ));
        };

        const handleRoomUsers = (usersDict: Record<string, { username: string; avatarId: string; userId?: string; role?: string }>) => {
            if (!isMounted) return;
            setUsersInRoom(Object.entries(usersDict || {}).map(([connId, data]) => ({ connectionId: connId, username: data.username, avatarId: data.avatarId, userId: data.userId, role: data.role })));
        };

        const handleRoomHistory = (history: { id: number; username: string; avatarId: string; text: string; timestamp: number; isEdited?: boolean; fileUrl?: string; fileName?: string; replyToId?: number }[]) => {
            if (!isMounted) return;
            setMessages((history || []).map(m => ({
                id: m.id,
                serverId: m.id,
                username: m.username,
                avatarId: m.avatarId,
                text: m.text,
                type: 'message' as const,
                timestamp: m.timestamp,
                isEdited: m.isEdited,
                fileUrl: m.fileUrl ?? undefined,
                fileName: m.fileName ?? undefined,
                replyToId: m.replyToId ?? undefined
            })));
        };

        const handleMessageDeleted = (messageId: number) => {
            if (!isMounted) return;
            setMessages(prev => prev.filter(m => m.serverId !== messageId));
        };

        const handleMessageEdited = (messageId: number, newText: string) => {
            if (!isMounted) return;
            setMessages(prev => prev.map(m =>
                m.serverId === messageId ? { ...m, text: newText, isEdited: true } : m
            ));
        };

        const handleReceiveFileMessage = (u: string, fileUrl: string, fileName: string, serverId: number, timestamp: number) => {
            if (!isMounted) return;
            if (u === username) {
                setMessages(prev => prev.map(msg =>
                    msg.pending && msg.username === username && msg.fileUrl === fileUrl
                        ? { ...msg, serverId: serverId || undefined, timestamp, pending: false }
                        : msg
                ));
                return;
            }
            playReceiveSound();
            setMessages(prev => [...prev, {
                id: timestamp,
                serverId: serverId || undefined,
                username: u,
                text: `[Dosya: ${fileName}]`,
                type: 'message',
                timestamp,
                fileUrl,
                fileName,
            }]);
        };

        const handleForceDisconnect = (message: string) => {
            alert(message);
            onLeave();
            window.location.reload();
        };

        // ===== Rol sistemi (Özellik 6) =====
        let wasBanned = false;
        const handleMemberBanned = (_roomId: number, uId: string) => {
            if (uId === myUserId) wasBanned = true;
        };
        const handleMemberKicked = (_roomId: number, uId: string) => {
            if (!isMounted) return;
            if (uId === myUserId) {
                alert(wasBanned ? 'Bu odadan yasaklandınız.' : 'Odadan atıldınız.');
                onLeave();
            } else {
                setUsersInRoom(prev => prev.filter(u => u.userId !== uId));
            }
        };
        const handleMemberRoleChanged = (uId: string, role: string) => {
            if (!isMounted) return;
            setUsersInRoom(prev => prev.map(u => u.userId === uId ? { ...u, role } : u));
        };
        const handleJoinRejected = (reason: string) => {
            alert(reason === 'banned' ? 'Bu odaya girişiniz yasaklı.' : 'Odaya giriş reddedildi.');
            onLeave();
        };

        signalrService.onForceDisconnect(handleForceDisconnect);
        signalrService.onMemberBanned(handleMemberBanned);
        signalrService.onMemberKicked(handleMemberKicked);
        signalrService.onMemberRoleChanged(handleMemberRoleChanged);
        signalrService.onJoinRejected(handleJoinRejected);
        signalrService.onUserJoined(handleUserJoined);
        signalrService.onUserLeft(handleUserLeft);
        signalrService.onReceiveMessage(handleReceiveMessage);
        signalrService.onMessageIdAssigned(handleMessageIdAssigned);
        signalrService.onRoomUsers(handleRoomUsers);
        signalrService.onRoomHistory(handleRoomHistory);
        signalrService.onMessageDeleted(handleMessageDeleted);
        signalrService.onMessageEdited(handleMessageEdited);
        signalrService.onReceiveFileMessage(handleReceiveFileMessage);

        setMessages([]); // kanal değişince eski mesajlar temizlenir, geçmiş yeniden yüklenir
        signalrService.startConnection(activeChannelKey, username);

        return () => {
            isMounted = false;
            signalrService.leaveRoom(activeChannelKey, username);
            signalrService.offForceDisconnect(handleForceDisconnect);
            signalrService.offUserJoined(handleUserJoined);
            signalrService.offUserLeft(handleUserLeft);
            signalrService.offReceiveMessage(handleReceiveMessage);
            signalrService.offMessageIdAssigned(handleMessageIdAssigned);
            signalrService.offRoomUsers(handleRoomUsers);
            signalrService.offRoomHistory(handleRoomHistory);
            signalrService.offMessageDeleted(handleMessageDeleted);
            signalrService.offMessageEdited(handleMessageEdited);
            signalrService.offReceiveFileMessage(handleReceiveFileMessage);
            signalrService.offMemberBanned(handleMemberBanned);
            signalrService.offMemberKicked(handleMemberKicked);
            signalrService.offMemberRoleChanged(handleMemberRoleChanged);
            signalrService.offJoinRejected(handleJoinRejected);
        };
    }, [activeChannelKey, username, myUserId, playJoinSound, playLeaveSound, playReceiveSound, onLeave]);

    // Mesaj kopyalama
    const handleCopyMessage = async (text: string, e: React.MouseEvent) => {
        try {
            await navigator.clipboard.writeText(text);
            const target = e.currentTarget as HTMLElement;
            target.classList.add('ring-2', 'ring-green-500', 'bg-green-500/10');
            setTimeout(() => {
                target.classList.remove('ring-2', 'ring-green-500', 'bg-green-500/10');
            }, 2000);
        } catch { /* pano erisimi yok */ }
    };

    // Sayfa görünürlüğü + tab title + bildirim izni
    useEffect(() => {
        if ('Notification' in window) {
            Notification.requestPermission().then(p => {
                notificationPermission.current = p;
            });
        }
        const handleVisibilityChange = () => {
            isPageVisible.current = !document.hidden;
            if (!document.hidden) {
                unreadCount.current = 0;
                document.title = originalTitle.current;
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, []);

    // Tab title ve push notification — yeni mesaj gelince
    useEffect(() => {
        if (messages.length === 0) return;
        const lastMsg = messages[messages.length - 1];
        if (lastMsg.type !== 'message' || lastMsg.username === username) return;
        if (document.hidden) {
            unreadCount.current += 1;
            document.title = `(${unreadCount.current}) SandalyeciMetin`;
            if (notificationPermission.current === 'granted') {
                new Notification(`${lastMsg.username}`, {
                    body: lastMsg.text.length > 60 ? lastMsg.text.slice(0, 60) + '...' : lastMsg.text,
                    icon: '/logo.png',
                    tag: 'chat-message',
                    silent: false,
                });
            }
        }
    }, [messages, username]);

    // Scroll bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Scroll to load more (pagination)
    const handleChatScroll = useCallback(() => {
        if (!chatScrollRef.current) return;
        if (chatScrollRef.current.scrollTop < 60) {
            setDisplayCount(prev => prev + 30);
        }
    }, []);

    // Yazıyor bildirimi (yerel)
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setMessageInput(e.target.value);
        if (!isTyping) setIsTyping(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 2000);
    };

    // Optimistic UI — mesaj gönder
    const handleSendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        if (!messageInput.trim()) return;
        const text = messageInput.trim();

        const tempId = ++messageIdCounter.current;
        setMessages(prev => [...prev, {
            id: tempId,
            username,
            avatarId,
            text,
            type: 'message',
            pending: true,
            timestamp: Date.now(),
            replyToId: replyingToMessage?.serverId || replyingToMessage?.id
        }]);

        playSendSound();
        setMessageInput('');
        setReplyingToMessage(null);

        signalrService.sendMessage(activeChannelKey, username, text, replyingToMessage?.serverId || replyingToMessage?.id);

        setTimeout(() => {
            setMessages(prev => prev.map(m => m.id === tempId ? { ...m, pending: false } : m));
        }, 500);
    };

    // Dosya yükleme
    const handleFileUpload = useCallback(async (file: File) => {
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

            const tempId = ++messageIdCounter.current;
            const isImage = /\.(jpeg|jpg|gif|png|webp)$/i.test(file.name);
            setMessages(prev => [...prev, {
                id: tempId,
                username,
                avatarId,
                text: isImage ? '' : `[Dosya: ${file.name}]`,
                type: 'message',
                pending: true,
                timestamp: Date.now(),
                fileUrl: data.url,
                fileName: file.name,
            }]);
            playSendSound();

            signalrService.sendFileMessage(activeChannelKey, username, data.url, file.name);
            setTimeout(() => {
                setMessages(prev => prev.map(m => m.id === tempId ? { ...m, pending: false } : m));
            }, 500);
        } catch (err) {
            console.error('Dosya yükleme hatası:', err);
            alert('Dosya yüklenemedi.');
        }
        setIsUploading(false);
    }, [activeChannelKey, username, avatarId, playSendSound, API_BASE_URL]);

    // Drag & drop
    const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
    const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);
    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) handleFileUpload(files[0]);
    }, [handleFileUpload]);
    const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFileUpload(file);
        e.target.value = '';
    }, [handleFileUpload]);

    // Mesaj düzenleme
    const handleStartEdit = useCallback((msg: Message) => {
        if (msg.serverId) {
            setEditingMessageId(msg.serverId);
            setEditText(msg.text);
        }
    }, []);
    const handleSaveEdit = useCallback(() => {
        if (editingMessageId && editText.trim()) {
            signalrService.editMessage(editingMessageId, editText.trim());
            setMessages(prev => prev.map(m =>
                m.serverId === editingMessageId ? { ...m, text: editText.trim(), isEdited: true } : m
            ));
        }
        setEditingMessageId(null);
        setEditText('');
    }, [editingMessageId, editText]);
    const handleCancelEdit = useCallback(() => {
        setEditingMessageId(null);
        setEditText('');
    }, []);

    // Emoji seçimi
    const handleEmojiSelect = useCallback((emoji: string) => {
        setMessageInput(prev => prev + emoji);
    }, []);

    // Mesaj filtresi (search)
    const filteredMessages = searchQuery.trim()
        ? messages.filter(m => m.type === 'message' && m.text.toLowerCase().includes(searchQuery.toLowerCase()))
        : messages;

    const visibleMessages = filteredMessages.slice(-displayCount);

    const containerVariants: Variants = {
        hidden: { opacity: 0, y: 10 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut', staggerChildren: 0.05, delayChildren: 0.1 } },
    };
    const itemVariants: Variants = {
        hidden: { opacity: 0, y: 10 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
    };

    const formatTime = (ts: number) => new Date(ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

    const renderTextWithLinks = (plainText: string, keyPrefix: string) => {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const textParts: React.ReactNode[] = [];
        let lastIdx = 0;
        let match;

        while ((match = urlRegex.exec(plainText)) !== null) {
            if (match.index > lastIdx) {
                textParts.push(<span key={`${keyPrefix}_t${lastIdx}`}>{plainText.slice(lastIdx, match.index)}</span>);
            }
            const url = match[0];
            const isImage = /\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i.test(url);
            if (isImage) {
                textParts.push(
                    <div key={`${keyPrefix}_img${match.index}`} className="my-2 max-w-[280px] sm:max-w-[400px]">
                        <a href={url} target="_blank" rel="noopener noreferrer" className="block w-fit">
                            <img src={url} alt="Kullanıcı Eki" className="w-full h-auto max-h-64 rounded-lg border border-border-main object-contain bg-black/20" loading="lazy" />
                        </a>
                    </div>
                );
            } else {
                textParts.push(
                    <a key={`${keyPrefix}_link${match.index}`} href={url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline underline-offset-2 break-all font-medium">
                        {url}
                    </a>
                );
            }
            lastIdx = match.index + url.length;
        }
        if (lastIdx < plainText.length) {
            textParts.push(<span key={`${keyPrefix}_t${lastIdx}`}>{plainText.slice(lastIdx)}</span>);
        }
        return textParts.length > 0 ? textParts : plainText;
    };

    // Kod bloğu renderer — `kod` veya ```kod``` formatını parse eder
    const renderMessageText = (text: string) => {
        const multiCodeRegex = /```([\s\S]*?)```/g;
        const inlineCodeRegex = /`([^`]+)`/g;

        const parts: React.ReactNode[] = [];
        let lastIndex = 0;
        let match;

        const segments: { start: number; end: number; code: string; inline: boolean }[] = [];
        while ((match = multiCodeRegex.exec(text)) !== null) {
            segments.push({ start: match.index, end: match.index + match[0].length, code: match[1], inline: false });
        }
        while ((match = inlineCodeRegex.exec(text)) !== null) {
            const inMulti = segments.some(s => match!.index >= s.start && match!.index < s.end);
            if (!inMulti) {
                segments.push({ start: match.index, end: match.index + match[0].length, code: match[1], inline: true });
            }
        }
        segments.sort((a, b) => a.start - b.start);

        segments.forEach((seg, i) => {
            if (seg.start > lastIndex) {
                parts.push(<React.Fragment key={`text${i}`}>{renderTextWithLinks(text.slice(lastIndex, seg.start), `txt_${i}`)}</React.Fragment>);
            }
            if (seg.inline) {
                parts.push(
                    <code key={`c${i}`} className="px-1.5 py-0.5 rounded-md text-[13px] font-mono"
                        style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.1)', color: '#a78bfa' }}>
                        {seg.code}
                    </code>
                );
            } else {
                parts.push(
                    <div key={`cb${i}`} className="mt-2 mb-1 rounded-xl overflow-hidden border border-border-main"
                        style={{ background: 'rgba(0,0,0,0.4)' }}>
                        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border-main"
                            style={{ background: 'rgba(0,0,0,0.2)' }}>
                            <div className="flex gap-1.5">
                                <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
                            </div>
                            <Code size={11} className="text-text-muted" />
                        </div>
                        <pre className="px-4 py-3 text-[12px] font-mono text-emerald-300 overflow-x-auto leading-relaxed whitespace-pre">
                            {seg.code.trim()}
                        </pre>
                    </div>
                );
            }
            lastIndex = seg.end;
        });

        if (lastIndex < text.length) {
            parts.push(<React.Fragment key="last">{renderTextWithLinks(text.slice(lastIndex), 'last')}</React.Fragment>);
        }
        return parts.length > 0 ? parts : text;
    };

    return (
        <div
            className="relative flex flex-col h-[100dvh] overflow-hidden bg-bg-base font-sans selection:bg-primary-main/30 selection:text-text-main"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {isDragging && (
                <div className="absolute inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center border-4 border-dashed border-primary-main/50 m-4 rounded-3xl pointer-events-none">
                    <div className="flex flex-col items-center gap-4 text-white">
                        <div className="w-20 h-20 bg-primary-main/20 rounded-full flex items-center justify-center">
                            <FileText size={40} className="text-primary-main animate-bounce" />
                        </div>
                        <h2 className="text-3xl font-bold">Dosyaları Buraya Bırak</h2>
                        <p className="text-white/70">10MB'a kadar resim veya belge yükleyebilirsin</p>
                    </div>
                </div>
            )}

            <motion.div variants={containerVariants} initial="hidden" animate="visible"
                className="relative z-10 flex flex-col h-full max-w-[1400px] mx-auto w-full p-4 sm:p-6 lg:p-8">

                {/* ===== HEADER ===== */}
                <motion.div variants={itemVariants}
                    className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4 mb-4 bg-bg-surface border border-border-main rounded-2xl shadow-card">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2.5 bg-bg-base rounded-[14px] border border-border-main shadow-sm">
                            <Hash className="text-primary-main" size={22} />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-[17px] font-semibold text-text-main tracking-tight leading-none mb-1 truncate">{roomInfo?.name || roomId}</h2>
                            <span className="text-[12px] text-text-muted flex items-center gap-1.5">
                                {roomInfo?.description
                                    ? <span className="flex items-center gap-1"><Info size={11} /> {roomInfo.description}</span>
                                    : 'Yazı Kanalı'}
                                {roomInfo?.createdBy && roomInfo.createdBy !== 'system' && (
                                    <span className="text-text-muted/70">· Kurucu: {roomInfo.createdBy}</span>
                                )}
                            </span>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {/* Arama */}
                        <div className="relative flex items-center">
                            <AnimatePresence>
                                {showSearch && (
                                    <motion.input initial={{ width: 0, opacity: 0 }} animate={{ width: 180, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
                                        value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Mesajlarda ara..."
                                        className="bg-bg-base border border-border-main rounded-xl px-3 py-2 text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary-main mr-2" autoFocus />
                                )}
                            </AnimatePresence>
                            <button onClick={() => { setShowSearch(p => !p); setSearchQuery(''); }}
                                className="flex items-center justify-center p-2.5 rounded-xl border bg-bg-base border-border-main text-text-muted hover:text-primary-main hover:border-primary-main/40 transition-colors cursor-pointer">
                                {showSearch ? <X size={18} /> : <Search size={18} />}
                            </button>
                        </div>

                        {/* Oda ayarları — sadece kurucu */}
                        {myRole === 'owner' && (
                            <button onClick={() => setShowRoomSettings(true)} title="Oda ayarları"
                                className="flex items-center justify-center p-2.5 rounded-xl border bg-bg-base border-border-main text-text-muted hover:text-primary-main hover:border-primary-main/40 transition-colors cursor-pointer">
                                <Settings size={18} />
                            </button>
                        )}

                        {/* Ayrıl */}
                        <button onClick={onLeave}
                            className="flex items-center gap-2 px-4 py-2.5 bg-bg-base hover:bg-red-500/10 text-text-muted hover:text-red-500 border border-border-main hover:border-red-500/30 rounded-xl text-sm font-semibold transition-colors cursor-pointer">
                            <LogOut size={17} /><span className="hidden sm:inline">Ayrıl</span>
                        </button>
                    </div>
                </motion.div>

                <AnimatePresence>
                    {showRoomSettings && (
                        <RoomSettingsModal
                            roomDbId={roomDbId}
                            roomName={roomInfo?.name || roomId}
                            initialDescription={roomInfo?.description}
                            onClose={() => setShowRoomSettings(false)}
                        />
                    )}
                </AnimatePresence>

                {/* ===== İÇERİK ===== */}
                <div className="flex flex-1 overflow-hidden gap-6 mb-6">
                    {/* Kanal Sidebar (Özellik 8 — Faz 2b) */}
                    <motion.div variants={itemVariants} className="hidden md:flex w-60 flex-col bg-bg-card border border-border-main rounded-2xl shadow-card overflow-hidden shrink-0">
                        <div className="p-4 border-b border-border-main bg-bg-surface/30 flex items-center justify-between">
                            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider flex items-center gap-2"><Hash size={14} /> Kanallar</h3>
                            {canManageRoom && (
                                <button onClick={() => setShowAddChannel(v => !v)} title="Kanal ekle"
                                    className="p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-bg-surface transition-colors">
                                    <Plus size={16} />
                                </button>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto p-3 space-y-4 custom-scrollbar">
                            {/* Ekleme formu */}
                            <AnimatePresence>
                                {showAddChannel && canManageRoom && (
                                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                                        className="overflow-hidden">
                                        <div className="p-2.5 rounded-xl bg-bg-surface border border-border-main space-y-2">
                                            <input value={newChannelName} onChange={e => setNewChannelName(e.target.value)} maxLength={50}
                                                onKeyDown={e => { if (e.key === 'Enter') handleAddChannel(); if (e.key === 'Escape') setShowAddChannel(false); }}
                                                placeholder="kanal-adı" autoFocus
                                                className="w-full bg-bg-base border border-border-main rounded-lg px-2.5 py-1.5 text-[13px] text-text-main outline-none focus:border-primary-main" />
                                            <div className="flex gap-1.5">
                                                <button onClick={() => setNewChannelType('text')} className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[12px] font-medium border transition-colors ${newChannelType === 'text' ? 'bg-primary-main/15 border-primary-main/50 text-text-main' : 'border-border-main text-text-muted'}`}><Hash size={12} /> Metin</button>
                                                <button onClick={() => setNewChannelType('voice')} className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[12px] font-medium border transition-colors ${newChannelType === 'voice' ? 'bg-emerald-500/15 border-emerald-500/50 text-text-main' : 'border-border-main text-text-muted'}`}><Volume2 size={12} /> Ses</button>
                                            </div>
                                            <div className="flex gap-1.5">
                                                <button onClick={handleAddChannel} disabled={!newChannelName.trim()} className="flex-1 py-1.5 rounded-lg text-[12px] font-semibold text-white bg-primary-main disabled:opacity-40">Ekle</button>
                                                <button onClick={() => { setShowAddChannel(false); setNewChannelName(''); }} className="px-3 py-1.5 rounded-lg text-[12px] text-text-muted hover:text-text-main border border-border-main">İptal</button>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Metin kanalları */}
                            <div className="space-y-1">
                                <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted/70 px-1.5 mb-1">Metin Kanalları</div>
                                {textChannels.map(ch => (
                                    <div key={ch.id} className="group relative">
                                        <button onClick={() => switchChannel(ch)}
                                            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[14px] transition-colors ${ch.id === activeChannelId ? 'bg-primary-main/15 text-text-main font-medium' : 'text-text-muted hover:bg-bg-surface hover:text-text-main'}`}>
                                            <Hash size={15} className="shrink-0 opacity-70" />
                                            <span className="truncate">{ch.name}</span>
                                        </button>
                                        {canManageRoom && textChannels.length > 1 && (
                                            <button onClick={() => handleDeleteChannel(ch)} title="Kanalı sil"
                                                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Trash2 size={13} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Ses kanalları */}
                            {voiceChannels.length > 0 && (
                                <div className="space-y-1">
                                    <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted/70 px-1.5 mb-1">Ses Kanalları</div>
                                    {voiceChannels.map(ch => {
                                        const connected = voice.activeVoiceKey === ch.messageKey;
                                        return (
                                        <div key={ch.id} className="group relative">
                                            <button onClick={() => switchChannel(ch)}
                                                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[14px] transition-colors ${connected ? 'bg-emerald-500/15 text-text-main' : 'text-text-muted hover:bg-bg-surface hover:text-text-main'}`}>
                                                <Volume2 size={15} className={`shrink-0 ${connected ? 'text-emerald-400' : 'opacity-70'}`} />
                                                <span className="truncate">{ch.name}</span>
                                                {connected && <span className="ml-auto text-[10px] text-emerald-400 font-semibold">bağlı</span>}
                                            </button>
                                            {canManageRoom && (
                                                <button onClick={() => handleDeleteChannel(ch)} title="Kanalı sil"
                                                    className="absolute right-1.5 top-2 p-1 rounded-md text-text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Trash2 size={13} />
                                                </button>
                                            )}
                                            {/* Ses kanalındaki katılımcılar (Discord tarzı) */}
                                            {connected && voice.participants.length > 0 && (
                                                <div className="pl-7 pr-1 py-1 space-y-1">
                                                    <AnimatePresence>
                                                        {voice.participants.map(p => {
                                                            const speaking = voice.speakingConnIds.has(p.connectionId);
                                                            const failed = voice.connectionIssues.has(p.connectionId);
                                                            return (
                                                                <motion.div key={p.connectionId} layout
                                                                    initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }}
                                                                    className="flex items-center gap-1.5">
                                                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${failed ? 'bg-amber-400' : speaking ? 'bg-emerald-400' : 'bg-text-muted/40'}`} />
                                                                    <span className={`text-[12px] truncate max-w-[120px] ${failed ? 'text-amber-400/80' : speaking ? 'text-emerald-400' : 'text-text-muted'}`}>
                                                                        {p.username}{p.userId === myUserId ? ' (Sen)' : ''}
                                                                    </span>
                                                                    {failed && (
                                                                        <span title="Bu kisiyle ses baglantisi kurulamadi" className="text-[10px] text-amber-400/80 shrink-0">bağlanılamadı</span>
                                                                    )}
                                                                </motion.div>
                                                            );
                                                        })}
                                                    </AnimatePresence>
                                                </div>
                                            )}
                                        </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Ses kontrol çubuğu — bir ses kanalına bağlıyken */}
                        {voice.activeVoiceKey && (
                            <div className="p-2.5 border-t border-border-main bg-bg-surface/40 flex items-center gap-2">
                                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" style={{ boxShadow: '0 0 6px rgba(16,185,129,0.8)' }} />
                                    <span className="text-[12px] text-text-muted truncate">Sesli sohbet · {voice.participants.length}</span>
                                </div>
                                <button onClick={voice.toggleMute} title={voice.isMuted ? 'Mikrofonu aç' : 'Mikrofonu kapat'}
                                    className={`p-1.5 rounded-lg transition-colors ${voice.isMuted ? 'text-red-400 bg-red-500/10' : 'text-text-muted hover:text-text-main hover:bg-bg-surface'}`}>
                                    {voice.isMuted ? <MicOff size={16} /> : <Mic size={16} />}
                                </button>
                                <button onClick={voice.leaveVoice} title="Ses kanalından ayrıl"
                                    className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors">
                                    <PhoneOff size={16} />
                                </button>
                            </div>
                        )}
                    </motion.div>

                    {/* Uzak katılımcıların sesi (gizli audio öğeleri) */}
                    {Array.from(voice.remoteStreams.entries()).map(([connId, stream]) => (
                        <VoiceAudio key={connId} stream={stream} sinkId={settings.speakerId} />
                    ))}

                    {/* Chat alanı */}
                    <motion.div variants={itemVariants} className="flex-1 flex flex-col overflow-hidden bg-bg-card border border-border-main rounded-2xl shadow-card min-w-0">
                        <div ref={chatScrollRef} onScroll={handleChatScroll} className="relative flex-1 overflow-y-auto p-5 sm:p-6 custom-scrollbar">
                            {visibleMessages.length === 0 && !searchQuery && (
                                <div className="absolute inset-0 flex items-center justify-center flex-col gap-4 pointer-events-none">
                                    <div className="p-4 bg-bg-surface rounded-2xl border border-border-main shadow-sm"><Send size={32} className="text-text-muted" /></div>
                                    <span className="text-text-muted font-medium text-sm">İlk mesajı sen gönder...</span>
                                </div>
                            )}
                            <div className="space-y-6">
                                <AnimatePresence initial={false}>
                                    {visibleMessages.map((msg) => {
                                        if (msg.type === 'system') return (
                                            <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} key={msg.id} className="flex justify-center my-4">
                                                <span className="bg-bg-surface border border-border-main px-4 py-1.5 rounded-[12px] text-[12px] text-text-muted shadow-sm">{msg.text}</span>
                                            </motion.div>
                                        );
                                        const isMine = msg.username === username;
                                        return (
                                            <motion.div initial={{ opacity: 0, scale: 0.98, y: 5 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.2 }} key={msg.id}
                                                className={`flex w-full ${isMine ? 'justify-end' : 'justify-start'}`}>
                                                <div className={`flex max-w-[85%] sm:max-w-[75%] gap-3 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                                                    <div className="w-10 h-10 mt-1 rounded-full bg-bg-surface flex flex-shrink-0 items-center justify-center border-2 border-[#7C3AED] shadow-[0_0_10px_rgba(124,58,237,0.2)] overflow-hidden text-xl">
                                                        {renderAvatar(msg.avatarId || (isMine ? avatarId : 'default'))}
                                                    </div>
                                                    <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                                                        <span className="text-[12px] text-text-muted mb-1.5 mx-1 font-medium">
                                                            {isMine ? 'Sen' : msg.username} · {formatTime(msg.timestamp)}
                                                        </span>

                                                        {msg.replyToId && (() => {
                                                            const replyMsg = messages.find(m => m.serverId === msg.replyToId || m.id === msg.replyToId);
                                                            if (replyMsg) {
                                                                return (
                                                                    <div className={`flex items-center gap-1.5 mb-1 text-[11px] text-text-muted cursor-pointer hover:text-text-main transition-colors ${isMine ? 'justify-end' : 'justify-start'}`} onClick={() => {
                                                                        const el = document.getElementById(`text-msg-${replyMsg.id}`);
                                                                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                                    }}>
                                                                        <div className="w-3 h-3 rounded border-l border-t border-border-main ml-1 opacity-60" />
                                                                        <span className="font-semibold">{replyMsg.username === username ? 'Sen' : replyMsg.username}</span>
                                                                        <span className="truncate max-w-[120px]">{replyMsg.text}</span>
                                                                    </div>
                                                                );
                                                            }
                                                            return null;
                                                        })()}

                                                        <div className="relative group/msg" id={`text-msg-${msg.id}`}>
                                                            <div className={`px-5 py-3.5 rounded-2xl shadow-sm transition-opacity ${msg.pending ? 'opacity-60' : 'opacity-100'} ${isMine ? 'bg-[linear-gradient(135deg,#7C3AED,#8B5CF6)] text-white rounded-tr-sm' : 'bg-bg-surface border border-border-main text-text-main rounded-tl-sm'}`}>
                                                                {msg.fileUrl && <MessageFileAttachment fileUrl={msg.fileUrl} fileName={msg.fileName} onDark={isMine} />}
                                                                {(!msg.fileUrl || !msg.text.startsWith('[Dosya:')) && msg.text && (
                                                                    <div className="whitespace-pre-wrap text-[15px] leading-relaxed break-words cursor-pointer transition-all duration-200 p-1 rounded" title="Kopyalamak için tıkla" onClick={(e) => handleCopyMessage(msg.text, e)}>{renderMessageText(msg.text)}</div>
                                                                )}
                                                            </div>
                                                            <div className={`absolute -top-7 ${isMine ? 'right-0' : 'left-0'} opacity-0 group-hover/msg:opacity-100 transition-opacity duration-150 pointer-events-none z-10`}>
                                                                <div className="px-2 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap"
                                                                    style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                                                    {new Date(msg.timestamp).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                                    {msg.isEdited && ' (Düzenlendi)'}
                                                                    {msg.pending && ' · gönderiliyor...'}
                                                                </div>
                                                            </div>
                                                            <div className={`absolute -top-3 ${isMine ? '-left-16' : '-right-8'} opacity-0 group-hover/msg:opacity-100 transition-opacity duration-150 flex gap-1 z-20`}>
                                                                {isMine && msg.serverId && !msg.pending && (
                                                                    <button onClick={() => handleStartEdit(msg)} className="w-6 h-6 rounded-full bg-blue-500/80 hover:bg-blue-500 flex items-center justify-center cursor-pointer" title="Düzenle">
                                                                        <Pencil size={11} className="text-white" />
                                                                    </button>
                                                                )}
                                                                {isMine && msg.serverId && !msg.pending && (
                                                                    <button onClick={() => signalrService.deleteMessage(msg.serverId!)} className="w-6 h-6 rounded-full bg-red-500/80 hover:bg-red-500 flex items-center justify-center cursor-pointer" title="Mesajı sil">
                                                                        <X size={10} className="text-white" />
                                                                    </button>
                                                                )}
                                                                {!isMine && canManageRoom && msg.serverId && !msg.pending && (
                                                                    <button onClick={() => signalrService.deleteMessage(msg.serverId!)} className="w-6 h-6 rounded-full bg-red-500/80 hover:bg-red-500 flex items-center justify-center cursor-pointer" title="Mesajı sil (yönetici)">
                                                                        <X size={10} className="text-white" />
                                                                    </button>
                                                                )}
                                                                {!msg.pending && (
                                                                    <button onClick={() => setReplyingToMessage(msg)} className="w-6 h-6 rounded-full bg-bg-surface border border-border-main hover:bg-border-main flex items-center justify-center cursor-pointer" title="Yanıtla">
                                                                        <Reply size={12} className="text-text-main" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </AnimatePresence>
                                <AnimatePresence>
                                    {typingUsers.size > 0 && (
                                        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-2 px-1">
                                            <div className="flex gap-1">
                                                {[0, 1, 2].map(i => <motion.div key={i} className="w-2 h-2 rounded-full bg-text-muted" animate={{ y: [0, -5, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }} />)}
                                            </div>
                                            <span className="text-[13px] text-text-muted">{[...typingUsers].join(', ')} yazıyor...</span>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                                <div ref={messagesEndRef} className="h-2" />
                            </div>
                        </div>
                    </motion.div>

                    {/* Katılanlar Sidebar — çevrimiçi/çevrimdışı (Özellik 9) */}
                    <motion.div variants={itemVariants} className="hidden md:flex w-72 flex-col bg-bg-card border border-border-main rounded-2xl shadow-card overflow-hidden shrink-0">
                        <div className="p-5 border-b border-border-main bg-bg-surface/30">
                            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider flex items-center justify-between gap-2">
                                <span className="flex items-center gap-2"><Users size={14} /> Odaya Katılanlar</span>
                                <span className="bg-bg-surface px-2.5 py-1 rounded-[8px] border border-border-main text-text-main font-semibold text-[12px]">
                                    {merged.length || 1}
                                </span>
                            </h3>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                            {/* Çevrimiçi */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 px-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" style={{ boxShadow: '0 0 6px rgba(16,185,129,0.8)' }} />
                                    <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400/90">Çevrimiçi — {onlineMembers.length}</span>
                                </div>
                                <AnimatePresence>
                                    {onlineMembers.map(renderMemberRow)}
                                </AnimatePresence>
                            </div>

                            {/* Çevrimdışı */}
                            {offlineMembers.length > 0 && (
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 px-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                                        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Çevrimdışı — {offlineMembers.length}</span>
                                    </div>
                                    <AnimatePresence>
                                        {offlineMembers.map(renderMemberRow)}
                                    </AnimatePresence>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>

                {/* Mesaj input */}
                <motion.div variants={itemVariants} className="relative sticky bottom-0 z-20 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-bg-base pt-2">
                    {editingMessageId && (
                        <div className="absolute -top-12 left-0 right-0 flex items-center justify-between bg-bg-surface px-4 py-2.5 rounded-xl border border-primary-main/30 shadow-lg text-sm z-10">
                            <span className="text-primary-main flex items-center gap-2 font-medium"><Pencil size={14} /> Mesajı düzenliyorsun</span>
                            <button type="button" onClick={handleCancelEdit} className="text-text-muted hover:text-text-main p-1 cursor-pointer"><X size={14} /></button>
                        </div>
                    )}
                    {!editingMessageId && replyingToMessage && (
                        <div className="absolute -top-12 left-0 right-0 flex items-center justify-between bg-bg-surface px-4 py-2.5 rounded-xl border border-primary-main/30 shadow-lg text-sm z-10">
                            <span className="text-primary-main flex items-center gap-2 font-medium"><Reply size={14} /> {replyingToMessage.username} yanıtlanıyor: <span className="text-text-muted truncate max-w-[150px]">{replyingToMessage.text}</span></span>
                            <button type="button" onClick={() => setReplyingToMessage(null)} className="text-text-muted hover:text-text-main p-1 cursor-pointer"><X size={14} /></button>
                        </div>
                    )}
                    <form onSubmit={editingMessageId ? handleSaveEdit : handleSendMessage}
                        className="flex flex-row items-center p-2.5 bg-bg-surface border border-border-main rounded-2xl shadow-card focus-within:border-primary-main transition-all duration-200 relative z-20">

                        <button type="button" onClick={() => setShowEmojiPicker(p => !p)} className="p-3 text-text-muted hover:text-text-main transition-colors cursor-pointer ml-1">
                            <Smile size={20} />
                        </button>
                        <button type="button" onClick={() => fileInputRef.current?.click()} className="p-3 text-text-muted hover:text-text-main transition-colors cursor-pointer">
                            <Paperclip size={20} />
                        </button>
                        <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileInputChange} />

                        <input type="text" value={editingMessageId ? editText : messageInput} onChange={e => editingMessageId ? setEditText(e.target.value) : handleInputChange(e)}
                            placeholder={isUploading ? "Dosya yükleniyor..." : "Sohbete mesajını yaz..."} disabled={isUploading}
                            className="w-full bg-transparent px-3 py-3.5 placeholder:text-text-muted text-text-main focus:outline-none text-[15px] flex-1" autoFocus />

                        <button type="submit" disabled={(editingMessageId ? !editText.trim() : !messageInput.trim()) || isUploading}
                            className="flex items-center justify-center px-4 sm:px-6 py-4 mr-1 rounded-xl bg-[linear-gradient(135deg,#7C3AED,#8B5CF6)] text-white font-semibold disabled:opacity-50 transition-all hover:-translate-y-[2px] hover:brightness-110 active:scale-[0.97] shadow-sm cursor-pointer min-w-[44px] min-h-[44px]">
                            {editingMessageId ? <Pencil size={18} className="mr-0 sm:mr-2" /> : <Send size={18} className="mr-0 sm:mr-2" />}
                            <span className="hidden sm:inline">{editingMessageId ? 'Kaydet' : 'Gönder'}</span>
                        </button>
                    </form>
                    <div className="absolute bottom-full mb-2 left-0 z-50">
                        <EmojiPicker isOpen={showEmojiPicker} onClose={() => setShowEmojiPicker(false)} onEmojiSelect={handleEmojiSelect} />
                    </div>
                </motion.div>
            </motion.div>
        </div>
    );
};

export default TextChatRoom;
