import React, { useState, useEffect, useRef } from 'react';
import signalrService from '../services/signalrService';
import { useAudioNotifications } from '../hooks/useAudioNotifications';
import { Send, Users, LogOut, Mic, MicOff, VolumeX, Volume1, Volume2 } from 'lucide-react';
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
}

const AudioPlayer: React.FC<{ stream: MediaStream, volume: number }> = ({ stream, volume }) => {
    const audioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        if (audioRef.current && stream) {
            audioRef.current.srcObject = stream;
        }
    }, [stream]);

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = volume;
        }
    }, [volume]);

    return <audio ref={audioRef} autoPlay />;
};

const ChatRoom: React.FC<ChatRoomProps> = ({ username, roomId, onLeave }) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [usersInRoom, setUsersInRoom] = useState<{connectionId: string, username: string}[]>([]);
    const [messageInput, setMessageInput] = useState('');
    const [masterVolume, setMasterVolume] = useState<number>(1.0);
    const [userVolumes, setUserVolumes] = useState<Record<string, number>>({});
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const { remoteStreams, isMuted, toggleMute, isReady } = useWebRTC();
    const { playJoinSound, playLeaveSound, playMuteSound, playUnmuteSound, playSendSound, playReceiveSound } = useAudioNotifications();

    useEffect(() => {
        if (!isReady) return;

        let isMounted = true;

        const handleUserJoined = (u: string, connId: string) => {
            if (isMounted) {
                playJoinSound(); // ← kanaldaki herkes duyar (SignalR zaten herkese broadcast eder)
                setMessages((prev) => [...prev, { id: Date.now(), username: 'System', text: `${u} odaya katıldı.`, type: 'system' }]);
                setUsersInRoom((prev) => {
                    if (!prev.find(user => user.connectionId === connId)) {
                        return [...prev, { username: u, connectionId: connId }];
                    }
                    return prev;
                });
            }
        };
        const handleUserLeft = (u: string, connId: string) => {
            if (isMounted) {
                playLeaveSound(); // ← kanalda kalan herkes duyar
                setMessages((prev) => [...prev, { id: Date.now(), username: 'System', text: `${u} odadan ayrıldı.`, type: 'system' }]);
                setUsersInRoom((prev) => prev.filter((user) => user.connectionId !== connId));
            }
        };
        const handleReceiveMessage = (u: string, m: string) => {
            if (isMounted) {
                if (u !== username) {
                    playReceiveSound(); // sadece başkası yazınca çalsın
                }
                setMessages((prev) => [...prev, { id: Date.now(), username: u, text: m, type: 'message' }]);
            }
        };
        const handleRoomUsers = (usersDict: Record<string, string>) => {
            if (isMounted) {
                const arr = Object.entries(usersDict).map(([connId, uName]) => ({ connectionId: connId, username: uName }));
                setUsersInRoom(arr);
            }
        };

        signalrService.onUserJoined(handleUserJoined);
        signalrService.onUserLeft(handleUserLeft);
        signalrService.onReceiveMessage(handleReceiveMessage);
        signalrService.onRoomUsers(handleRoomUsers);

        signalrService.startConnection(roomId, username);

        return () => {
            isMounted = false;
            signalrService.offUserJoined(handleUserJoined);
            signalrService.offUserLeft(handleUserLeft);
            signalrService.offReceiveMessage(handleReceiveMessage);
            signalrService.offRoomUsers(handleRoomUsers);
        };
    }, [roomId, username, isReady, playJoinSound, playLeaveSound, playReceiveSound]);

    const handleExplicitLeave = async () => {
        await signalrService.stopConnection(roomId, username);
        onLeave();
    };

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        if (messageInput.trim()) {
            playSendSound();
            signalrService.sendMessage(roomId, username, messageInput);
            setMessageInput('');
        }
    };

    // Animation Variants
    const containerVariants: Variants = {
        hidden: { opacity: 0, y: 10 },
        visible: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.4, ease: "easeOut", staggerChildren: 0.05, delayChildren: 0.1 }
        }
    };
    
    const itemVariants: Variants = {
        hidden: { opacity: 0, y: 10 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } }
    };

    return (
        <div className="relative flex flex-col h-screen overflow-hidden bg-bg-base font-sans selection:bg-primary-main/30 selection:text-text-main">
            {/* Active Audio Streams */}
            {Array.from(remoteStreams.entries()).map(([connId, stream], idx) => {
                const userObj = usersInRoom.find(u => u.connectionId === connId);
                const uName = userObj ? userObj.username : 'Unknown';
                const vol = masterVolume * (userVolumes[uName] ?? 1.0);
                return <AudioPlayer key={idx} stream={stream} volume={vol} />;
            })}

            {/* Main App Container */}
            <motion.div 
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="relative z-10 flex flex-col h-full max-w-[1400px] mx-auto w-full p-4 sm:p-6 lg:p-8"
            >
                {/* Header (Minimal) */}
                <motion.div
                    variants={itemVariants}
                    className="flex items-center justify-between p-5 mb-6 bg-bg-surface border border-border-main rounded-2xl shadow-card"
                >
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-bg-base rounded-[14px] border border-border-main shadow-sm">
                            <Users className="text-primary-main" size={24} />
                        </div>
                        <div>
                            <h2 className="text-[18px] font-semibold text-text-main tracking-tight leading-none mb-1.5">{roomId}</h2>
                            <span className="text-[13px] text-text-muted font-normal block">Sohbet Odası</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="hidden sm:flex items-center px-4 py-2.5 bg-bg-base rounded-xl border border-border-main">
                            <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full mr-2.5 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                            <span className="text-sm text-text-main font-medium">{username}</span>
                        </div>

                        <button
                            onClick={() => {
                                if (!isMuted) {
                                    playMuteSound();
                                } else {
                                    playUnmuteSound();
                                }
                                toggleMute();
                            }}
                            className={`flex items-center justify-center p-3 rounded-xl border cursor-pointer transition-colors duration-200 active:scale-[0.97] ${isMuted ? 'bg-red-500/10 border-red-500/30 text-red-500 hover:bg-red-500/20' : 'bg-bg-base border-border-main text-text-main hover:border-primary-main/40 hover:text-primary-main'}`}
                            title={isMuted ? "Sesi Aç" : "Sesi Kapat"}
                        >
                            {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                        </button>

                        <button
                            onClick={handleExplicitLeave}
                            className="flex items-center gap-2 px-5 py-3 bg-bg-base hover:bg-red-500/10 text-text-muted hover:text-red-500 border border-border-main hover:border-red-500/30 rounded-xl text-[14px] font-semibold transition-colors duration-200 active:scale-[0.97] cursor-pointer"
                        >
                            <LogOut size={18} /> <span className="hidden sm:inline">Ayrıl</span>
                        </button>
                    </div>
                </motion.div>

                <div className="flex flex-1 overflow-hidden gap-6 mb-6">
                    {/* Main Chat Area */}
                    <motion.div variants={itemVariants} className="flex-1 flex flex-col overflow-hidden bg-bg-card border border-border-main rounded-2xl shadow-card min-w-0">
                        <div className="relative flex-1 overflow-y-auto p-5 sm:p-6 custom-scrollbar">
                            {messages.length === 0 && (
                                <div className="absolute inset-0 flex items-center justify-center flex-col gap-4 pointer-events-none">
                                    <div className="p-4 bg-bg-surface rounded-2xl border border-border-main shadow-sm">
                                        <Send size={32} className="text-text-muted" />
                                    </div>
                                    <span className="text-text-muted font-medium text-sm">İlk mesajı sen gönder...</span>
                                </div>
                            )}

                            <div className="space-y-6">
                                <AnimatePresence initial={false}>
                                    {messages.map((msg, idx) => {
                                        if (msg.type === 'system') {
                                            return (
                                                <motion.div
                                                    initial={{ opacity: 0, y: 5 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    key={idx}
                                                    className="flex justify-center my-4"
                                                >
                                                    <span className="bg-bg-surface border border-border-main px-4 py-1.5 rounded-[12px] text-[12px] font-normal text-text-muted shadow-sm">
                                                        {msg.text}
                                                    </span>
                                                </motion.div>
                                            );
                                        }

                                        const isMine = msg.username === username;

                                        return (
                                            <motion.div
                                                initial={{ opacity: 0, scale: 0.98, y: 5 }}
                                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                                transition={{ duration: 0.2 }}
                                                key={idx}
                                                className={`flex w-full ${isMine ? 'justify-end' : 'justify-start'}`}
                                            >
                                                <div className={`flex max-w-[85%] sm:max-w-[75%] gap-3 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                                                    <div className="w-10 h-10 mt-1 rounded-[14px] bg-bg-surface flex flex-shrink-0 items-center justify-center font-bold text-[14px] text-primary-main border border-border-main shadow-sm">
                                                        {msg.username.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                                                        <span className="text-[12px] text-text-muted mb-1.5 mx-1 font-medium">
                                                            {isMine ? 'Sen' : msg.username}
                                                        </span>
                                                        <div className={`px-5 py-3.5 rounded-2xl shadow-sm ${isMine ? 'bg-[linear-gradient(135deg,#6C7BFF,#8B5CF6)] text-white rounded-tr-sm' : 'bg-bg-surface border border-border-main text-text-main rounded-tl-sm'}`}>
                                                            <p className="whitespace-pre-wrap text-[15px] leading-relaxed break-words">{msg.text}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </AnimatePresence>
                                <div ref={messagesEndRef} className="h-2" />
                            </div>
                        </div>
                    </motion.div>

                    {/* Users Sidebar (Right Panel) */}
                    <motion.div 
                        variants={itemVariants}
                        className="hidden md:flex w-72 flex-col bg-bg-card border border-border-main rounded-2xl shadow-card overflow-hidden shrink-0"
                    >
                        <div className="p-5 border-b border-border-main bg-bg-surface/30">
                            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider flex items-center justify-between gap-2 mb-4">
                                <span className="flex items-center gap-2">Odada Olanlar</span>
                                <span className="bg-bg-surface px-2.5 py-1 rounded-[8px] border border-border-main text-text-main font-semibold shadow-sm text-[12px]">{Math.max(1, new Set(usersInRoom.map(u => u.username)).size)}</span>
                            </h3>

                            {/* Master Volume Control */}
                            <div className="flex flex-col gap-2.5 mt-2">
                                <span className="text-[13px] text-text-muted font-medium">Sistem Sesi</span>
                                <input 
                                    type="range" 
                                    min="0" max="1" step="0.01" 
                                    value={masterVolume}
                                    onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
                                    className="w-full h-1.5 bg-bg-base rounded-full appearance-none cursor-pointer accent-primary-main focus:outline-none"
                                />
                            </div>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                            <AnimatePresence>
                                {usersInRoom.map((u, idx) => (
                                    <motion.div 
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        key={u.connectionId + String(idx)}
                                        className="flex flex-col gap-2 p-3 rounded-[16px] border border-transparent hover:border-border-main hover:bg-bg-surface transition-colors duration-200"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="relative">
                                                    <div className="w-10 h-10 rounded-[12px] bg-bg-surface flex items-center justify-center font-semibold text-text-main border border-border-main shadow-sm text-[14px]">
                                                        {u.username.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-[2.5px] border-bg-card"></div>
                                                </div>
                                                <span className="font-semibold text-[14px] text-text-main truncate max-w-[110px]">
                                                    {u.username} {u.username === username && <span className="text-[12px] text-text-muted font-normal ml-1">(Sen)</span>}
                                                </span>
                                            </div>
                                        </div>
                                        
                                        {/* Individual Volume Control */}
                                        {u.username !== username && (
                                            <div className="flex items-center gap-2 pl-[52px] pr-2 opacity-60 hover:opacity-100 transition-opacity duration-200">
                                                {(userVolumes[u.username] ?? 1.0) === 0 ? (
                                                    <VolumeX size={14} className="text-text-muted" />
                                                ) : (
                                                    <Volume1 size={14} className="text-text-muted" />
                                                )}
                                                <input 
                                                    type="range" 
                                                    min="0" max="1" step="0.01"
                                                    value={userVolumes[u.username] ?? 1.0}
                                                    onChange={(e) => {
                                                        const val = parseFloat(e.target.value);
                                                        setUserVolumes(prev => ({ ...prev, [u.username]: val }));
                                                    }}
                                                    className="w-full h-1 bg-bg-base rounded-full appearance-none cursor-pointer accent-primary-main focus:outline-none"
                                                />
                                                <Volume2 size={14} className="text-text-muted" />
                                            </div>
                                        )}
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    </motion.div>
                </div>

                {/* Floating Input Area */}
                <motion.div variants={itemVariants}>
                    <form onSubmit={handleSendMessage} className="flex flex-row items-center p-2.5 bg-bg-surface border border-border-main rounded-2xl shadow-card focus-within:ring-glow focus-within:border-primary-main transition-all duration-200">
                        <input
                            type="text"
                            value={messageInput}
                            onChange={(e) => setMessageInput(e.target.value)}
                            placeholder="Sohbete mesajını yaz..."
                            className="w-full bg-transparent px-5 py-3.5 placeholder:text-text-muted text-text-main focus:outline-none text-[15px] flex-1"
                            autoFocus
                        />
                        <button
                            type="submit"
                            disabled={!messageInput.trim()}
                            className="flex items-center justify-center px-6 py-4 mr-1 rounded-xl bg-[linear-gradient(135deg,#6C7BFF,#8B5CF6)] text-white font-semibold disabled:opacity-50 disabled:hover:-translate-y-0 transition-all duration-250 hover:-translate-y-[2px] hover:shadow-card hover:brightness-110 active:scale-[0.97] active:translate-y-[0px] shadow-sm whitespace-nowrap cursor-pointer"
                        >
                            <Send size={18} className="mr-2" />
                            <span className="hidden sm:inline">Gönder</span>
                        </button>
                    </form>
                </motion.div>
            </motion.div>
        </div>
    );
};

export default ChatRoom;
