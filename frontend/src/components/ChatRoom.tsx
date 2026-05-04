import React, { useState, useEffect, useRef, useCallback } from 'react';
import signalrService from '../services/signalrService';
import { useAudioNotifications } from '../hooks/useAudioNotifications';
import { Send, Users, LogOut, Mic, MicOff, VolumeX, Volume1, Volume2, Camera, CameraOff, Monitor, MonitorOff, Settings, Search, X, Code } from 'lucide-react';
import { useWebRTC } from '../hooks/useWebRTC';
import { motion, AnimatePresence } from 'framer-motion';
import type { Variants } from 'framer-motion';

interface ChatRoomProps {
    username: string;
    roomId: string;
    onLeave: () => void;
}

interface Message {
    id: number;
    username: string;
    text: string;
    type: 'message' | 'system';
    pending?: boolean;
    timestamp: number;
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

const AudioPlayer: React.FC<{ stream: MediaStream; volume: number }> = ({ stream, volume }) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    useEffect(() => { if (audioRef.current) audioRef.current.srcObject = stream; }, [stream]);
    useEffect(() => { if (audioRef.current) audioRef.current.volume = volume; }, [volume]);
    return <audio ref={audioRef} autoPlay />;
};

const RemoteVideoPlayer: React.FC<{ stream: MediaStream; label: string }> = ({ stream, label }) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
    }, [stream]);

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
        <div className="relative rounded-xl overflow-hidden border border-border-main bg-black">
            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-contain" />
            <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 text-white text-xs rounded-lg backdrop-blur-sm">{label}</div>
        </div>
    );
};

// Tema
type Theme = 'dark' | 'light' | 'oled';
const THEMES: { id: Theme; label: string }[] = [
    { id: 'dark', label: 'Koyu' },
    { id: 'light', label: 'Açık' },
    { id: 'oled', label: 'OLED' },
];

