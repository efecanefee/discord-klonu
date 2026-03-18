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
        <div className="relative flex flex-col h-screen overflow-hidden bg-[#0A0B1A] font-sans selection:bg-[#5865F2]/50 selection:text-white">
            {/* Active Audio Streams */}
            {Array.from(remoteStreams.entries()).map(([connId, stream], idx) => {
                const userObj = usersInRoom.find(u => u.connectionId === connId);
                const uName = userObj ? userObj.username : 'Unknown';
                const vol = masterVolume * (userVolumes[uName] ?? 1.0);
                return <AudioPlayer key={idx} stream={stream} volume={vol} />;
            })}

            {/* Background Gradients & Effects */}
            <div className="absolute inset-0 z-0 opacity-80 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#13173A] via-[#0A0B1A] to-[#0A0B1A]" />
            <div className="absolute inset-0 z-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '16px 16px' }} />

            {/* Main App Container */}
            <div className="relative z-10 flex flex-col h-full max-w-6xl mx-auto w-full p-4 sm:p-6 drop-shadow-2xl">

                {/* Header (Glassmorphism) */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-between p-4 px-6 mb-6 bg-gray-800/30 backdrop-blur-xl border border-white/10 rounded-3xl shadow-lg"
                >
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-white/5 rounded-2xl border border-white/5 shadow-inner">
                            <Users className="text-[#5865F2]" size={26} />
                        </div>
                        <div>
                            <h2 className="text-xl font-extrabold text-white tracking-wide">{roomId}</h2>
                            <span className="text-xs text-gray-400 font-semibold uppercase tracking-widest">Odası</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="hidden sm:flex items-center px-4 py-2.5 bg-black/20 rounded-xl border border-white/5">
                            <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full mr-3 shadow-[0_0_10px_rgba(16,185,129,0.7)] animate-pulse"></div>
                            <span className="text-sm text-gray-300 font-semibold">{username}</span>
                        </div>

                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={toggleMute}
                            className={`flex items-center justify-center p-3 rounded-2xl border border-white/5 shadow-sm transition-all duration-300 ${isMuted ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-green-500/20 text-emerald-400 hover:bg-green-500/30'}`}
                            title={isMuted ? "Sesi Aç" : "Sesi Kapat"}
                        >
                            {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
                        </motion.button>

                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={handleExplicitLeave}
                            className="flex items-center gap-2 px-5 py-3 bg-red-500/80 hover:bg-red-500 text-white rounded-2xl text-sm font-bold shadow-md transition-colors"
                        >
                            <LogOut size={18} /> <span className="hidden sm:inline">Ayrıl</span>
                        </motion.button>
                    </div>
                </motion.div>

                <div className="flex flex-1 overflow-hidden gap-6 mb-6">
                    {/* Main Chat Area (Glassmorphism) */}
                    <div className="flex-1 flex flex-col overflow-hidden rounded-3xl bg-gray-900/40 backdrop-blur-md border border-white/10 shadow-inner min-w-0 relative">
                        <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
                            {messages.length === 0 && (
                                <div className="absolute inset-0 flex items-center justify-center flex-col gap-4 opacity-50">
                                    <div className="p-4 bg-white/5 rounded-full border border-white/5">
                                        <Send size={40} className="text-gray-400" />
                                    </div>
                                    <span className="text-gray-400 font-medium italic text-sm">Şu an odada mesaj yok. İlk mesajı siz gönderin!</span>
                                </div>
                            )}

                            <div className="space-y-6">
                                <AnimatePresence initial={false}>
                                    {messages.map((msg, idx) => {
                                        if (msg.type === 'system') {
                                            return (
                                                <motion.div
                                                    initial={{ opacity: 0, scale: 0.9, y: 10 }}
                                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                                    key={idx}
                                                    className="flex justify-center my-4"
                                                >
                                                    <span className="bg-white/10 backdrop-blur-sm border border-white/5 px-5 py-2 rounded-full text-xs font-medium text-gray-300 shadow-sm">
                                                        {msg.text}
                                                    </span>
                                                </motion.div>
                                            );
                                        }

                                        const isMine = msg.username === username;

                                        return (
                                            <motion.div
                                                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                                key={idx}
                                                className={`flex w-full ${isMine ? 'justify-end' : 'justify-start'}`}
                                            >
                                                <div className={`flex max-w-[85%] sm:max-w-[70%] gap-3 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#5865F2] to-[#4752C4] flex items-center justify-center font-bold text-lg text-white flex-shrink-0 shadow-md border border-white/10 mt-1">
                                                        {msg.username.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                                                        <span className="text-xs text-gray-400 mb-1 ml-1 mr-1 font-semibold tracking-wide">
                                                            {isMine ? 'Sen' : msg.username}
                                                        </span>
                                                        <div className={`px-5 py-3.5 rounded-2xl shadow-lg border border-white/5 backdrop-blur-md ${isMine ? 'bg-[#5865F2]/80 text-white rounded-tr-sm' : 'bg-[#2B2D31]/80 text-gray-100 rounded-tl-sm'}`}>
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
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="hidden md:flex w-72 flex-col rounded-3xl bg-gray-900/40 backdrop-blur-md border border-white/10 shadow-inner overflow-hidden"
                    >
                        <div className="p-5 border-b border-white/10 bg-black/20">
                            <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider flex items-center justify-between gap-2 mb-3">
                                <span className="flex items-center gap-2">
                                    <Users size={16} className="text-[#5865F2]" />
                                    Odadakiler — {Math.max(1, new Set(usersInRoom.map(u => u.username)).size)} {/* Avoid duplicating count for multi-tab users */}
                                </span>
                            </h3>

                            {/* Master Volume Control */}
                            <div className="flex flex-col gap-1.5 mt-2">
                                <span className="text-xs text-gray-400 font-medium tracking-wide">Genel Ses</span>
                                <input 
                                    type="range" 
                                    min="0" max="1" step="0.01" 
                                    value={masterVolume}
                                    onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
                                    className="w-full h-1 bg-gray-700/80 rounded-lg appearance-none cursor-pointer accent-[#5865F2]"
                                    title="Tüm sesleri kıs/aç"
                                />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                            <AnimatePresence>
                                {usersInRoom.map((u, idx) => (
                                    <motion.div 
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.9 }}
                                        key={u.connectionId + String(idx)}
                                        className="flex flex-col gap-1.5 p-2 rounded-xl hover:bg-white/5 transition-colors group border border-transparent hover:border-white/5"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="relative">
                                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#5865F2] to-[#4752C4] flex items-center justify-center font-bold text-white shadow-md border border-white/10 group-hover:border-white/20 transition-all text-xs">
                                                        {u.username.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-[#1E1F22] shadow-[0_0_5px_rgba(34,197,94,0.5)]"></div>
                                                </div>
                                                <span className="font-semibold text-sm text-gray-200 group-hover:text-white transition-colors truncate max-w-[110px]">
                                                    {u.username} {u.username === username && <span className="text-xs text-gray-500 font-normal ml-1">(Sen)</span>}
                                                </span>
                                            </div>
                                        </div>
                                        
                                        {/* Individual Volume Control */}
                                        {u.username !== username && (
                                            <div className="flex items-center gap-2 pl-11 pr-2 mt-0.5 opacity-80 group-hover:opacity-100 transition-opacity duration-300">
                                                {(userVolumes[u.username] ?? 1.0) === 0 ? (
                                                    <VolumeX size={12} className="text-gray-500" />
                                                ) : (
                                                    <Volume1 size={12} className="text-gray-500" />
                                                )}
                                                <input 
                                                    type="range" 
                                                    min="0" max="1" step="0.01"
                                                    value={userVolumes[u.username] ?? 1.0}
                                                    onChange={(e) => {
                                                        const val = parseFloat(e.target.value);
                                                        setUserVolumes(prev => ({ ...prev, [u.username]: val }));
                                                    }}
                                                    className="w-full h-1 bg-gray-700/50 rounded-lg appearance-none cursor-pointer accent-[#4752C4]"
                                                    title={`${u.username} Ses Ayarı`}
                                                />
                                                <Volume2 size={12} className="text-gray-400" />
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
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex-shrink-0 pb-2"
                >
                    <form onSubmit={handleSendMessage} className="flex flex-row items-center p-2 bg-gray-800/40 backdrop-blur-2xl border border-white/20 rounded-2xl shadow-2xl focus-within:bg-gray-800/60 transition-all duration-300 relative group">
                        <input
                            type="text"
                            value={messageInput}
                            onChange={(e) => setMessageInput(e.target.value)}
                            placeholder="Bir şeyler yaz..."
                            className="w-full bg-transparent px-5 py-3.5 placeholder-gray-500 text-gray-100 focus:outline-none text-[15px]"
                            autoFocus
                        />
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            type="submit"
                            disabled={!messageInput.trim()}
                            className="flex items-center justify-center p-3 sm:px-6 sm:py-3.5 mr-1 rounded-xl bg-gradient-to-r from-[#5865F2] to-[#4752C4] text-white disabled:opacity-40 shadow-lg border border-white/10 transition-all"
                        >
                            <Send size={20} className={messageInput.trim() ? "translate-x-0.5 transition-transform" : ""} />
                            <span className="hidden sm:inline ml-2 font-bold">Gönder</span>
                        </motion.button>

                        {/* Glow Effect behind the input when focused */}
                        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#5865F2]/0 via-[#5865F2]/10 to-[#5865F2]/0 opacity-0 group-focus-within:opacity-100 blur-xl transition-opacity duration-500 rounded-2xl"></div>
                    </form>
                </motion.div>
            </div>
        </div>
    );
};

export default ChatRoom;
