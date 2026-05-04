import { useState, useEffect, useRef } from 'react';
import ChatRoom from './components/ChatRoom';
import { ChevronRight, Music, Users, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Variants } from 'framer-motion';
import signalrService from './services/signalrService';

// Hareketli arka plan orb bileşeni
const Orb = ({ className }: { className: string }) => (
  <div className={`absolute rounded-full blur-[120px] opacity-30 animate-pulse pointer-events-none ${className}`} />
);

function App() {
  const [inRoom, setInRoom] = useState(false);
  const [username, setUsername] = useState('');
  const [roomId, setRoomId] = useState('');
  const [globalActiveUsers, setGlobalActiveUsers] = useState(0);
  const [focused, setFocused] = useState(false);
  const [hoveredRoom, setHoveredRoom] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5098';
    fetch(`${API_BASE_URL}/api/stats/active-users`)
      .then(res => res.json())
      .then(data => setGlobalActiveUsers(data.count))
      .catch(console.error);

    signalrService.startConnection();
    const handleCountUpdate = (count: number) => setGlobalActiveUsers(count);
    signalrService.onActiveUserCountUpdated(handleCountUpdate);
    return () => signalrService.offActiveUserCountUpdated(handleCountUpdate);
  }, []);

  const handleJoinRoom = (selectedRoomId: string) => {
    if (!username.trim()) {
      inputRef.current?.focus();
      inputRef.current?.classList.add('shake');
      setTimeout(() => inputRef.current?.classList.remove('shake'), 500);
      return;
    }
    setRoomId(selectedRoomId);
    setInRoom(true);
  };

  const handleCustomRoom = () => {
    if (!username.trim()) { inputRef.current?.focus(); return; }
    const custom = prompt('Katılmak istediğiniz oda adını giriniz:');
    if (custom?.trim()) { setRoomId(custom.trim()); setInRoom(true); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleJoinRoom('Ana Salon');
  };

  if (inRoom) return <ChatRoom username={username} roomId={roomId} onLeave={() => { setInRoom(false); setRoomId(''); }} />;

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.6, staggerChildren: 0.08, delayChildren: 0.1 } },
  };
  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20, filter: 'blur(8px)' },
    visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] } },
  };

  const rooms = [
    { id: 'Ana Salon', label: 'Ana Salon', sub: 'Sohbet Odası', icon: Users, color: '#6C7BFF', glow: 'rgba(108,123,255,0.3)' },
    { id: 'Müzik Odası', label: 'Müzik Odası', sub: 'Dinleme Odası', icon: Music, color: '#10b981', glow: 'rgba(16,185,129,0.3)' },
  ];

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden font-sans"
      style={{ background: 'radial-gradient(ellipse at 20% 50%, #0d0a1e 0%, #080b18 40%, #050810 100%)' }}>

      {/* Hareketli arka plan orb'ları */}
      <Orb className="w-[600px] h-[600px] bg-violet-600 -top-32 -left-32 animate-[pulse_8s_ease-in-out_infinite]" />
      <Orb className="w-[500px] h-[500px] bg-blue-700 top-1/2 -right-48 animate-[pulse_10s_ease-in-out_infinite_2s]" />
      <Orb className="w-[400px] h-[400px] bg-indigo-800 bottom-0 left-1/3 animate-[pulse_12s_ease-in-out_infinite_4s]" />

      {/* Grid desen */}
      <div className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />

      {/* Ana kart */}
      <motion.div variants={containerVariants} initial="hidden" animate="visible"
        className="relative z-10 w-full max-w-[440px] mx-4"
        style={{
          background: 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '28px',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05), inset 0 1px 0 rgba(255,255,255,0.1)',
          padding: '40px 36px',
        }}>

        {/* İç parlaklık efekti */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

        {/* Logo + Başlık */}
        <motion.div variants={itemVariants} className="text-center mb-10">
          <div className="relative mb-5 group cursor-pointer inline-block">
            {/* Dış glow halkası */}
            <div className="absolute -inset-3 rounded-3xl opacity-0 group-hover:opacity-100 transition-all duration-500 blur-xl"
              style={{ background: 'radial-gradient(circle, rgba(108,123,255,0.4) 0%, transparent 70%)' }} />
            
            {/* Logo container */}
            <div className="relative w-24 h-24 rounded-3xl overflow-hidden transition-all duration-500 group-hover:scale-110 group-hover:-translate-y-1"
              style={{
                boxShadow: '0 8px 32px rgba(108,123,255,0.3), 0 0 0 1px rgba(255,255,255,0.08)',
                filter: 'drop-shadow(0 0 20px rgba(108,123,255,0.3))',
              }}>
              <img
                src="/logo.png"
                alt="SandalyeciMetin"
                className="w-full h-full object-cover transition-all duration-500 group-hover:brightness-110"
              />
              
              {/* Hover overlay parlaması */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 60%)' }} />
            </div>

            {/* Hover'da dönen halka */}
            <div className="absolute -inset-1.5 rounded-3xl border border-violet-500/0 group-hover:border-violet-500/30 transition-all duration-500 group-hover:scale-105" />
          </div>
          <h1 className="text-[28px] font-bold text-white mb-2 tracking-tight"
            style={{ textShadow: '0 0 40px rgba(108,123,255,0.4)' }}>
            SandalyeciMetin
          </h1>
          <p className="text-[14px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Hemen konuşmaya başla
          </p>
        </motion.div>

        <div className="space-y-5">
          {/* Input */}
          <motion.div variants={itemVariants} className="space-y-2">
            <label className="block text-[11px] font-semibold uppercase tracking-widest"
              style={{ color: 'rgba(255,255,255,0.35)' }}>
              Kullanıcı Adı
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder="İsmini gir..."
                className="w-full px-5 py-4 rounded-2xl text-white placeholder:text-white/20 text-[15px] outline-none transition-all duration-300"
                style={{
                  background: focused ? 'rgba(108,123,255,0.08)' : 'rgba(255,255,255,0.04)',
                  border: focused ? '1px solid rgba(108,123,255,0.5)' : '1px solid rgba(255,255,255,0.08)',
                  boxShadow: focused ? '0 0 0 4px rgba(108,123,255,0.1), inset 0 1px 0 rgba(255,255,255,0.05)' : 'inset 0 1px 0 rgba(255,255,255,0.05)',
                }}
              />
              <AnimatePresence>
                {username && (
                  <motion.div initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-emerald-400"
                    style={{ boxShadow: '0 0 8px rgba(52,211,153,0.8)' }} />
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* Giriş butonu */}
          <motion.div variants={itemVariants}>
            <motion.button
              onClick={() => handleJoinRoom('Ana Salon')}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.97 }}
              className="relative w-full py-4 rounded-2xl text-white font-semibold text-[15px] overflow-hidden cursor-pointer"
              style={{ background: 'linear-gradient(135deg, #6C7BFF 0%, #8B5CF6 50%, #7C3AED 100%)', boxShadow: '0 8px 32px rgba(108,123,255,0.35), 0 1px 0 rgba(255,255,255,0.15) inset' }}>
              {/* Parlama efekti */}
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] hover:translate-x-[100%] transition-transform duration-700" />
              <span className="relative flex items-center justify-center gap-2">
                <Sparkles size={16} />
                Giriş Yap
              </span>
            </motion.button>
          </motion.div>

          {/* Odalar */}
          <motion.div variants={itemVariants} className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.25)' }}>
                Aktif Odalar
              </span>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 6px rgba(52,211,153,0.8)' }} />
                <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  {globalActiveUsers} online
                </span>
              </div>
            </div>

            {rooms.map((room) => (
              <motion.button
                key={room.id}
                onClick={() => handleJoinRoom(room.id)}
                onHoverStart={() => setHoveredRoom(room.id)}
                onHoverEnd={() => setHoveredRoom(null)}
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                className="group w-full flex items-center justify-between p-4 rounded-2xl cursor-pointer text-left transition-all duration-300 relative overflow-hidden"
                style={{
                  background: hoveredRoom === room.id ? `rgba(${room.id === 'Ana Salon' ? '108,123,255' : '16,185,129'},0.08)` : 'rgba(255,255,255,0.03)',
                  border: hoveredRoom === room.id ? `1px solid ${room.color}40` : '1px solid rgba(255,255,255,0.06)',
                  boxShadow: hoveredRoom === room.id ? `0 8px 32px ${room.glow}` : 'none',
                }}>

                {/* Hover parlaması */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{ background: `radial-gradient(circle at 20% 50%, ${room.glow} 0%, transparent 60%)` }} />

                <div className="relative flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-300"
                    style={{
                      background: `${room.color}15`,
                      border: `1px solid ${room.color}30`,
                      boxShadow: hoveredRoom === room.id ? `0 0 20px ${room.glow}` : 'none',
                    }}>
                    <room.icon size={18} style={{ color: room.color }} />
                  </div>
                  <div>
                    <div className="text-[15px] font-semibold text-white">{room.label}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/70" />
                      <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{room.sub}</span>
                    </div>
                  </div>
                </div>

                <motion.div animate={{ x: hoveredRoom === room.id ? 3 : 0 }} transition={{ duration: 0.2 }}>
                  <ChevronRight size={18} style={{ color: hoveredRoom === room.id ? room.color : 'rgba(255,255,255,0.2)' }} />
                </motion.div>
              </motion.button>
            ))}
          </motion.div>

          {/* Özel oda */}
          <motion.div variants={itemVariants} className="text-center pt-1">
            <span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.25)' }}>Yeni bir oda mı açmak istiyorsun? </span>
            <button onClick={handleCustomRoom}
              className="text-[13px] font-semibold cursor-pointer transition-colors duration-200 hover:text-white"
              style={{ color: 'rgba(108,123,255,0.8)' }}>
              Tıkla
            </button>
          </motion.div>
        </div>

        {/* Alt parlaklık çizgisi */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2/3 h-px bg-gradient-to-r from-transparent via-violet-500/30 to-transparent" />
      </motion.div>

      {/* Footer */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
        className="absolute bottom-8 flex items-center gap-2">
        <div className="w-4 h-4 rounded-sm"
          style={{ background: 'linear-gradient(135deg, rgba(108,123,255,0.6), rgba(139,92,246,0.6))' }} />
        <span className="text-[11px] font-bold tracking-[0.25em] uppercase"
          style={{ color: 'rgba(255,255,255,0.2)' }}>SandalyeciMetin</span>
      </motion.div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        .shake { animation: shake 0.4s ease-in-out; }
      `}</style>
    </div>
  );
}

export default App;
