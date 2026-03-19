import React, { useState, useEffect, useRef } from 'react';
import signalrService from '../services/signalrService';
import { Send, Users, LogOut, Mic, MicOff, VolumeX, Volume1, Volume2 } from 'lucide-react';
import { useWebRTC } from '../hooks/useWebRTC';
import { motion, AnimatePresence } from 'framer-motion';

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

    useEffect(() => {
        if (!isReady) return;

        let isMounted = true;

        const handleUserJoined = (u: string, connId: string) => {
            if (isMounted) {
                setMessages((prev) => [...prev, { id: Date.now(), username: 'System', text: `${u} katıldı.`, type: 'system' }]);
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
                setMessages((prev) => [...prev, { id: Date.now(), username: 'System', text: `${u} ayrıldı.`, type: 'system' }]);
                setUsersInRoom((prev) => prev.filter((user) => user.connectionId !== connId));
            }
        };
        const handleReceiveMessage = (u: string, m: string) => {
            if (isMounted) setMessages((prev) => [...prev, { id: Date.now(), username: u, text: m, type: 'message' }]);
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
    }, [roomId, username, isReady]);

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
            signalrService.sendMessage(roomId, username, messageInput);
            setMessageInput('');
        }
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
            <div className="relative z-10 flex flex-col h-full max-w-[1400px] mx-auto w-full p-4 sm:p-6 lg:p-8">

                {/* Header (Minimal) */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex items-center justify-between p-5 mb-6 bg-bg-surface border border-border-main rounded-2xl shadow-premium"
                >
                    <div className="flex items-center gap-4">
                        <div className="p-2.5 bg-bg-base rounded-xl border border-border-main">
                            <Users className="text-primary-main" size={22} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-text-main tracking-tight leading-none">{roomId}</h2>
                            <span className="text-xs text-text-muted font-medium mt-1 inline-block">Sohbet Odası</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="hidden sm:flex items-center px-4 py-2 bg-bg-base rounded-xl border border-border-main">
                            <div className="w-2 h-2 bg-emerald-400 rounded-full mr-2.5 shadow-[0_0_8px_rgba(52,211,153,0.5)]"></div>
                            <span className="text-sm text-text-muted font-medium">{username}</span>
                        </div>

                        <button
                            onClick={toggleMute}
                            className={`flex items-center justify-center p-2.5 rounded-xl border transition-colors duration-200 ${isMuted ? 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20' : 'bg-bg-base border-border-main text-text-muted hover:text-text-main hover:border-text-muted/30'}`}
                            title={isMuted ? "Sesi Aç" : "Sesi Kapat"}
                        >
                            {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                        </button>

                        <button
                            onClick={handleExplicitLeave}
                            className="flex items-center gap-2 px-4 py-2.5 bg-bg-base hover:bg-red-500/10 text-text-muted hover:text-red-400 border border-border-main hover:border-red-500/30 rounded-xl text-sm font-semibold transition-colors duration-200"
                        >
                            <LogOut size={18} /> <span className="hidden sm:inline">Ayrıl</span>
                        </button>
                    </div>
                </motion.div>

                <div className="flex flex-1 overflow-hidden gap-6 mb-6">
                    {/* Main Chat Area */}
                    <div className="flex-1 flex flex-col overflow-hidden bg-bg-card border border-border-main rounded-2xl shadow-premium min-w-0">
                        <div className="flex-1 overflow-y-auto p-5 sm:p-6 custom-scrollbar">
                            {messages.length === 0 && (
                                <div className="absolute inset-0 flex items-center justify-center flex-col gap-4 opacity-100">
                                    <div className="p-4 bg-bg-surface rounded-full border border-border-main">
                                        <Send size={32} className="text-text-muted" />
                                    </div>
                                    <span className="text-text-muted font-medium text-sm">İlk mesajı sen gönder...</span>
                                </div>
                            )}

                            <div className="space-y-5">
                                <AnimatePresence initial={false}>
                                    {messages.map((msg, idx) => {
                                        if (msg.type === 'system') {
                                            return (
                                                <motion.div
                                                    initial={{ opacity: 0, y: 5 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    key={idx}
                                                    className="flex justify-center my-3"
                                                >
                                                    <span className="bg-bg-surface border border-border-main px-4 py-1.5 rounded-full text-xs font-medium text-text-muted">
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
                                                    <div className="w-9 h-9 mt-0.5 rounded-full bg-bg-surface flex flex-shrink-0 items-center justify-center font-bold text-sm text-primary-main border border-border-main">
                                                        {msg.username.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                                                        <span className="text-xs text-text-muted mb-1 mx-1 font-medium">
                                                            {isMine ? 'Sen' : msg.username}
                                                        </span>
                                                        <div className={`px-4 py-3 rounded-2xl shadow-sm ${isMine ? 'bg-primary-main text-white rounded-tr-sm' : 'bg-bg-surface border border-border-main text-text-main rounded-tl-sm'}`}>
                                                            <p className="whitespace-pre-wrap text-[15px] leading-relaxed break-words">{msg.text}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </AnimatePresence>
                                <div ref={messagesEndRef} className="h-1" />
                            </div>
                        </div>
                    </div>

                    {/* Users Sidebar (Right Panel) */}
                    <motion.div 
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3 }}
                        className="hidden md:flex w-72 flex-col bg-bg-card border border-border-main rounded-2xl shadow-premium overflow-hidden shrink-0"
                    >
                        <div className="p-5 border-b border-border-main bg-bg-surface/50">
                            <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center justify-between gap-2 mb-3">
                                <span>Odada Olanlar</span>
                                <span className="bg-bg-base px-2 py-0.5 rounded-md border border-border-main text-text-main">{Math.max(1, new Set(usersInRoom.map(u => u.username)).size)}</span>
                            </h3>

                            {/* Master Volume Control */}
                            <div className="flex flex-col gap-2 mt-4">
                                <span className="text-xs text-text-muted font-medium">Genel Ses</span>
                                <input 
                                    type="range" 
                                    min="0" max="1" step="0.01" 
                                    value={masterVolume}
                                    onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
                                    className="w-full h-1.5 bg-bg-base rounded-full appearance-none cursor-pointer accent-primary-main"
                                />
                            </div>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
                            <AnimatePresence>
                                {usersInRoom.map((u, idx) => (
                                    <motion.div 
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        key={u.connectionId + String(idx)}
                                        className="flex flex-col gap-1.5 p-2 rounded-xl border border-transparent hover:border-border-main hover:bg-bg-surface transition-colors duration-200"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="relative">
                                                    <div className="w-8 h-8 rounded-full bg-bg-base flex items-center justify-center font-bold text-text-main border border-border-main text-xs">
                                                        {u.username.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-bg-card shadow-[0_0_5px_rgba(52,211,153,0.3)]"></div>
                                                </div>
                                                <span className="font-medium text-sm text-text-main truncate max-w-[110px]">
                                                    {u.username} {u.username === username && <span className="text-xs text-text-muted font-normal ml-1">(Sen)</span>}
                                                </span>
                                            </div>
                                        </div>
                                        
                                        {/* Individual Volume Control */}
                                        {u.username !== username && (
                                            <div className="flex items-center gap-2 pl-11 pr-2 mt-0.5 opacity-60 hover:opacity-100 transition-opacity duration-200">
                                                {(userVolumes[u.username] ?? 1.0) === 0 ? (
                                                    <VolumeX size={12} className="text-text-muted" />
                                                ) : (
                                                    <Volume1 size={12} className="text-text-muted" />
                                                )}
                                                <input 
                                                    type="range" 
                                                    min="0" max="1" step="0.01"
                                                    value={userVolumes[u.username] ?? 1.0}
                                                    onChange={(e) => {
                                                        const val = parseFloat(e.target.value);
                                                        setUserVolumes(prev => ({ ...prev, [u.username]: val }));
                                                    }}
                                                    className="w-full h-1 bg-bg-base rounded-full appearance-none cursor-pointer accent-primary-main"
                                                />
                                                <Volume2 size={12} className="text-text-muted" />
                                            </div>
                                        )}
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    </motion.div>
                </div>

                {/* Floating Input Area */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                >
                    <form onSubmit={handleSendMessage} className="flex flex-row items-center p-2 bg-bg-surface border border-border-main rounded-2xl shadow-premium focus-within:ring-2 focus-within:ring-primary-main/20 focus-within:border-primary-main transition-all duration-300">
                        <input
                            type="text"
                            value={messageInput}
                            onChange={(e) => setMessageInput(e.target.value)}
                            placeholder="Sohbete yaz..."
                            className="w-full bg-transparent px-5 py-3.5 placeholder:text-text-muted/60 text-text-main focus:outline-none text-[15px]"
                            autoFocus
                        />
                        <button
                            type="submit"
                            disabled={!messageInput.trim()}
                            className="flex items-center justify-center px-6 py-3 mr-1 rounded-xl bg-primary-main hover:bg-primary-hover text-white font-medium disabled:opacity-50 disabled:hover:-translate-y-0 transition-all duration-200 hover:-translate-y-[2px] active:translate-y-[0px] shadow-sm whitespace-nowrap"
                        >
                            <Send size={18} className="mr-2" />
                            <span className="hidden sm:inline">Gönder</span>
                        </button>
                    </form>
                </motion.div>
            </div>
        </div>
    );
};

export default ChatRoom;