const ChatRoom: React.FC<ChatRoomProps> = ({ username, roomId, onLeave }) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [usersInRoom, setUsersInRoom] = useState<{ connectionId: string; username: string }[]>([]);
    const [messageInput, setMessageInput] = useState('');
    const [masterVolume, setMasterVolume] = useState(1.0);
    const [userVolumes, setUserVolumes] = useState<Record<string, number>>({});
    const [showDeviceMenu, setShowDeviceMenu] = useState(false);
    const [theme, setTheme] = useState<Theme>('dark');
    const [myStatus, setMyStatus] = useState<UserStatus>('online');
    const [showStatusMenu, setShowStatusMenu] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
    const [isTyping, setIsTyping] = useState(false);
    const [_unreadCount, setUnreadCount] = useState(0);
    const isPageVisible = useRef(true);
    const originalTitle = useRef(document.title);
    const notificationPermission = useRef<NotificationPermission>('default');
    // Pagination
    const [displayCount, setDisplayCount] = useState(50);
    const chatScrollRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const messageIdCounter = useRef(0);

    const {
        remoteStreams, isMuted, toggleMute, isReady,
        localVideoStream, screenStream,
        isCameraOn, isScreenSharing,
        toggleCamera, toggleScreenShare,
        audioInputs, audioOutputs,
        selectedMicId, selectedOutputId,
        switchMicrophone, setSelectedOutputId,
        speakingUsers,
    } = useWebRTC();

    const { playJoinSound, playLeaveSound, playMuteSound, playUnmuteSound, playSendSound, playReceiveSound } = useAudioNotifications();

    // Tema uygula
    useEffect(() => {
        const root = document.documentElement;
        root.classList.remove('theme-dark', 'theme-light', 'theme-oled');
        root.classList.add(`theme-${theme}`);
        if (theme === 'light') {
            root.style.setProperty('--color-bg-base', '#f1f5f9');
            root.style.setProperty('--color-bg-surface', '#ffffff');
            root.style.setProperty('--color-bg-card', '#ffffff');
            root.style.setProperty('--color-text-main', '#0f172a');
            root.style.setProperty('--color-text-muted', '#64748b');
            root.style.setProperty('--color-border-main', '#e2e8f0');
        } else if (theme === 'oled') {
            root.style.setProperty('--color-bg-base', '#000000');
            root.style.setProperty('--color-bg-surface', '#0a0a0a');
            root.style.setProperty('--color-bg-card', '#0d0d0d');
            root.style.setProperty('--color-text-main', '#ffffff');
            root.style.setProperty('--color-text-muted', '#555555');
            root.style.setProperty('--color-border-main', '#1a1a1a');
        } else {
            root.style.setProperty('--color-bg-base', '#0f1117');
            root.style.setProperty('--color-bg-surface', '#161b27');
            root.style.setProperty('--color-bg-card', '#1a2035');
            root.style.setProperty('--color-text-main', '#e8eaf0');
            root.style.setProperty('--color-text-muted', '#5c6380');
            root.style.setProperty('--color-border-main', '#242b3d');
        }
    }, [theme]);

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

        const handleReceiveMessage = (u: string, m: string) => {
            if (!isMounted) return;
            if (u === username) return; // Optimistic update yapıldığı için kendi mesajımızı yoksayıyoruz
            playReceiveSound();
            setMessages(prev => [...prev, { id: ++messageIdCounter.current, username: u, text: m, type: 'message', timestamp: Date.now() }]);
            setTypingUsers(prev => { const n = new Set(prev); n.delete(u); return n; });
        };

        const handleRoomUsers = (usersDict: Record<string, string>) => {
            if (!isMounted) return;
            setUsersInRoom(Object.entries(usersDict).map(([connId, uName]) => ({ connectionId: connId, username: uName })));
        };

        // signalrService.onTyping?.(handleTyping);

        signalrService.onUserJoined(handleUserJoined);
        signalrService.onUserLeft(handleUserLeft);
        signalrService.onReceiveMessage(handleReceiveMessage);
        signalrService.onRoomUsers(handleRoomUsers);
        // Yazıyor eventi varsa: signalrService.onTyping?.(handleTyping);

        signalrService.startConnection(roomId, username);

        return () => {
            isMounted = false;
            // Odadan temiz çık — bağlantıyı kapatmadan sadece LeaveRoom'u çağır
            signalrService.leaveRoom(roomId, username);
            signalrService.offUserJoined(handleUserJoined);
            signalrService.offUserLeft(handleUserLeft);
            signalrService.offReceiveMessage(handleReceiveMessage);
            signalrService.offRoomUsers(handleRoomUsers);
        };
    }, [roomId, username, isReady, playJoinSound, playLeaveSound, playReceiveSound]);

    // Kamera önizleme
    useEffect(() => {
        if (localVideoRef.current && localVideoStream) localVideoRef.current.srcObject = localVideoStream;
    }, [localVideoStream]);

    // Sayfa görünürlüğü + tab title + bildirim izni
    useEffect(() => {
        // Bildirim izni iste
        if ('Notification' in window) {
            Notification.requestPermission().then(p => {
                notificationPermission.current = p;
            });
        }

        const handleVisibilityChange = () => {
            isPageVisible.current = !document.hidden;
            if (!document.hidden) {
                // Sekme aktif olunca unread sıfırla
                setUnreadCount(0);
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
            // Tab title güncelle
            setUnreadCount(prev => {
                const next = prev + 1;
                document.title = `(${next}) SandalyeciMetin`;
                return next;
            });

            // Push notification
            if (notificationPermission.current === 'granted') {
                new Notification(`${lastMsg.username}`, {
                    body: lastMsg.text.length > 60 ? lastMsg.text.slice(0, 60) + '...' : lastMsg.text,
                    icon: '/logo.png',
                    tag: 'chat-message', // Aynı tag ile gelenleri günceller, spam yapmaz
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

    // Yazıyor bildirimi
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setMessageInput(e.target.value);
        if (!isTyping) {
            setIsTyping(true);
            // signalrService.sendTyping?.(roomId, username); // SignalR'a typing gönder
        }
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 2000);
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
            text,
            type: 'message',
            pending: true,
            timestamp: Date.now(),
        }]);

        playSendSound();
        setMessageInput('');

        // Backend'e gönder — SignalR confirm gelince pending kaldır
        signalrService.sendMessage(roomId, username, text);

        // Backend confirm gelince pending flag'i kaldır
        // (SignalR handleReceiveMessage'da kendi mesajını da alıyorsan aşağıdaki satırı sil)
        setTimeout(() => {
            setMessages(prev => prev.map(m => m.id === tempId ? { ...m, pending: false } : m));
        }, 500);
    };

    const hasRemoteVideo = Array.from(remoteStreams.values()).some(s => s.getVideoTracks().length > 0);
    const isMediaActive = isCameraOn || isScreenSharing || hasRemoteVideo;

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
                parts.push(<span key={`t${i}`}>{text.slice(lastIndex, seg.start)}</span>);
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
            parts.push(<span key="last">{text.slice(lastIndex)}</span>);
        }

        return parts.length > 0 ? parts : text;
    };

    return (
        <div className="relative flex flex-col h-screen overflow-hidden bg-bg-base font-sans selection:bg-primary-main/30 selection:text-text-main">
            {/* Audio streams */}
            {Array.from(remoteStreams.entries()).map(([connId, stream], idx) => {
                const userObj = usersInRoom.find(u => u.connectionId === connId);
                const uName = userObj?.username ?? 'Unknown';
                return <AudioPlayer key={idx} stream={stream} volume={masterVolume * (userVolumes[uName] ?? 1.0)} />;
            })}

            <motion.div variants={containerVariants} initial="hidden" animate="visible"
                className="relative z-10 flex flex-col h-full max-w-[1400px] mx-auto w-full p-4 sm:p-6 lg:p-8">

                {/* ===== HEADER ===== */}
                <motion.div variants={itemVariants}
                    className="flex items-center justify-between p-4 mb-4 bg-bg-surface border border-border-main rounded-2xl shadow-card">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-bg-base rounded-[14px] border border-border-main shadow-sm">
                            <Users className="text-primary-main" size={22} />
                        </div>
                        <div>
                            <h2 className="text-[17px] font-semibold text-text-main tracking-tight leading-none mb-1">{roomId}</h2>
                            <span className="text-[12px] text-text-muted">Sohbet Odası</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Tema seçici */}
                        <div className="hidden sm:flex items-center gap-1 p-1 bg-bg-base rounded-xl border border-border-main">
                            {THEMES.map(t => (
                                <button key={t.id} onClick={() => setTheme(t.id)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${theme === t.id ? 'bg-primary-main text-white' : 'text-text-muted hover:text-text-main'}`}>
                                    {t.label}
                                </button>
                            ))}
                        </div>

                        {/* Kullanıcı adı + durum */}
                        <div className="relative">
                            <button onClick={() => setShowStatusMenu(p => !p)}
                                className="hidden sm:flex items-center gap-2 px-3 py-2 bg-bg-base rounded-xl border border-border-main cursor-pointer hover:border-primary-main/40 transition-colors">
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
                                            className="w-full bg-bg-surface border border-border-main text-text-main text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-primary-main cursor-pointer">
                                            {audioInputs.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
                                        </select>
                                    </div>
                                    {audioOutputs.length > 0 && (
                                        <div>
                                            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Ses Çıkışı</p>
                                            <select value={selectedOutputId} onChange={e => setSelectedOutputId(e.target.value)}
                                                className="w-full bg-bg-surface border border-border-main text-text-main text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-primary-main cursor-pointer">
                                                {audioOutputs.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
                                            </select>
                                        </div>
                                    )}
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
                        <button onClick={() => { isMuted ? playUnmuteSound() : playMuteSound(); toggleMute(); }}
                            className={`flex items-center justify-center p-2.5 rounded-xl border cursor-pointer transition-colors ${isMuted ? 'bg-red-500/10 border-red-500/30 text-red-500' : 'bg-bg-base border-border-main text-text-main hover:text-primary-main'}`}>
                            {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
                        </button>

                        {isCameraOn && <video ref={localVideoRef} autoPlay muted className="w-9 h-9 rounded-xl object-cover border border-border-main" />}

                        {/* Ayrıl */}
                        <button onClick={onLeave}
                            className="flex items-center gap-2 px-4 py-2.5 bg-bg-base hover:bg-red-500/10 text-text-muted hover:text-red-500 border border-border-main hover:border-red-500/30 rounded-xl text-sm font-semibold transition-colors cursor-pointer">
                            <LogOut size={17} /><span className="hidden sm:inline">Ayrıl</span>
                        </button>
                    </div>
                </motion.div>

                {/* ===== MEDYA MODU ===== */}
                {isMediaActive ? (
                    <div className="flex flex-1 overflow-hidden gap-4 mb-4">
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
                                            <button onClick={toggleScreenShare} className="absolute top-3 right-3 px-3 py-1.5 bg-red-500/90 hover:bg-red-600 text-white rounded-lg text-xs font-semibold cursor-pointer">Durdur</button>
                                        </div>
                                    )}
                                    {isCameraOn && !isScreenSharing && (
                                        <div className="relative rounded-xl overflow-hidden border border-border-main bg-black">
                                            <video ref={localVideoRef} autoPlay muted className="w-full h-full object-contain" />
                                            <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 text-white text-xs rounded-lg">{username} (Sen)</div>
                                        </div>
                                    )}
                                    {Array.from(remoteStreams.entries()).map(([connId, stream]) => {
                                        const uName = usersInRoom.find(u => u.connectionId === connId)?.username ?? 'Bilinmeyen';
                                        return <RemoteVideoPlayer key={connId} stream={stream} label={uName} />;
                                    })}
                                </div>
                                {isCameraOn && isScreenSharing && (
                                    <div className="absolute bottom-4 right-4 w-48 h-36 rounded-xl overflow-hidden border-2 border-border-main shadow-2xl bg-black z-10">
                                        <video ref={localVideoRef} autoPlay muted className="w-full h-full object-cover" />
                                    </div>
                                )}
                            </div>
                        </motion.div>

                        {/* Kompakt Chat */}
                        <motion.div variants={itemVariants} className="w-80 lg:w-96 flex flex-col bg-bg-card border border-border-main rounded-2xl shadow-card overflow-hidden shrink-0">
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
                                                        <div className="w-7 h-7 mt-0.5 rounded-lg bg-bg-surface flex flex-shrink-0 items-center justify-center font-bold text-[11px] text-primary-main border border-border-main">
                                                            {msg.username.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                                                            <span className="text-[10px] text-text-muted mb-0.5 mx-0.5 font-medium">{isMine ? 'Sen' : msg.username} · {formatTime(msg.timestamp)}</span>
                                                            <div className="relative group/msg">
                                                                <div className={`px-3 py-2 rounded-xl shadow-sm text-[13px] leading-snug transition-opacity ${msg.pending ? 'opacity-60' : 'opacity-100'} ${isMine ? 'bg-[linear-gradient(135deg,#6C7BFF,#8B5CF6)] text-white rounded-tr-sm' : 'bg-bg-surface border border-border-main text-text-main rounded-tl-sm'}`}>
                                                                    <p className="whitespace-pre-wrap break-words">{renderMessageText(msg.text)}</p>
                                                                </div>
                                                                <div className={`absolute -top-7 ${isMine ? 'right-0' : 'left-0'} opacity-0 group-hover/msg:opacity-100 transition-opacity duration-150 pointer-events-none z-10`}>
                                                                    <div className="px-2 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap"
                                                                        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                                                        {new Date(msg.timestamp).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                                        {msg.pending && ' · gönderiliyor...'}
                                                                    </div>
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
                            <div className="p-2 border-t border-border-main">
                                <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                                    <input type="text" value={messageInput} onChange={handleInputChange} placeholder="Mesaj yaz..."
                                        className="flex-1 bg-bg-surface border border-border-main rounded-xl px-3 py-2 text-[13px] text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary-main" autoFocus />
                                    <button type="submit" disabled={!messageInput.trim()}
                                        className="p-2.5 rounded-xl bg-[linear-gradient(135deg,#6C7BFF,#8B5CF6)] text-white disabled:opacity-50 transition-all active:scale-95 cursor-pointer">
                                        <Send size={14} />
                                    </button>
                                </form>
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
                                                            <div className="w-10 h-10 mt-1 rounded-[14px] bg-bg-surface flex flex-shrink-0 items-center justify-center font-bold text-[14px] text-primary-main border border-border-main shadow-sm">
                                                                {msg.username.charAt(0).toUpperCase()}
                                                            </div>
                                                            <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                                                                <span className="text-[12px] text-text-muted mb-1.5 mx-1 font-medium">
                                                                    {isMine ? 'Sen' : msg.username} · {formatTime(msg.timestamp)}
                                                                </span>
                                                                <div className="relative group/msg">
                                                                    <div className={`px-5 py-3.5 rounded-2xl shadow-sm transition-opacity ${msg.pending ? 'opacity-60' : 'opacity-100'} ${isMine ? 'bg-[linear-gradient(135deg,#6C7BFF,#8B5CF6)] text-white rounded-tr-sm' : 'bg-bg-surface border border-border-main text-text-main rounded-tl-sm'}`}>
                                                                        <p className="whitespace-pre-wrap text-[15px] leading-relaxed break-words">{renderMessageText(msg.text)}</p>
                                                                    </div>
                                                                    {/* Zaman damgası tooltip */}
                                                                    <div className={`absolute -top-7 ${isMine ? 'right-0' : 'left-0'} opacity-0 group-hover/msg:opacity-100 transition-opacity duration-150 pointer-events-none z-10`}>
                                                                        <div className="px-2 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap"
                                                                            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                                                            {new Date(msg.timestamp).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                                            {msg.pending && ' · gönderiliyor...'}
                                                                        </div>
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

                            {/* Users Sidebar */}
                            <motion.div variants={itemVariants} className="hidden md:flex w-72 flex-col bg-bg-card border border-border-main rounded-2xl shadow-card overflow-hidden shrink-0">
                                <div className="p-5 border-b border-border-main bg-bg-surface/30">
                                    <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider flex items-center justify-between gap-2 mb-4">
                                        <span>Odada Olanlar</span>
                                        <span className="bg-bg-surface px-2.5 py-1 rounded-[8px] border border-border-main text-text-main font-semibold text-[12px]">
                                            {Math.max(1, new Set(usersInRoom.map(u => u.username)).size)}
                                        </span>
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
                                        {usersInRoom.map((u) => {
                                            const isSpeaking = [...speakingUsers].some(id => id === u.connectionId);
                                            return (
                                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} key={u.connectionId}
                                                    className="flex flex-col gap-2 p-3 rounded-[16px] border border-transparent hover:border-border-main hover:bg-bg-surface transition-colors duration-200">
                                                    <div className="flex items-center justify-between">
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
                                                                <div className={`relative z-10 w-10 h-10 rounded-[12px] bg-bg-surface flex items-center justify-center font-semibold text-text-main border text-[14px] shadow-sm transition-all duration-150 ${isSpeaking ? 'border-emerald-500 shadow-[0_0_16px_rgba(16,185,129,0.5)]' : 'border-border-main'}`}>
                                                                    {u.username.charAt(0).toUpperCase()}
                                                                </div>
                                                                <div className={`absolute -bottom-1 -right-1 w-3 h-3 ${STATUS_COLORS[u.username === username ? myStatus : 'online']} rounded-full border-[2.5px] border-bg-card z-20`} />
                                                            </div>
                                                            <div>
                                                                <span className="font-semibold text-[14px] text-text-main truncate max-w-[110px] block">
                                                                    {u.username} {u.username === username && <span className="text-[11px] text-text-muted font-normal">(Sen)</span>}
                                                                </span>
                                                                <span className="text-[11px] text-text-muted">{u.username === username ? STATUS_LABELS[myStatus] : 'Çevrimiçi'}</span>
                                                            </div>
                                                        </div>
                                                    </div>
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
                        <motion.div variants={itemVariants}>
                            <form onSubmit={handleSendMessage}
                                className="flex flex-row items-center p-2.5 bg-bg-surface border border-border-main rounded-2xl shadow-card focus-within:border-primary-main transition-all duration-200">
                                <input type="text" value={messageInput} onChange={handleInputChange}
                                    placeholder="Sohbete mesajını yaz..."
                                    className="w-full bg-transparent px-5 py-3.5 placeholder:text-text-muted text-text-main focus:outline-none text-[15px] flex-1" autoFocus />
                                <button type="submit" disabled={!messageInput.trim()}
                                    className="flex items-center justify-center px-6 py-4 mr-1 rounded-xl bg-[linear-gradient(135deg,#6C7BFF,#8B5CF6)] text-white font-semibold disabled:opacity-50 transition-all hover:-translate-y-[2px] hover:brightness-110 active:scale-[0.97] shadow-sm cursor-pointer">
                                    <Send size={18} className="mr-2" /><span className="hidden sm:inline">Gönder</span>
                                </button>
                            </form>
                        </motion.div>
                    </>
                )}
            </motion.div>
        </div>
    );
};

export default ChatRoom;
