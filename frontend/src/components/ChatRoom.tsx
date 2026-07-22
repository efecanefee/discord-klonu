import React, { useState, useEffect, useRef, useCallback } from 'react';
import signalrService from '../services/signalrService';
import { useAudioNotifications } from '../hooks/useAudioNotifications';
import { Settings, LogOut, Send, Volume2, Mic, MicOff, VolumeX, Volume1, Camera, CameraOff, Monitor, MonitorOff, Search, X, Code, Smile, Paperclip, Pencil, FileText, Reply, Users, Music2, Youtube, ListPlus, Maximize2, Minimize2, PictureInPicture2 } from 'lucide-react';
import { useWebRTC } from '../hooks/useWebRTC';
import { useKeybinds } from '../hooks/useKeybinds';
import { motion, AnimatePresence } from 'framer-motion';
import type { Variants } from 'framer-motion';
import EmojiPicker from './EmojiPicker';
import SoundboardPanel from './SoundboardPanel';
import YoutubePlayerPanel from './YoutubePlayerPanel';
import MessageFileAttachment from './MessageFileAttachment';
import UserPopoverCard, { type PopoverUser } from './UserPopoverCard';
import PopoverPortal from './PopoverPortal';
import RoomSettingsModal from './RoomSettingsModal';
import { useSettings } from '../contexts/SettingsContext';
import { renderAvatar } from '../constants/avatars';
import { roomApi } from '../services/roomApi';
import { roleBadgeEmoji, sortByRole, roleRank } from '../utils/roles';
import { applySinkId } from '../utils/audioOutput';
import { parseMentions, containsMention, getActiveMentionQuery } from '../utils/mentions';
import MentionAutocomplete from './MentionAutocomplete';
import { notify } from '../utils/browserNotifications';
import { getLastRead, setLastRead } from '../utils/lastRead';
import ReactionChips, { type ReactionGroup } from './ReactionChips';

interface ChatRoomProps {
    username: string;
    avatarId?: string;
    roomId: string;
    roomDbId: number;
    myUserId: string;
    roomDescription?: string;
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
    reactions?: ReactionGroup[];
}

type UserStatus = 'online' | 'away' | 'busy' | 'music';
const STATUS_LABELS: Record<UserStatus, string> = {
    online: 'Çevrimiçi',
    away: 'Uzakta',
    busy: 'Meşgul',
    music: 'Müzik Dinliyor',
};
const STATUS_COLORS: Record<UserStatus, string> = {
    online: 'bg-emerald-500',
    away: 'bg-yellow-400',
    busy: 'bg-red-500',
    music: 'bg-purple-500',
};

const AudioPlayer: React.FC<{ stream: MediaStream; volume: number; sinkId: string }> = ({ stream, volume, sinkId }) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    useEffect(() => { if (audioRef.current) audioRef.current.srcObject = stream; }, [stream]);
    useEffect(() => { if (audioRef.current) audioRef.current.volume = volume; }, [volume]);
    useEffect(() => { applySinkId(audioRef.current, sinkId); }, [sinkId, stream]);
    return <audio ref={audioRef} autoPlay />;
};

const RemoteVideoPlayer: React.FC<{
    stream: MediaStream;
    label: string;
    volume?: number;                          // kişi başı ses (AudioPlayer üzerinden çalar)
    onVolumeChange?: (v: number) => void;
}> = ({ stream, label, volume, onVolumeChange }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
    }, [stream]);

    // Fullscreen state'i tarayıcı event'inden takip et (Esc ile çıkış dahil)
    useEffect(() => {
        const onFsChange = () => setIsFullscreen(document.fullscreenElement === containerRef.current);
        document.addEventListener('fullscreenchange', onFsChange);
        return () => document.removeEventListener('fullscreenchange', onFsChange);
    }, []);

    const toggleFullscreen = () => {
        if (document.fullscreenElement === containerRef.current) {
            document.exitFullscreen().catch(() => { /* yoksay */ });
        } else {
            containerRef.current?.requestFullscreen().catch(() => { /* desteklenmiyor */ });
        }
    };

    const togglePiP = async () => {
        try {
            if (document.pictureInPictureElement === videoRef.current) {
                await document.exitPictureInPicture();
            } else {
                await videoRef.current?.requestPictureInPicture();
            }
        } catch { /* PiP desteklenmiyor olabilir */ }
    };

    // Track değişimlerini dinle — video track eklenince/silinince re-render
    const [hasVideo, setHasVideo] = useState(() => stream.getVideoTracks().some(t => t.enabled && t.readyState === 'live'));

    useEffect(() => {
        const checkTracks = () => {
            setHasVideo(stream.getVideoTracks().some(t => t.enabled && t.readyState === 'live'));
        };
        stream.addEventListener('addtrack', checkTracks);
        stream.addEventListener('removetrack', checkTracks);
        // Track ended event'ini de dinle
        stream.getVideoTracks().forEach(t => t.addEventListener('ended', checkTracks));
        return () => {
            stream.removeEventListener('addtrack', checkTracks);
            stream.removeEventListener('removetrack', checkTracks);
        };
    }, [stream]);

    if (!hasVideo) return null;

    return (
        <div ref={containerRef} className="group/video relative w-full h-full flex justify-center items-center rounded-xl overflow-hidden border border-border-main bg-black">
            {/* Ses AudioPlayer'dan gelir — video muted, çift ses olmaz */}
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-contain" />
            <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 text-white text-xs rounded-lg backdrop-blur-sm flex items-center gap-1.5">
                {label}
            </div>

            {/* Meet tarzı hover kontrolleri: ses / PiP / tam ekran */}
            <div className="absolute bottom-2 right-2 flex items-center gap-1.5 opacity-0 group-hover/video:opacity-100 transition-opacity duration-150">
                {onVolumeChange && (
                    <div className="flex items-center gap-1.5 px-2 py-1.5 bg-black/60 rounded-lg backdrop-blur-sm">
                        {(volume ?? 1) === 0
                            ? <VolumeX size={14} className="text-red-400 shrink-0 cursor-pointer" onClick={() => onVolumeChange(1)} />
                            : <Volume2 size={14} className="text-white shrink-0 cursor-pointer" onClick={() => onVolumeChange(0)} />}
                        <input
                            type="range" min="0" max="1" step="0.01" value={volume ?? 1}
                            onChange={e => onVolumeChange(parseFloat(e.target.value))}
                            className="w-16 accent-white cursor-pointer"
                            title="Ses seviyesi"
                        />
                    </div>
                )}
                <button onClick={togglePiP} title="Küçük pencerede izle (PiP)"
                    className="p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-lg backdrop-blur-sm cursor-pointer">
                    <PictureInPicture2 size={14} />
                </button>
                <button onClick={toggleFullscreen} title={isFullscreen ? 'Tam ekrandan çık' : 'Tam ekran'}
                    className="p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-lg backdrop-blur-sm cursor-pointer">
                    {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </button>
            </div>
        </div>
    );
};

const ChatRoom: React.FC<ChatRoomProps> = ({ username, avatarId = 'default', roomId, roomDbId, myUserId, roomDescription, onLeave, onOpenDM, onOpenProfile }) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [usersInRoom, setUsersInRoom] = useState<{ connectionId: string; username: string; avatarId?: string; userId?: string; role?: string }[]>([]);
    const [popoverUserConnId, setPopoverUserConnId] = useState<string | null>(null);
    const [popoverAnchor, setPopoverAnchor] = useState<DOMRect | null>(null);

    // Rol sistemi (Özellik 6): mevcut kullanıcının bu odadaki rolü + yönetim işlemleri
    const myRole = usersInRoom.find(u => u.userId === myUserId)?.role;
    const canManageRoom = roleRank(myRole) >= 1; // owner veya moderator
    const sortedUsers = [...usersInRoom].sort(sortByRole);
    const [showRoomSettings, setShowRoomSettings] = useState(false);

    const handleSetModerator = async (uId: string, make: boolean) => {
        setPopoverUserConnId(null);
        try { await roomApi.setRole(roomDbId, uId, make ? 'moderator' : 'member'); }
        catch (e) { alert(e instanceof Error ? e.message : 'İşlem başarısız.'); }
    };
    const handleKickUser = async (uId: string) => {
        setPopoverUserConnId(null);
        try { await roomApi.kick(roomDbId, uId); }
        catch (e) { alert(e instanceof Error ? e.message : 'İşlem başarısız.'); }
    };
    const handleBanUser = async (uId: string) => {
        if (!window.confirm('Bu kullanıcıyı odadan yasaklamak istediğine emin misin?')) return;
        setPopoverUserConnId(null);
        try { await roomApi.ban(roomDbId, uId); }
        catch (e) { alert(e instanceof Error ? e.message : 'İşlem başarısız.'); }
    };
    const [messageInput, setMessageInput] = useState('');
    const [masterVolume, setMasterVolume] = useState(1.0);
    const [userVolumes, setUserVolumes] = useState<Record<string, number>>({});
    const [showDeviceMenu, setShowDeviceMenu] = useState(false);
    const [myStatus, setMyStatus] = useState<UserStatus>('online');
    const [showStatusMenu, setShowStatusMenu] = useState(false);
    const { settings, updateSettings } = useSettings();
    const [searchQuery, setSearchQuery] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    // Mobilde üye listesi masaüstündeki gibi yan panelde değil, kayan çekmecede açılır.
    const [showMobileMembers, setShowMobileMembers] = useState(false);
    const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
    const [isTyping, setIsTyping] = useState(false);
    // Yalnizca sekme basligini beslediginden ref: state olsaydi her gelen
    // mesajda bu bilesen bos yere yeniden render olurdu.
    const unreadCount = useRef(0);
    const isPageVisible = useRef(true);
    const originalTitle = useRef(document.title);
    // Pagination
    const [displayCount, setDisplayCount] = useState(50);
    const chatScrollRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Gelen "yazıyor" sinyalleri: kullanıcı başına 3sn'lik silme zamanlayıcısı
    const roomTypingTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
    // @mention autocomplete
    const [mentionQuery, setMentionQuery] = useState<{ start: number; query: string } | null>(null);
    const [mentionIndex, setMentionIndex] = useState(0);
    // "Yeni Mesajlar" ayracının üstünde duracağı mesajın id'si (history'den)
    const [firstUnreadId, setFirstUnreadId] = useState<number | null>(null);
    // Hangi mesajın hızlı emoji paleti açık (msg.id)
    const [reactionPickerFor, setReactionPickerFor] = useState<number | null>(null);
    const messageIdCounter = useRef(0);
    // Emoji picker
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    // Mesaj düzenleme
    const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
    const [editText, setEditText] = useState('');
    const [replyingToMessage, setReplyingToMessage] = useState<Message | null>(null);
    // Dosya yükleme
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    // Diğer kullanıcıların mute durumu
    const [mutedUsers, setMutedUsers] = useState<Record<string, boolean>>({});
    const [isTalking, setIsTalking] = useState(false);
    const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5098';

    const {
        localStream, remoteStreams, isMuted, toggleMute, setMicEnabled, isReady,
        localVideoStream, screenStream,
        isCameraOn, isScreenSharing,
        toggleCamera, toggleScreenShare,
        audioInputs, audioOutputs,
        selectedMicId, selectedOutputId,
        switchMicrophone, setSelectedOutputId,
        speakingUsers, connectionIssues,
        getMicLevel,
    } = useWebRTC();

    const { playJoinSound, playLeaveSound, playMuteSound, playUnmuteSound, playSendSound, playReceiveSound } = useAudioNotifications();

    // Oda içi gürültü kapısı çubuğu: cihaz menüsü açıkken aktif kapının
    // seviyesini oku (Ayarlar'daki gibi ek mikrofon stream'i AÇMADAN).
    const [inRoomMicLevel, setInRoomMicLevel] = useState(0);
    useEffect(() => {
        if (!showDeviceMenu || !settings.noiseGateEnabled) { setInRoomMicLevel(0); return; }
        let raf = 0;
        const loop = () => { setInRoomMicLevel(getMicLevel()); raf = requestAnimationFrame(loop); };
        loop();
        return () => cancelAnimationFrame(raf);
    }, [showDeviceMenu, settings.noiseGateEnabled, getMicLevel]);

    // ===== Soundboard + YouTube (yalnızca Ana Salon) =====
    const isAnaSalon = roomId === 'Ana Salon';
    const [showSoundboard, setShowSoundboard] = useState(false);
    const [showYoutubeInput, setShowYoutubeInput] = useState(false);
    const [youtubeUrlInput, setYoutubeUrlInput] = useState('');
    // SignalR effect'inin dep dizisine girmesinler diye ref üzerinden okunurlar
    const masterVolumeRef = useRef(masterVolume);
    useEffect(() => { masterVolumeRef.current = masterVolume; }, [masterVolume]);
    const outputIdRef = useRef(selectedOutputId);
    useEffect(() => { outputIdRef.current = selectedOutputId; }, [selectedOutputId]);
    // Üst üste binmesin diye çalan son soundboard sesi
    const soundboardAudioRef = useRef<HTMLAudioElement | null>(null);

    const handleStartYoutube = async () => {
        const match = youtubeUrlInput.match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([A-Za-z0-9_-]{11})/);
        if (!match) {
            alert('Geçerli bir YouTube linki yapıştır.');
            return;
        }
        try {
            await signalrService.startYoutube(roomId, match[1], 'video');
        } catch (err) {
            console.error('YouTube başlatma hatası:', err);
            alert('Başlatılamadı. Backend güncel değilse bir süre sonra tekrar dene.');
            return;
        }
        setYoutubeUrlInput('');
        setShowYoutubeInput(false);
    };

    // Linki kuyruğa ekle (çalan yoksa hub direkt başlatır)
    const handleEnqueueYoutube = async () => {
        const match = youtubeUrlInput.match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([A-Za-z0-9_-]{11})/);
        if (!match) {
            alert('Geçerli bir YouTube linki yapıştır.');
            return;
        }
        try {
            await signalrService.enqueueYoutube(roomId, match[1]);
        } catch (err) {
            console.error('Kuyruğa ekleme hatası:', err);
            alert('Kuyruğa eklenemedi. Backend güncel değilse bir süre sonra tekrar dene.');
            return;
        }
        setYoutubeUrlInput('');
        setShowYoutubeInput(false);
    };

    // SignalR event'leri
    useEffect(() => {
        if (!isReady) return;
        let isMounted = true;

        const handleUserJoined = (u: string, connId: string) => {
            if (!isMounted) return;
            playJoinSound();
            setMessages(prev => [...prev, { id: ++messageIdCounter.current, username: 'System', text: `${u} odaya katıldı.`, type: 'system', timestamp: Date.now() }]);
            setUsersInRoom(prev => prev.find(x => x.connectionId === connId) ? prev : [...prev, { username: u, connectionId: connId }]);
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
                // Optimistic mesajın pending'ini kaldır, serverId'sini güncelle
                setMessages(prev => prev.map(msg =>
                    msg.pending && msg.username === username && msg.text === m
                        ? { ...msg, serverId: serverId || undefined, timestamp, pending: false }
                        : msg
                ));
                return;
            }
            playReceiveSound();
            setMessages(prev => [...prev, {
                id: timestamp, // serverId=0 gelirse timestamp'i geçici ID olarak kullan
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
            // Geçici timestamp ID'si ile gönderilmiş mesajın gerçek DB ID'sini güncelle
            setMessages(prev => prev.map(msg =>
                msg.timestamp === timestamp ? { ...msg, id: serverId, serverId } : msg
            ));
        };

        const handleRoomUsers = (usersDict: Record<string, { username: string; avatarId: string; userId?: string; role?: string }>) => {
            if (!isMounted) return;
            setUsersInRoom(Object.entries(usersDict || {}).map(([connId, data]) => ({ connectionId: connId, username: data.username, avatarId: data.avatarId, userId: data.userId, role: data.role })));
        };

        const handleRoomHistory = (history: { id: number; username: string; avatarId: string; text: string; timestamp: number; isEdited?: boolean; fileUrl?: string; fileName?: string; replyToId?: number; reactions?: ReactionGroup[] | null }[]) => {
            if (!isMounted) return;
            // "Yeni Mesajlar" ayracı: son okunandan yeni İLK yabancı mesaj —
            // bir kez hesaplanır, canlı mesajlarla kaymaz.
            const lastRead = getLastRead(roomId);
            const firstUnread = (history || []).find(m => m.timestamp > lastRead && m.username !== username);
            setFirstUnreadId(firstUnread ? firstUnread.id : null);
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
                replyToId: m.replyToId ?? undefined,
                reactions: m.reactions ?? undefined
            })));
        };

        // Bir mesajın tepki seti güncellendi (tam set gelir — idempotent)
        const handleReactionUpdated = (messageId: number, reactions: ReactionGroup[]) => {
            if (!isMounted) return;
            setMessages(prev => prev.map(m => m.serverId === messageId ? { ...m, reactions } : m));
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

        const handleUserMuteChanged = (uName: string, connectionId: string, muted: boolean) => {
            if (!isMounted) return;
            console.log(`[WebRTC] UserMuteChanged alındı: ${uName} (${connectionId}) -> ${muted ? 'Muted' : 'Unmuted'}`);
            setMutedUsers(prev => ({ ...prev, [connectionId]: muted }));
        };

        const handleRoomMuteStates = (muteStates: Record<string, boolean>) => {
            if (!isMounted) return;
            setMutedUsers(muteStates);
        };

        // signalrService.onTyping?.(handleTyping);

        const handleForceDisconnect = (message: string) => {
            alert(message);
            onLeave();
            window.location.reload();
        };
        signalrService.onForceDisconnect(handleForceDisconnect);

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
        signalrService.onMemberBanned(handleMemberBanned);
        signalrService.onMemberKicked(handleMemberKicked);
        signalrService.onMemberRoleChanged(handleMemberRoleChanged);
        signalrService.onJoinRejected(handleJoinRejected);

        // ===== Soundboard (yalnızca Ana Salon) =====
        const handleSoundPlayed = (u: string, soundUrl: string, soundName: string) => {
            if (!isMounted) return;
            try {
                soundboardAudioRef.current?.pause();
                const audio = new Audio(soundUrl);
                audio.volume = masterVolumeRef.current;
                applySinkId(audio, outputIdRef.current);
                soundboardAudioRef.current = audio;
                audio.play().catch(() => { /* autoplay engellenmiş olabilir */ });
            } catch { /* geçersiz URL vb. — yoksay */ }
            setMessages(prev => [...prev, { id: ++messageIdCounter.current, username: 'System', text: `${u} bir ses çaldı: ${soundName} 🔊`, type: 'system', timestamp: Date.now() }]);
        };
        if (roomId === 'Ana Salon') signalrService.onSoundPlayed(handleSoundPlayed);

        // Oda içi "yazıyor..." — 3sn sinyal gelmezse listeden düş
        const handleRoomUserTyping = (u: string) => {
            if (!isMounted || u === username) return;
            setTypingUsers(prev => prev.has(u) ? prev : new Set(prev).add(u));
            const timeouts = roomTypingTimeoutsRef.current;
            const existing = timeouts.get(u);
            if (existing) clearTimeout(existing);
            timeouts.set(u, setTimeout(() => {
                timeouts.delete(u);
                setTypingUsers(prev => {
                    if (!prev.has(u)) return prev;
                    const next = new Set(prev);
                    next.delete(u);
                    return next;
                });
            }, 3000));
        };
        signalrService.onRoomUserTyping(handleRoomUserTyping);
        signalrService.onReactionUpdated(handleReactionUpdated);

        signalrService.onUserJoined(handleUserJoined);
        signalrService.onUserLeft(handleUserLeft);
        signalrService.onReceiveMessage(handleReceiveMessage);
        signalrService.onMessageIdAssigned(handleMessageIdAssigned);
        signalrService.onRoomUsers(handleRoomUsers);
        signalrService.onRoomHistory(handleRoomHistory);
        signalrService.onMessageDeleted(handleMessageDeleted);
        signalrService.onMessageEdited(handleMessageEdited);
        signalrService.onReceiveFileMessage(handleReceiveFileMessage);
        signalrService.onUserMuteChanged(handleUserMuteChanged);
        signalrService.onRoomMuteStates(handleRoomMuteStates);

        signalrService.startConnection(roomId, username);

        return () => {
            isMounted = false;
            signalrService.leaveRoom(roomId, username);
            soundboardAudioRef.current?.pause();
            roomTypingTimeoutsRef.current.forEach(t => clearTimeout(t));
            roomTypingTimeoutsRef.current.clear();
            signalrService.offRoomUserTyping(handleRoomUserTyping);
            signalrService.offReactionUpdated(handleReactionUpdated);
            signalrService.offSoundPlayed(handleSoundPlayed);
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
            signalrService.offUserMuteChanged(handleUserMuteChanged);
            signalrService.offRoomMuteStates(handleRoomMuteStates);
            signalrService.offMemberBanned(handleMemberBanned);
            signalrService.offMemberKicked(handleMemberKicked);
            signalrService.offMemberRoleChanged(handleMemberRoleChanged);
            signalrService.offJoinRejected(handleJoinRejected);
        };
    }, [roomId, username, isReady, playJoinSound, playLeaveSound, playReceiveSound]);

    // Kamera önizleme
    useEffect(() => {
        if (localVideoRef.current && localVideoStream) localVideoRef.current.srcObject = localVideoStream;
    }, [localVideoStream]);

    // Mikrofon görselleştirme
    useEffect(() => {
        if (!localStream || isMuted) {
            setIsTalking(false);
            return;
        }
        let animationId: number;
        try {
            const audioCtx = new window.AudioContext();
            const source = audioCtx.createMediaStreamSource(localStream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            
            const checkAudioLevel = () => {
                analyser.getByteFrequencyData(dataArray);
                const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
                setIsTalking(avg > 10);
                animationId = requestAnimationFrame(checkAudioLevel);
            };
            checkAudioLevel();
        } catch (err) {
            console.error('[WebRTC] Analyser hatası:', err);
        }
        return () => { if (animationId) cancelAnimationFrame(animationId); };
    }, [localStream, isMuted]);

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

    // Ses testi
    const handleAudioTest = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const testAudio = new Audio();
            testAudio.srcObject = stream;
            testAudio.play();
            alert("Ses testi başladı. 5 saniye boyunca kendi sesinizi duyacaksınız.");
            setTimeout(() => {
                stream.getTracks().forEach(t => t.stop());
                alert("Ses testi bitti.");
            }, 5000);
        } catch {
            alert("Mikrofona erişilemedi.");
        }
    };

    // Sayfa görünürlüğü + tab title (bildirim izni ayarlardaki toggle'dan istenir)
    useEffect(() => {
        const handleVisibilityChange = () => {
            isPageVisible.current = !document.hidden;
            if (!document.hidden) {
                // Sekme aktif olunca unread sıfırla
                unreadCount.current = 0;
                document.title = originalTitle.current;
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, []);

    // Tab title ve tarayıcı bildirimi — yeni mesaj gelince (sekme gizliyken)
    useEffect(() => {
        if (messages.length === 0) return;
        const lastMsg = messages[messages.length - 1];
        if (lastMsg.type !== 'message' || lastMsg.username === username) return;

        if (document.hidden) {
            // Tab title güncelle
            unreadCount.current += 1;
            document.title = `(${unreadCount.current}) SandalyeciMetin`;

            if (settings.pushNotificationsEnabled) {
                const mentioned = containsMention(lastMsg.text, username);
                notify(mentioned ? `${lastMsg.username} seni etiketledi` : lastMsg.username, lastMsg.text, { tag: mentioned ? 'mention' : 'chat-message' });
            }
        }
    }, [messages, username, settings.pushNotificationsEnabled]);

    // Görünürken gelen mesajlar okundu sayılır (ayraç bir sonraki girişte doğru olur)
    useEffect(() => {
        if (messages.length === 0) return;
        if (!document.hidden) setLastRead(roomId);
    }, [messages, roomId]);

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

    // Yazıyor bildirimi — isTyping true iken tekrar gönderilmez (~2sn throttle)
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setMessageInput(e.target.value);
        // @mention autocomplete: caret'e göre aktif sorguyu çıkar
        const q = getActiveMentionQuery(e.target.value, e.target.selectionStart ?? e.target.value.length);
        setMentionQuery(q);
        setMentionIndex(0);
        if (!isTyping) {
            setIsTyping(true);
            signalrService.sendRoomTyping(roomId).catch(() => { /* bağlantı yoksa sessiz geç */ });
        }
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 2000);
    };

    // @mention adayları — odadaki bağlı kullanıcılar, kendim hariç
    const mentionCandidates = mentionQuery === null ? [] : usersInRoom
        .filter(u => u.username !== username && u.username.toLowerCase().startsWith(mentionQuery.query.toLowerCase()))
        .slice(0, 8)
        .map(u => ({ username: u.username, avatarId: u.avatarId }));

    // Seçilen adayı input'a yaz: "@ad " + kalan metin (caret hesabı sorgudan)
    const handleSelectMention = (selected: string) => {
        if (mentionQuery === null) return;
        const end = mentionQuery.start + 1 + mentionQuery.query.length;
        setMessageInput(`${messageInput.slice(0, mentionQuery.start)}@${selected} ${messageInput.slice(end)}`);
        setMentionQuery(null);
    };

    // Dropdown açıkken ok tuşları/Enter/Tab/Esc input'ta yakalanır
    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (mentionQuery === null || mentionCandidates.length === 0) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => (i + 1) % mentionCandidates.length); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => (i - 1 + mentionCandidates.length) % mentionCandidates.length); }
        else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); handleSelectMention(mentionCandidates[mentionIndex].username); }
        else if (e.key === 'Escape') { setMentionQuery(null); }
    };

    // Optimistic UI — mesaj gönder
    const handleSendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        if (!messageInput.trim()) return;
        const text = messageInput.trim();

        // Anında ekrana yaz (optimistic)
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

        // Backend'e gönder — SignalR confirm gelince pending kaldır
        signalrService.sendMessage(roomId, username, text, replyingToMessage?.serverId || replyingToMessage?.id);

        // Backend confirm gelince pending flag'i kaldır
        // (SignalR handleReceiveMessage'da kendi mesajını da alıyorsan aşağıdaki satırı sil)
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

            // Optimistic
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

            // Backend'e gönder
            signalrService.sendFileMessage(roomId, username, data.url, file.name);
            setTimeout(() => {
                setMessages(prev => prev.map(m => m.id === tempId ? { ...m, pending: false } : m));
            }, 500);
        } catch (err) {
            console.error('Dosya yükleme hatası:', err);
            alert('Dosya yüklenemedi.');
        }
        setIsUploading(false);
    }, [roomId, username, playSendSound, API_BASE_URL]);

    // Drag & drop
    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);
    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);
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

    // Mute değişince diğerlerine bildir
    const handleToggleMute = useCallback(() => {
        const newMuted = !isMuted;
        toggleMute();
        if (newMuted) playMuteSound(); else playUnmuteSound();
        signalrService.notifyMuteStatus(roomId, newMuted);
    }, [isMuted, toggleMute, playMuteSound, playUnmuteSound, roomId]);

    // Bas-Konuş modu açık/kapandığında mikrofonun başlangıç durumunu ayarla
    useEffect(() => {
        if (!isReady) return;
        if (settings.pushToTalk) {
            // PTT açıkken mikrofon varsayılan olarak KAPALI; sadece tuş basılıyken açılır
            setMicEnabled(false);
            signalrService.notifyMuteStatus(roomId, true);
        } else {
            setMicEnabled(true);
            signalrService.notifyMuteStatus(roomId, false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [settings.pushToTalk, isReady]);

    // Global kısayollar: bas-konuş + mikrofon aç/kapat
    useKeybinds({
        pttEnabled: settings.pushToTalk,
        pttKey: settings.pttKey,
        muteToggleKey: settings.muteToggleKey,
        onPTTDown: () => { setMicEnabled(true); playUnmuteSound(); signalrService.notifyMuteStatus(roomId, false); },
        onPTTUp: () => { setMicEnabled(false); playMuteSound(); signalrService.notifyMuteStatus(roomId, true); },
        onMuteToggle: () => { handleToggleMute(); },
    });

    const hasRemoteVideo = Array.from(remoteStreams.values()).some(s => s.getVideoTracks().length > 0);
    const isMediaActive = isCameraOn || isScreenSharing || hasRemoteVideo;

    // Medya moduna girip çıkınca sohbet paneli farklı ağaçta yeniden mount olur
    // ve kaydırma en üste (en eskiye) düşer — en altta (en yenide) başlat.
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }, [isMediaActive]);

    // Mesaj filtresi (search)
    const filteredMessages = searchQuery.trim()
        ? messages.filter(m => m.type === 'message' && m.text.toLowerCase().includes(searchQuery.toLowerCase()))
        : messages;

    // Pagination — sadece son N mesajı göster
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

    // Düz metin parçasında @mention'ları vurgular (odadaki adlarla sınırlı)
    const renderWithMentions = (chunk: string, key: string) => {
        const segs = parseMentions(chunk, usersInRoom.map(u => u.username).concat(username));
        if (!segs.some(s => s.type === 'mention')) return <span key={key}>{chunk}</span>;
        return (
            <span key={key}>
                {segs.map((s, i) => s.type === 'mention'
                    ? <span key={i} className="px-1 py-0.5 rounded-md bg-primary-main/20 text-primary-main font-semibold">@{s.value}</span>
                    : <span key={i}>{s.value}</span>)}
            </span>
        );
    };

    const renderTextWithLinks = (plainText: string, keyPrefix: string) => {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const textParts: React.ReactNode[] = [];
        let lastIdx = 0;
        let match;

        while ((match = urlRegex.exec(plainText)) !== null) {
            if (match.index > lastIdx) {
                textParts.push(renderWithMentions(plainText.slice(lastIdx, match.index), `${keyPrefix}_t${lastIdx}`));
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
            textParts.push(renderWithMentions(plainText.slice(lastIdx), `${keyPrefix}_t${lastIdx}`));
        }

        return textParts.length > 0 ? textParts : plainText;
    };

    // Kod bloğu renderer — `kod` veya ```kod``` formatını parse eder
    const renderMessageText = (text: string) => {
        // Çok satırlı kod bloğu: ```...```
        const multiCodeRegex = /```([\s\S]*?)```/g;
        // Tek satır kod: `...`
        const inlineCodeRegex = /`([^`]+)`/g;

        const parts: React.ReactNode[] = [];
        let lastIndex = 0;
        let match;

        // Önce çok satırlı blokları işle
        const segments: { start: number; end: number; code: string; inline: boolean }[] = [];
        while ((match = multiCodeRegex.exec(text)) !== null) {
            segments.push({ start: match.index, end: match.index + match[0].length, code: match[1], inline: false });
        }
        while ((match = inlineCodeRegex.exec(text)) !== null) {
            // Çok satırlı bloğun içinde değilse ekle
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
                        style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--accent-light)' }}>
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
            {/* Audio streams */}
            {Array.from(remoteStreams.entries()).map(([connId, stream], idx) => {
                const userObj = usersInRoom.find(u => u.connectionId === connId);
                const uName = userObj?.username ?? 'Unknown';
                return <AudioPlayer key={idx} stream={stream} volume={masterVolume * (userVolumes[uName] ?? 1.0)} sinkId={selectedOutputId} />;
            })}

            {/* Senkron YouTube müzik oynatıcısı (yalnızca Ana Salon) */}
            {isAnaSalon && <YoutubePlayerPanel roomId={roomId} username={username} />}

            <motion.div variants={containerVariants} initial="hidden" animate="visible"
                className="relative z-10 flex flex-col h-full max-w-[1400px] mx-auto w-full p-4 sm:p-6 lg:p-8">

                {/* ===== HEADER ===== */}
                <motion.div variants={itemVariants}
                    className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4 mb-4 bg-bg-surface border border-border-main rounded-2xl shadow-card">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-bg-base rounded-[14px] border border-border-main shadow-sm">
                            <Users className="text-primary-main" size={22} />
                        </div>
                        <div>
                            <h2 className="text-[17px] font-semibold text-text-main tracking-tight leading-none mb-1">{roomId}</h2>
                            <span className="text-[12px] text-text-muted">Sohbet Odası</span>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {/* Kullanıcı adı + durum */}
                        <div className="relative">
                            <button onClick={() => setShowStatusMenu(p => !p)}
                                className={`hidden sm:flex items-center gap-2 px-3 py-2 bg-bg-base rounded-xl border cursor-pointer transition-all duration-300 ${isTalking ? 'border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.4)] scale-105' : 'border-border-main hover:border-primary-main/40'}`}>
                                <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[myStatus]} shadow-[0_0_6px_rgba(16,185,129,0.5)]`} />
                                <span className="text-sm text-text-main font-medium">{username}</span>
                            </button>
                            {showStatusMenu && (
                                <div className="absolute right-0 top-12 z-50 w-44 bg-bg-card border border-border-main rounded-xl shadow-2xl p-1.5">
                                    {(Object.keys(STATUS_LABELS) as UserStatus[]).map(s => (
                                        <button key={s} onClick={() => { setMyStatus(s); setShowStatusMenu(false); }}
                                            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer ${myStatus === s ? 'bg-primary-main/10 text-primary-main' : 'text-text-muted hover:text-text-main hover:bg-bg-surface'}`}>
                                            <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[s]}`} />
                                            {STATUS_LABELS[s]}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Cihaz ayarları */}
                        <div className="relative">
                            <button onClick={() => setShowDeviceMenu(p => !p)}
                                className="flex items-center justify-center p-2.5 rounded-xl border bg-bg-base border-border-main text-text-muted hover:text-primary-main hover:border-primary-main/40 transition-colors cursor-pointer">
                                <Settings size={18} />
                            </button>
                            {showDeviceMenu && (
                                <div className="absolute right-0 top-12 z-50 w-72 bg-bg-card border border-border-main rounded-2xl shadow-2xl p-4 space-y-4">
                                    <div>
                                        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Mikrofon</p>
                                        <select value={selectedMicId} onChange={e => switchMicrophone(e.target.value)}
                                            className="w-full bg-bg-surface border border-border-main text-text-main text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-primary-main cursor-pointer mb-3">
                                            {!audioInputs.some(d => d.deviceId === 'default') && <option value="default">Varsayılan Mikrofon</option>}
                                            {audioInputs.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
                                        </select>
                                        
                                        <label className="flex items-center justify-between cursor-pointer p-2 rounded-xl hover:bg-white/5 transition-colors">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-sm font-semibold text-text-main">Yankı ve Gürültü Filtresi</span>
                                                <span className="text-[10px] text-text-muted leading-tight">Yankı engelleme + fan/uğultu azaltma</span>
                                            </div>
                                            <div className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${settings.noiseSuppression ? 'bg-primary-main' : 'bg-white/10'}`}>
                                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.noiseSuppression ? 'translate-x-4' : 'translate-x-1'}`} />
                                            </div>
                                            <input type="checkbox" className="hidden" checked={settings.noiseSuppression} onChange={() => updateSettings({ noiseSuppression: !settings.noiseSuppression })} />
                                        </label>

                                        <label className="flex items-center justify-between cursor-pointer p-2 rounded-xl hover:bg-white/5 transition-colors">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-sm font-semibold text-text-main">Giriş Hassasiyeti</span>
                                                <span className="text-[10px] text-text-muted leading-tight">Eşik altındaki sesi tamamen keser</span>
                                            </div>
                                            <div className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${settings.noiseGateEnabled ? 'bg-primary-main' : 'bg-white/10'}`}>
                                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.noiseGateEnabled ? 'translate-x-4' : 'translate-x-1'}`} />
                                            </div>
                                            <input type="checkbox" className="hidden" checked={settings.noiseGateEnabled} onChange={() => updateSettings({ noiseGateEnabled: !settings.noiseGateEnabled })} />
                                        </label>

                                        {/* Eşik kaydırıcısı + canlı seviye — Ayarlar'daki kontrolün oda içi eşi */}
                                        {settings.noiseGateEnabled && (
                                            <div className="px-2 pt-1.5 pb-1 space-y-2">
                                                <div className="relative h-2 w-full rounded-full bg-black/40 overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-[width] duration-75 ${inRoomMicLevel >= settings.noiseGateThreshold ? 'bg-emerald-400' : 'bg-surface-subtle-strong'}`}
                                                        style={{ width: `${inRoomMicLevel}%` }}
                                                    />
                                                    <div
                                                        className="absolute top-0 bottom-0 w-0.5 bg-primary-main"
                                                        style={{ left: `${settings.noiseGateThreshold}%` }}
                                                    />
                                                </div>
                                                <input
                                                    type="range" min={0} max={100} step={1}
                                                    value={settings.noiseGateThreshold}
                                                    onChange={e => updateSettings({ noiseGateThreshold: Number(e.target.value) })}
                                                    className="w-full h-1.5 bg-black/40 rounded-full appearance-none cursor-pointer accent-primary-main"
                                                />
                                                <p className="text-[10px] text-text-muted leading-tight">
                                                    Konuşurken çubuk <b className="text-emerald-400">yeşile</b> dönmeli. Sesin kesiliyorsa eşiği azalt.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                    {audioOutputs.length > 0 && (
                                        <div>
                                            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Ses Çıkışı</p>
                                            <select value={selectedOutputId} onChange={e => setSelectedOutputId(e.target.value)}
                                                className="w-full bg-bg-surface border border-border-main text-text-main text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-primary-main cursor-pointer">
                                                {!audioOutputs.some(d => d.deviceId === 'default') && <option value="default">Varsayılan Çıkış</option>}
                                                {audioOutputs.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
                                            </select>
                                        </div>
                                    )}
                                    <button onClick={handleAudioTest} className="w-full py-2 bg-primary-main/20 text-primary-main hover:bg-primary-main/30 rounded-xl text-xs font-semibold transition-colors cursor-pointer mb-2">
                                        Sesimi Test Et
                                    </button>
                                    <button onClick={() => setShowDeviceMenu(false)}
                                        className="w-full py-2 text-xs text-text-muted hover:text-text-main transition-colors cursor-pointer">Kapat</button>
                                </div>
                            )}
                        </div>

                        {/* Kamera */}
                        <button onClick={toggleCamera}
                            className={`flex items-center justify-center p-2.5 rounded-xl border cursor-pointer transition-colors ${isCameraOn ? 'bg-primary-main/10 border-primary-main/30 text-primary-main' : 'bg-bg-base border-border-main text-text-muted hover:text-primary-main'}`}>
                            {isCameraOn ? <Camera size={18} /> : <CameraOff size={18} />}
                        </button>

                        {/* Ekran paylaşımı */}
                        <button onClick={toggleScreenShare}
                            className={`flex items-center justify-center p-2.5 rounded-xl border cursor-pointer transition-colors ${isScreenSharing ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' : 'bg-bg-base border-border-main text-text-muted hover:text-emerald-500'}`}>
                            {isScreenSharing ? <Monitor size={18} /> : <MonitorOff size={18} />}
                        </button>

                        {/* Mikrofon */}
                        <button onClick={handleToggleMute}
                            className={`flex items-center justify-center p-2.5 rounded-xl border cursor-pointer transition-colors ${isMuted ? 'bg-red-500/10 border-red-500/30 text-red-500' : 'bg-bg-base border-border-main text-text-main hover:text-primary-main'}`}>
                            {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
                        </button>

                        {isCameraOn && <video ref={localVideoRef} autoPlay muted className="w-9 h-9 rounded-xl object-cover border border-border-main" />}

                        {/* Oda ayarları — sadece kurucu */}
                        {myRole === 'owner' && (
                            <button onClick={() => setShowRoomSettings(true)} title="Oda ayarları"
                                className="flex items-center gap-2 px-3 py-2.5 bg-bg-base hover:bg-primary-main/10 text-text-muted hover:text-primary-main border border-border-main hover:border-primary-main/30 rounded-xl text-sm font-semibold transition-colors cursor-pointer">
                                <Settings size={17} />
                            </button>
                        )}

                        {/* Üyeler (yalnızca mobil, normal mod) — masaüstünde yan panel her zaman görünür */}
                        {!isMediaActive && (
                        <button onClick={() => setShowMobileMembers(true)} title="Odadakiler"
                            className="md:hidden flex items-center justify-center p-2.5 rounded-xl border bg-bg-base border-border-main text-text-muted hover:text-primary-main hover:border-primary-main/40 transition-colors cursor-pointer relative">
                            <Users size={18} />
                            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-primary-main text-white text-[10px] font-bold">
                                {Math.max(1, new Set(usersInRoom.map(u => u.username)).size)}
                            </span>
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
                            roomName={roomId}
                            initialDescription={roomDescription}
                            onClose={() => setShowRoomSettings(false)}
                        />
                    )}
                </AnimatePresence>

                {/* ===== MEDYA MODU ===== */}
                {isMediaActive ? (
                    <div className="flex flex-col lg:flex-row flex-1 overflow-hidden gap-4 mb-4">
                        <motion.div variants={itemVariants} className="flex-1 flex flex-col overflow-hidden bg-bg-card border border-border-main rounded-2xl shadow-card min-w-0">
                            <div className="relative flex-1 flex flex-col bg-black/40 rounded-2xl overflow-hidden">
                                <div className={`flex-1 grid gap-2 p-2 ${(() => {
                                    const total = (isCameraOn && !isScreenSharing ? 1 : 0) + (isScreenSharing ? 1 : 0) + Array.from(remoteStreams.values()).filter(s => s.getVideoTracks().length > 0).length;
                                    return total <= 1 ? 'grid-cols-1' : total <= 4 ? 'grid-cols-2' : 'grid-cols-3';
                                })()}`}>
                                    {screenStream && (
                                        <div className="relative rounded-xl overflow-hidden border border-border-main bg-black col-span-full">
                                            <video autoPlay muted className="w-full h-full object-contain" ref={el => { if (el) el.srcObject = screenStream; }} />
                                            <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 text-white text-xs rounded-lg">{username} (Ekran)</div>
                                            <div className="absolute top-3 right-3 flex items-center gap-1.5">
                                                <button
                                                    onClick={(e) => {
                                                        const el = (e.currentTarget as HTMLElement).closest('.relative') as HTMLElement | null;
                                                        if (document.fullscreenElement) document.exitFullscreen().catch(() => { /* yoksay */ });
                                                        else el?.requestFullscreen().catch(() => { /* desteklenmiyor */ });
                                                    }}
                                                    title="Tam ekran"
                                                    className="p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-lg cursor-pointer">
                                                    <Maximize2 size={14} />
                                                </button>
                                                <button onClick={toggleScreenShare} className="px-3 py-1.5 bg-red-500/90 hover:bg-red-600 text-white rounded-lg text-xs font-semibold cursor-pointer">Durdur</button>
                                            </div>
                                        </div>
                                    )}
                                    {isCameraOn && !isScreenSharing && (
                                        <div className="relative w-full h-full flex justify-center items-center rounded-xl overflow-hidden border border-border-main bg-black">
                                            <video ref={localVideoRef} autoPlay muted className="w-full h-full object-contain" />
                                            <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 text-white text-xs rounded-lg flex items-center gap-1.5 backdrop-blur-sm">
                                                {username} (Sen)
                                                {isMuted && <span title="Mikrofonun kapalı"><MicOff size={12} className="text-red-500" /></span>}
                                            </div>
                                        </div>
                                    )}
                                    {Array.from(remoteStreams.entries()).map(([connId, stream]) => {
                                        const uName = usersInRoom.find(u => u.connectionId === connId)?.username ?? 'Bilinmeyen';
                                        return (
                                            <div key={connId} className="relative">
                                                <RemoteVideoPlayer
                                                    stream={stream}
                                                    label={uName}
                                                    volume={userVolumes[uName] ?? 1.0}
                                                    onVolumeChange={(v) => setUserVolumes(prev => ({ ...prev, [uName]: v }))}
                                                />
                                                {mutedUsers[connId] && (
                                                    <div className="absolute top-2 right-2 px-1.5 py-1.5 bg-black/60 rounded-lg backdrop-blur-sm" title="Mikrofonu kapalı">
                                                        <MicOff size={14} className="text-red-500" />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                                {isCameraOn && isScreenSharing && (
                                    <div className="absolute bottom-4 right-4 w-48 h-36 rounded-xl overflow-hidden border-2 border-border-main shadow-2xl bg-black z-10 flex justify-center items-center">
                                        <video ref={localVideoRef} autoPlay muted className="w-full h-full object-contain" />
                                    </div>
                                )}
                            </div>
                        </motion.div>

                        {/* Kullanıcılar Sidebar (Medya Modunda) */}
                        <motion.div variants={itemVariants} className="hidden lg:flex w-48 flex-col bg-bg-card border border-border-main rounded-2xl shadow-card overflow-hidden shrink-0">
                            <div className="p-3 border-b border-border-main bg-bg-surface/30">
                                <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider flex items-center justify-between">
                                    <span>Odada</span>
                                    <span className="bg-bg-surface px-2 py-0.5 rounded-lg border border-border-main text-text-main font-semibold text-[11px]">
                                        {Math.max(1, new Set(usersInRoom.map(u => u.username)).size)}
                                    </span>
                                </h3>
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
                                {sortedUsers.map((u) => {
                                    const isSpeaking = [...speakingUsers].some(id => id === u.connectionId);
                                    const badge = roleBadgeEmoji(u.role);
                                    return (
                                        <div key={u.connectionId} className={`flex items-center gap-2 p-2 rounded-xl transition-colors ${isSpeaking ? 'bg-emerald-500/10 border border-emerald-500/30' : 'hover:bg-bg-surface'}`}>
                                            <div className={`w-7 h-7 rounded-full overflow-hidden flex items-center justify-center text-sm flex-shrink-0 ${isSpeaking ? 'ring-2 ring-emerald-500/60' : ''}`}>
                                                {renderAvatar(u.avatarId || 'default')}
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-xs font-medium text-text-main truncate flex items-center gap-1">{u.username} {badge && <span>{badge}</span>}</span>
                                                {connectionIssues.has(u.connectionId)
                                                    ? <span title="Ses baglantisi kurulamadi" className="text-[10px] text-amber-400/80">bağlanılamadı</span>
                                                    : mutedUsers[u.connectionId] && <MicOff size={10} className="text-red-400 mt-0.5" />}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </motion.div>

                        {/* Kompakt Chat */}
                        <motion.div variants={itemVariants} className="w-full lg:w-96 h-80 lg:h-auto flex flex-col bg-bg-card border border-border-main rounded-2xl shadow-card overflow-hidden shrink-0">
                            <div className="p-3 border-b border-border-main bg-bg-surface/30 flex items-center justify-between">
                                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Sohbet</span>
                                <div className="flex items-center gap-2">
                                    <span className="bg-bg-surface px-2 py-0.5 rounded-lg border border-border-main text-text-main font-semibold text-[11px]">{messages.filter(m => m.type === 'message').length}</span>
                                    <button onClick={() => setShowSearch(p => !p)} className="text-text-muted hover:text-text-main transition-colors cursor-pointer"><Search size={13} /></button>
                                </div>
                            </div>
                            {showSearch && (
                                <div className="px-3 pt-2">
                                    <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Mesajlarda ara..."
                                        className="w-full bg-bg-surface border border-border-main rounded-xl px-3 py-1.5 text-xs text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary-main" />
                                </div>
                            )}
                            <div ref={chatScrollRef} onScroll={handleChatScroll} className="relative flex-1 overflow-y-auto p-3 custom-scrollbar">
                                {visibleMessages.length === 0 && !searchQuery && (
                                    <div className="absolute inset-0 flex items-center justify-center flex-col gap-3 pointer-events-none">
                                        <Send size={24} className="text-text-muted" />
                                        <span className="text-text-muted font-medium text-xs">İlk mesajı sen gönder...</span>
                                    </div>
                                )}
                                <div className="space-y-3">
                                    <AnimatePresence initial={false}>
                                        {visibleMessages.map((msg) => {
                                            if (msg.type === 'system') return (
                                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} key={msg.id} className="flex justify-center my-2">
                                                    <span className="bg-bg-surface border border-border-main px-3 py-1 rounded-lg text-[11px] text-text-muted">{msg.text}</span>
                                                </motion.div>
                                            );
                                            const isMine = msg.username === username;
                                            return (
                                                <motion.div initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} key={msg.id}
                                                    className={`flex w-full ${isMine ? 'justify-end' : 'justify-start'}`}>
                                                    <div className={`flex max-w-[90%] gap-2 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                                                        <div className="w-7 h-7 mt-0.5 rounded-full bg-bg-surface flex flex-shrink-0 items-center justify-center border-2 border-primary-main shadow-[0_0_8px_rgba(var(--accent-rgb),0.2)] overflow-hidden text-sm">
                                                            {renderAvatar(msg.avatarId || (isMine ? avatarId : 'default'))}
                                                        </div>
                                                        <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                                                            <span className="text-[10px] text-text-muted mb-0.5 mx-0.5 font-medium">{isMine ? 'Sen' : msg.username} · {formatTime(msg.timestamp)}</span>
                                                            
                                                            {msg.replyToId && (() => {
                                                                const replyMsg = messages.find(m => m.serverId === msg.replyToId || m.id === msg.replyToId);
                                                                if (replyMsg) {
                                                                    return (
                                                                        <div className={`flex items-center gap-1 mb-0.5 text-[9px] text-text-muted cursor-pointer hover:text-text-main transition-colors ${isMine ? 'justify-end' : 'justify-start'}`} onClick={() => {
                                                                            const el = document.getElementById(`compact-msg-${replyMsg.id}`);
                                                                            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                                        }}>
                                                                            <div className="w-2 h-2 rounded border-l border-t border-border-main ml-0.5 opacity-60" />
                                                                            <span className="font-semibold">{replyMsg.username === username ? 'Sen' : replyMsg.username}</span>
                                                                            <span className="truncate max-w-[80px]">{replyMsg.text}</span>
                                                                        </div>
                                                                    );
                                                                }
                                                                return null;
                                                            })()}

                                                            <div className="relative group/msg" id={`compact-msg-${msg.id}`}>
                                                                <div className={`px-3 py-2 rounded-xl shadow-sm text-[13px] leading-snug transition-opacity ${msg.pending ? 'opacity-60' : 'opacity-100'} ${isMine ? 'bg-[linear-gradient(135deg,var(--color-primary-main),var(--accent-light))] text-white rounded-tr-sm' : containsMention(msg.text, username) ? 'bg-primary-main/20 border border-primary-main/50 text-text-main rounded-tl-sm' : 'bubble-in text-text-main rounded-tl-sm'}`}>
                                                                    {msg.fileUrl && <MessageFileAttachment fileUrl={msg.fileUrl} fileName={msg.fileName} onDark={isMine} />}
                                                                {(!msg.fileUrl || !msg.text.startsWith('[Dosya:')) && msg.text && (
                                                                    <div className="whitespace-pre-wrap break-words cursor-pointer transition-all duration-200 p-1 rounded" title="Kopyalamak için tıkla" onClick={(e) => handleCopyMessage(msg.text, e)}>{renderMessageText(msg.text)}</div>
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
                                                                            <>
                                                                                <button onClick={() => handleStartEdit(msg)} className="w-6 h-6 rounded-full bg-blue-500/80 hover:bg-blue-500 flex items-center justify-center cursor-pointer" title="Düzenle">
                                                                                    <Pencil size={11} className="text-white" />
                                                                                </button>
                                                                                <button onClick={() => signalrService.deleteMessage(msg.serverId!)} className="w-6 h-6 rounded-full bg-red-500/80 hover:bg-red-500 flex items-center justify-center cursor-pointer" title="Sil">
                                                                                    <X size={11} className="text-white" />
                                                                                </button>
                                                                            </>
                                                                        )}
                                                                        {!isMine && canManageRoom && msg.serverId && !msg.pending && (
                                                                            <button onClick={() => signalrService.deleteMessage(msg.serverId!)} className="w-6 h-6 rounded-full bg-red-500/80 hover:bg-red-500 flex items-center justify-center cursor-pointer" title="Sil (yönetici)">
                                                                                <X size={11} className="text-white" />
                                                                            </button>
                                                                        )}
                                                                        {!msg.pending && (
                                                                            <button onClick={() => setReplyingToMessage(msg)} className="w-6 h-6 rounded-full bg-bg-surface border border-border-main hover:bg-border-main flex items-center justify-center cursor-pointer" title="Yanıtla">
                                                                                <Reply size={11} className="text-text-main" />
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
                                    {/* Yazıyor göstergesi */}
                                    <AnimatePresence>
                                        {typingUsers.size > 0 && (
                                            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-2 px-1">
                                                <div className="flex gap-1">
                                                    {[0, 1, 2].map(i => <motion.div key={i} className="w-1.5 h-1.5 rounded-full bg-text-muted" animate={{ y: [0, -4, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }} />)}
                                                </div>
                                                <span className="text-[11px] text-text-muted">{[...typingUsers].join(', ')} yazıyor...</span>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                    <div ref={messagesEndRef} className="h-1" />
                                </div>
                            </div>
                            <div className="p-3 border-t border-border-main sticky bottom-0 z-20 bg-bg-card pb-[max(0.75rem,env(safe-area-inset-bottom))] relative">
                                {!editingMessageId && mentionQuery !== null && (
                                    <MentionAutocomplete candidates={mentionCandidates} activeIndex={mentionIndex} onSelect={handleSelectMention} onHover={setMentionIndex} />
                                )}
                                <form onSubmit={handleSendMessage} className="flex flex-col gap-2">
                                    {editingMessageId && (
                                        <div className="flex items-center justify-between bg-bg-surface px-3 py-1.5 rounded-lg border border-primary-main/30 text-xs">
                                            <span className="text-primary-main flex items-center gap-1.5"><Pencil size={12} /> Mesajı düzenliyorsun</span>
                                            <button type="button" onClick={handleCancelEdit} className="text-text-muted hover:text-text-main"><X size={12} /></button>
                                        </div>
                                    )}
                                    <div className="flex items-center gap-1.5">
                                        <button type="button" onClick={() => setShowEmojiPicker(p => !p)} className="p-2.5 text-text-muted hover:text-text-main cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center"><Smile size={20} /></button>
                                        <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2.5 text-text-muted hover:text-text-main cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center"><Paperclip size={20} /></button>
                                        <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileInputChange} />
                                        <input type="text" value={editingMessageId ? editText : messageInput} onChange={e => editingMessageId ? setEditText(e.target.value) : handleInputChange(e)}
                                            onKeyDown={editingMessageId ? undefined : handleInputKeyDown} onBlur={() => setMentionQuery(null)}
                                            placeholder={isUploading ? "Yükleniyor..." : "Mesaj yaz..."} disabled={isUploading}
                                            className="flex-1 bg-bg-surface border border-border-main rounded-xl px-3 py-3 text-[14px] text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary-main" autoFocus />
                                        <button type="button" onClick={editingMessageId ? handleSaveEdit : handleSendMessage} disabled={(editingMessageId ? !editText.trim() : !messageInput.trim()) || isUploading}
                                            className="p-3 rounded-xl bg-[linear-gradient(135deg,var(--color-primary-main),var(--accent-light))] text-white disabled:opacity-50 transition-all active:scale-95 cursor-pointer ml-1 min-w-[44px] min-h-[44px] flex items-center justify-center shadow-md">
                                            {editingMessageId ? <Pencil size={18} /> : <Send size={18} />}
                                        </button>
                                    </div>
                                </form>
                                <EmojiPicker isOpen={showEmojiPicker} onClose={() => setShowEmojiPicker(false)} onEmojiSelect={handleEmojiSelect} />
                            </div>
                        </motion.div>
                    </div>
                ) : (
                    /* ===== NORMAL MOD ===== */
                    <>
                        <div className="flex flex-1 overflow-hidden gap-6 mb-6">
                            {/* Chat alanı */}
                            <motion.div variants={itemVariants} className="flex-1 flex flex-col overflow-hidden bg-bg-card border border-border-main rounded-2xl shadow-card min-w-0">
                                {/* Arama */}
                                <div className="flex items-center justify-end px-5 pt-4 pb-0 gap-2">
                                    <AnimatePresence>
                                        {showSearch && (
                                            <motion.input initial={{ width: 0, opacity: 0 }} animate={{ width: 200, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
                                                value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Mesajlarda ara..."
                                                className="bg-bg-surface border border-border-main rounded-xl px-3 py-1.5 text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary-main" autoFocus />
                                        )}
                                    </AnimatePresence>
                                    <button onClick={() => { setShowSearch(p => !p); setSearchQuery(''); }}
                                        className="p-1.5 rounded-lg text-text-muted hover:text-text-main transition-colors cursor-pointer">
                                        {showSearch ? <X size={16} /> : <Search size={16} />}
                                    </button>
                                </div>

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
                                                // "Yeni Mesajlar" ayracı — son okunandan yeni ilk mesajın üstünde
                                                const unreadDivider = msg.serverId != null && msg.serverId === firstUnreadId && (
                                                    <div key={`unread-${msg.id}`} className="flex items-center gap-3 my-3" aria-label="Yeni mesajlar">
                                                        <div className="flex-1 h-px bg-red-400/50" />
                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">Yeni Mesajlar</span>
                                                        <div className="flex-1 h-px bg-red-400/50" />
                                                    </div>
                                                );
                                                if (msg.type === 'system') return (
                                                    <React.Fragment key={msg.id}>
                                                        {unreadDivider}
                                                        <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="flex justify-center my-4">
                                                            <span className="bg-bg-surface border border-border-main px-4 py-1.5 rounded-[12px] text-[12px] text-text-muted shadow-sm">{msg.text}</span>
                                                        </motion.div>
                                                    </React.Fragment>
                                                );
                                                const isMine = msg.username === username;
                                                return (
                                                    <React.Fragment key={msg.id}>
                                                    {unreadDivider}
                                                    <motion.div initial={{ opacity: 0, scale: 0.98, y: 5 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.2 }}
                                                        className={`flex w-full ${isMine ? 'justify-end' : 'justify-start'}`}>
                                                        <div className={`flex max-w-[85%] sm:max-w-[75%] gap-3 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                                                            <div className="w-10 h-10 mt-1 rounded-full bg-bg-surface flex flex-shrink-0 items-center justify-center border-2 border-primary-main shadow-[0_0_10px_rgba(var(--accent-rgb),0.2)] overflow-hidden text-xl">
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
                                                                                const el = document.getElementById(`room-msg-${replyMsg.id}`);
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

                                                                <div className="relative group/msg" id={`room-msg-${msg.id}`}>
                                                                    <div className={`px-5 py-3.5 rounded-2xl shadow-sm transition-opacity ${msg.pending ? 'opacity-60' : 'opacity-100'} ${isMine ? 'bg-[linear-gradient(135deg,var(--color-primary-main),var(--accent-light))] text-white rounded-tr-sm' : containsMention(msg.text, username) ? 'bg-primary-main/20 border border-primary-main/50 text-text-main rounded-tl-sm' : 'bubble-in text-text-main rounded-tl-sm'}`}>
                                                                        {msg.fileUrl && <MessageFileAttachment fileUrl={msg.fileUrl} fileName={msg.fileName} onDark={isMine} />}
                                                                    {(!msg.fileUrl || !msg.text.startsWith('[Dosya:')) && msg.text && (
                                                                        <div className="whitespace-pre-wrap text-[15px] leading-relaxed break-words cursor-pointer transition-all duration-200 p-1 rounded" title="Kopyalamak için tıkla" onClick={(e) => handleCopyMessage(msg.text, e)}>{renderMessageText(msg.text)}</div>
                                                                    )}
                                                                    </div>
                                                                    {/* Zaman damgası tooltip */}
                                                                    <div className={`absolute -top-7 ${isMine ? 'right-0' : 'left-0'} opacity-0 group-hover/msg:opacity-100 transition-opacity duration-150 pointer-events-none z-10`}>
                                                                        <div className="px-2 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap"
                                                                            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                                                            {new Date(msg.timestamp).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                                            {msg.pending && ' · gönderiliyor...'}
                                                                        </div>
                                                                    </div>
                                                                    <div className={`absolute -top-3 ${isMine ? '-left-16' : '-right-8'} opacity-0 group-hover/msg:opacity-100 transition-opacity duration-150 flex gap-1 z-20`}>
                                                                        {isMine && msg.serverId && !msg.pending && (
                                                                            <button
                                                                                onClick={() => handleStartEdit(msg)}
                                                                                className="w-6 h-6 rounded-full bg-blue-500/80 hover:bg-blue-500 flex items-center justify-center cursor-pointer"
                                                                                title="Düzenle"
                                                                            >
                                                                                <Pencil size={11} className="text-white" />
                                                                            </button>
                                                                        )}
                                                                        {isMine && msg.serverId && !msg.pending && (
                                                                            <button
                                                                                onClick={() => signalrService.deleteMessage(msg.serverId!)}
                                                                                className="w-6 h-6 rounded-full bg-red-500/80 hover:bg-red-500 flex items-center justify-center cursor-pointer"
                                                                                title="Mesajı sil"
                                                                            >
                                                                                <X size={10} className="text-white" />
                                                                            </button>
                                                                        )}
                                                                        {!isMine && canManageRoom && msg.serverId && !msg.pending && (
                                                                            <button
                                                                                onClick={() => signalrService.deleteMessage(msg.serverId!)}
                                                                                className="w-6 h-6 rounded-full bg-red-500/80 hover:bg-red-500 flex items-center justify-center cursor-pointer"
                                                                                title="Mesajı sil (yönetici)"
                                                                            >
                                                                                <X size={10} className="text-white" />
                                                                            </button>
                                                                        )}
                                                                        {!msg.pending && (
                                                                            <button
                                                                                onClick={() => setReplyingToMessage(msg)}
                                                                                className="w-6 h-6 rounded-full bg-bg-surface border border-border-main hover:bg-border-main flex items-center justify-center cursor-pointer"
                                                                                title="Yanıtla"
                                                                            >
                                                                                <Reply size={12} className="text-text-main" />
                                                                            </button>
                                                                        )}
                                                                        {msg.serverId && !msg.pending && (
                                                                            <div className="relative">
                                                                                <button onClick={() => setReactionPickerFor(p => p === msg.id ? null : msg.id)} className="w-6 h-6 rounded-full bg-bg-surface border border-border-main hover:bg-border-main flex items-center justify-center cursor-pointer" title="Tepki ekle">
                                                                                    <Smile size={12} className="text-text-main" />
                                                                                </button>
                                                                                {reactionPickerFor === msg.id && (
                                                                                    <div className="absolute bottom-full mb-1 right-0 flex gap-0.5 bg-bg-surface border border-border-main rounded-full px-1.5 py-1 shadow-xl z-30">
                                                                                        {['👍', '❤️', '😂', '😮', '😢', '🔥'].map(e => (
                                                                                            <button key={e} onClick={() => { signalrService.toggleReaction(roomId, msg.serverId!, e); setReactionPickerFor(null); }}
                                                                                                className="w-7 h-7 flex items-center justify-center text-[16px] rounded-full hover:bg-border-main transition-colors cursor-pointer">
                                                                                                {e}
                                                                                            </button>
                                                                                        ))}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                {msg.reactions && msg.serverId && (
                                                                    <ReactionChips reactions={msg.reactions} myUsername={username} onToggle={(e) => signalrService.toggleReaction(roomId, msg.serverId!, e)} />
                                                                )}
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                    </React.Fragment>
                                                );
                                            })}
                                        </AnimatePresence>
                                        {/* Yazıyor göstergesi */}
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

                            {/* Mobil çekmece karartması */}
                            <AnimatePresence>
                                {showMobileMembers && (
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                        onClick={() => setShowMobileMembers(false)}
                                        className="fixed inset-0 bg-black/60 z-40 md:hidden" />
                                )}
                            </AnimatePresence>

                            {/* Users Sidebar — masaüstünde sabit yan panel, mobilde sağdan kayan çekmece */}
                            <motion.div variants={itemVariants}
                                className={`flex-col bg-bg-card border border-border-main shadow-card overflow-hidden shrink-0
                                    md:static md:flex md:w-72 md:h-auto md:rounded-2xl md:z-auto md:translate-x-0 md:transition-none
                                    fixed top-0 right-0 h-[100dvh] w-[85%] max-w-xs z-50 border-l transition-transform duration-300 ease-out
                                    ${showMobileMembers ? 'flex translate-x-0' : 'flex translate-x-full md:translate-x-0'}`}>
                                <div className="p-5 border-b border-border-main bg-bg-surface/30">
                                    <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider flex items-center justify-between gap-2 mb-4">
                                        <span>Odada Olanlar</span>
                                        <div className="flex items-center gap-2">
                                            <span className="bg-bg-surface px-2.5 py-1 rounded-[8px] border border-border-main text-text-main font-semibold text-[12px]">
                                                {Math.max(1, new Set(usersInRoom.map(u => u.username)).size)}
                                            </span>
                                            <button onClick={() => setShowMobileMembers(false)} className="md:hidden p-1 rounded-lg text-text-muted hover:text-text-main hover:bg-bg-surface transition-colors" title="Kapat">
                                                <X size={16} />
                                            </button>
                                        </div>
                                    </h3>
                                    <div className="flex flex-col gap-2">
                                        <span className="text-[13px] text-text-muted font-medium">Sistem Sesi</span>
                                        <input type="range" min="0" max="1" step="0.01" value={masterVolume}
                                            onChange={e => setMasterVolume(parseFloat(e.target.value))}
                                            className="w-full h-1.5 bg-bg-base rounded-full appearance-none cursor-pointer accent-primary-main" />
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                                    <AnimatePresence>
                                        {sortedUsers.map((u) => {
                                            const isSpeaking = [...speakingUsers].some(id => id === u.connectionId);
                                            const badge = roleBadgeEmoji(u.role);
                                            return (
                                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} key={u.connectionId}
                                                    className="relative flex flex-col gap-2 p-3 rounded-[16px] border border-transparent hover:border-border-main hover:bg-bg-surface transition-colors duration-200">
                                                    <div className="flex items-center justify-between cursor-pointer"
                                                        onClick={(e) => { setPopoverAnchor(e.currentTarget.getBoundingClientRect()); setPopoverUserConnId(prev => prev === u.connectionId ? null : u.connectionId); }}>
                                                        <div className="flex items-center gap-3">
                                                            <div className="relative">
                                                                {/* Dalga animasyonu — konuşunca */}
                                                                <AnimatePresence>
                                                                    {isSpeaking && (
                                                                        <>
                                                                            <motion.div
                                                                                initial={{ scale: 1, opacity: 0.6 }}
                                                                                animate={{ scale: 1.8, opacity: 0 }}
                                                                                exit={{ opacity: 0 }}
                                                                                transition={{ duration: 1, repeat: Infinity, ease: 'easeOut' }}
                                                                                className="absolute inset-0 rounded-[12px] bg-emerald-500/30 z-0"
                                                                            />
                                                                            <motion.div
                                                                                initial={{ scale: 1, opacity: 0.4 }}
                                                                                animate={{ scale: 1.5, opacity: 0 }}
                                                                                exit={{ opacity: 0 }}
                                                                                transition={{ duration: 1, repeat: Infinity, ease: 'easeOut', delay: 0.2 }}
                                                                                className="absolute inset-0 rounded-[12px] bg-emerald-500/20 z-0"
                                                                            />
                                                                        </>
                                                                    )}
                                                                </AnimatePresence>
                                                                <div className={`relative z-10 w-10 h-10 rounded-full bg-bg-surface flex items-center justify-center overflow-hidden border-2 shadow-sm transition-all duration-150 text-xl ${isSpeaking ? 'border-emerald-500 shadow-[0_0_16px_rgba(16,185,129,0.5)]' : 'border-primary-main'}`}>
                                                                    {renderAvatar(u.avatarId || 'default')}
                                                                </div>
                                                                <div className={`absolute -bottom-1 -right-1 w-3 h-3 ${STATUS_COLORS[u.username === username ? myStatus : 'online']} rounded-full border-[2.5px] border-bg-card z-20`} />
                                                            </div>
                                                            <div>
                                                                <span className="font-semibold text-[14px] text-text-main truncate max-w-[110px] flex items-center gap-1">
                                                                    {u.username} {badge && <span title={u.role === 'owner' ? 'Kurucu' : 'Moderatör'}>{badge}</span>} {u.connectionId === signalrService.connectionId && <span className="text-[11px] text-text-muted font-normal">(Sen)</span>}
                                                                    {(u.connectionId === signalrService.connectionId ? isMuted : mutedUsers[u.connectionId]) && (
                                                                        <span title="Mikrofonu kapalı" className="flex items-center justify-center">
                                                                            <MicOff size={12} className="text-red-500 flex-shrink-0" />
                                                                        </span>
                                                                    )}
                                                                </span>
                                                                {connectionIssues.has(u.connectionId)
                                                                    ? <span title="Ses baglantisi kurulamadi — karsi taraf seni duyamiyor olabilir" className="text-[11px] text-amber-400/80">⚠ bağlanılamadı</span>
                                                                    : <span className="text-[11px] text-text-muted">{u.connectionId === signalrService.connectionId ? STATUS_LABELS[myStatus] : 'Çevrimiçi'}</span>}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {popoverUserConnId === u.connectionId && (
                                                        <PopoverPortal anchorRect={popoverAnchor} onClose={() => setPopoverUserConnId(null)}>
                                                            <UserPopoverCard
                                                                user={{ userId: u.userId, username: u.username, avatarId: u.avatarId, customStatus: 'online', role: u.role }}
                                                                isSelf={u.username === username}
                                                                viewerRole={myRole}
                                                                onSendMessage={() => { setPopoverUserConnId(null); onOpenDM?.({ userId: u.userId, username: u.username, avatarId: u.avatarId }); }}
                                                                onEditProfile={() => { setPopoverUserConnId(null); onOpenProfile?.(); }}
                                                                onSetModerator={u.userId ? (make) => handleSetModerator(u.userId!, make) : undefined}
                                                                onKick={u.userId ? () => handleKickUser(u.userId!) : undefined}
                                                                onBan={u.userId ? () => handleBanUser(u.userId!) : undefined}
                                                            />
                                                        </PopoverPortal>
                                                    )}

                                                    {u.username !== username && (
                                                        <div className="flex items-center gap-2 pl-[52px] pr-2 opacity-60 hover:opacity-100 transition-opacity">
                                                            {(userVolumes[u.username] ?? 1.0) === 0 ? <VolumeX size={14} className="text-text-muted" /> : <Volume1 size={14} className="text-text-muted" />}
                                                            <input type="range" min="0" max="1" step="0.01" value={userVolumes[u.username] ?? 1.0}
                                                                onChange={e => setUserVolumes(prev => ({ ...prev, [u.username]: parseFloat(e.target.value) }))}
                                                                className="w-full h-1 bg-bg-base rounded-full appearance-none cursor-pointer accent-primary-main" />
                                                            <Volume2 size={14} className="text-text-muted" />
                                                        </div>
                                                    )}
                                                </motion.div>
                                            );
                                        })}
                                    </AnimatePresence>
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
                                
                                <button type="button" onClick={() => { setShowEmojiPicker(p => !p); setShowSoundboard(false); setShowYoutubeInput(false); }} className="p-3 text-text-muted hover:text-text-main transition-colors cursor-pointer ml-1">
                                    <Smile size={20} />
                                </button>
                                <button type="button" onClick={() => fileInputRef.current?.click()} className="p-3 text-text-muted hover:text-text-main transition-colors cursor-pointer">
                                    <Paperclip size={20} />
                                </button>
                                <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileInputChange} />
                                {isAnaSalon && (
                                    <>
                                        <button type="button" onClick={() => { setShowSoundboard(p => !p); setShowYoutubeInput(false); setShowEmojiPicker(false); }} title="Soundboard" className={`p-3 transition-colors cursor-pointer ${showSoundboard ? 'text-primary-main' : 'text-text-muted hover:text-text-main'}`}>
                                            <Music2 size={20} />
                                        </button>
                                        <button type="button" onClick={() => { setShowYoutubeInput(p => !p); setShowSoundboard(false); setShowEmojiPicker(false); }} title="YouTube'dan müzik aç" className={`p-3 transition-colors cursor-pointer ${showYoutubeInput ? 'text-primary-main' : 'text-text-muted hover:text-text-main'}`}>
                                            <Youtube size={20} />
                                        </button>
                                    </>
                                )}
                                
                                <input type="text" value={editingMessageId ? editText : messageInput} onChange={e => editingMessageId ? setEditText(e.target.value) : handleInputChange(e)}
                                    onKeyDown={editingMessageId ? undefined : handleInputKeyDown} onBlur={() => setMentionQuery(null)}
                                    placeholder={isUploading ? "Dosya yükleniyor..." : "Sohbete mesajını yaz..."} disabled={isUploading}
                                    className="w-full bg-transparent px-3 py-3.5 placeholder:text-text-muted text-text-main focus:outline-none text-[15px] flex-1" autoFocus />
                                
                                <button type="submit" disabled={(editingMessageId ? !editText.trim() : !messageInput.trim()) || isUploading}
                                    className="flex items-center justify-center px-4 sm:px-6 py-4 mr-1 rounded-xl bg-[linear-gradient(135deg,var(--color-primary-main),var(--accent-light))] text-white font-semibold disabled:opacity-50 transition-all hover:-translate-y-[2px] hover:brightness-110 active:scale-[0.97] shadow-sm cursor-pointer min-w-[44px] min-h-[44px]">
                                    {editingMessageId ? <Pencil size={18} className="mr-0 sm:mr-2" /> : <Send size={18} className="mr-0 sm:mr-2" />}
                                    <span className="hidden sm:inline">{editingMessageId ? 'Kaydet' : 'Gönder'}</span>
                                </button>
                            </form>
                            <div className="absolute bottom-full mb-2 left-0 z-50">
                                <EmojiPicker isOpen={showEmojiPicker} onClose={() => setShowEmojiPicker(false)} onEmojiSelect={handleEmojiSelect} />
                            </div>
                            {!editingMessageId && mentionQuery !== null && (
                                <MentionAutocomplete candidates={mentionCandidates} activeIndex={mentionIndex} onSelect={handleSelectMention} onHover={setMentionIndex} />
                            )}
                            {isAnaSalon && (
                                <div className="absolute bottom-full mb-2 left-0 z-50">
                                    <SoundboardPanel isOpen={showSoundboard} onClose={() => setShowSoundboard(false)} roomId={roomId} apiBaseUrl={API_BASE_URL} />
                                </div>
                            )}
                            {isAnaSalon && showYoutubeInput && (
                                <div className="absolute bottom-full mb-2 left-0 z-50">
                                    <div className="flex flex-col gap-2 bg-bg-surface border border-border-main rounded-2xl shadow-2xl p-3 w-[320px] max-w-[calc(100vw-1.5rem)]">
                                        <div className="flex items-center gap-2">
                                            <Youtube size={18} className="text-red-500 shrink-0" />
                                            <input
                                                type="text"
                                                value={youtubeUrlInput}
                                                onChange={e => setYoutubeUrlInput(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') handleStartYoutube(); }}
                                                placeholder="YouTube linkini yapıştır..."
                                                autoFocus
                                                className="flex-1 min-w-0 bg-bg-base border border-border-main rounded-xl px-3 py-2 text-text-main text-sm outline-none focus:border-primary-main transition-colors"
                                            />
                                        </div>
                                        <div className="flex gap-2">
                                            <button type="button" onClick={() => handleStartYoutube()} disabled={!youtubeUrlInput.trim()}
                                                title="Odadakilere izleme partisi daveti gönderir; kabul edenler birlikte izler"
                                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/15 text-red-400 text-xs font-semibold hover:bg-red-500/25 transition-colors disabled:opacity-40">
                                                <Youtube size={14} /> Aç
                                            </button>
                                            <button type="button" onClick={() => handleEnqueueYoutube()} disabled={!youtubeUrlInput.trim()}
                                                title="Videoyu sıraya ekler; çalan bittiğinde otomatik geçilir"
                                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-primary-main/15 text-primary-main text-xs font-semibold hover:bg-primary-main/25 transition-colors disabled:opacity-40">
                                                <ListPlus size={14} /> Kuyruğa ekle
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    </>
                )}
            </motion.div>
        </div>
    );
};

export default ChatRoom;

