import { useState, useEffect } from 'react';
import ChatRoom from './components/ChatRoom';
import { ChevronRight, Music, Users, Sparkles, Lock, Mail, User } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import signalrService from './services/signalrService';

const Orb = ({ className }: { className: string }) => (
  <div className={`absolute rounded-full blur-[120px] opacity-30 animate-pulse pointer-events-none ${className}`} />
);

function App() {
  const [authState, setAuthState] = useState<'login' | 'register' | 'rooms'>('login');
  const [inRoom, setInRoom] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roomId, setRoomId] = useState('');
  const [globalActiveUsers, setGlobalActiveUsers] = useState(0);
  const [focused, setFocused] = useState<string | null>(null);
  const [hoveredRoom, setHoveredRoom] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5098';

  useEffect(() => {
    // Check if token exists on load
    const token = localStorage.getItem('token');
    const savedUsername = localStorage.getItem('username');
    if (token && savedUsername) {
      setUsername(savedUsername);
      setAuthState('rooms');
      connectSignalR();
    }
  }, []);

  const connectSignalR = () => {
    signalrService.startConnection();
    const handleCountUpdate = (count: number) => setGlobalActiveUsers(count);
    signalrService.onActiveUserCountUpdated(handleCountUpdate);
  };

  useEffect(() => {
    if (authState === 'rooms') {
      fetch(`${API_BASE_URL}/api/stats/active-users`)
        .then(res => res.json())
        .then(data => setGlobalActiveUsers(data.count))
        .catch(console.error);
    }
  }, [authState]);

  const handleLogin = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email || !password) {
      setErrorMsg('Tüm alanları doldurun');
      return;
    }
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('token', data.token);
        localStorage.setItem('username', data.username);
        setUsername(data.username);
        setAuthState('rooms');
        connectSignalR();
      } else {
        setErrorMsg('Giriş başarısız, e-posta veya şifre hatalı.');
      }
    } catch (err) {
      setErrorMsg('Bağlantı hatası.');
    }
    setIsLoading(false);
  };

  const handleRegister = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!username || !email || !password) {
      setErrorMsg('Tüm alanları doldurun');
      return;
    }
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
      });
      if (res.ok) {
        setAuthState('login');
        setErrorMsg('Kayıt başarılı, lütfen giriş yapın.');
      } else {
        const text = await res.text();
        setErrorMsg(text || 'Kayıt başarısız.');
      }
    } catch (err) {
      setErrorMsg('Bağlantı hatası.');
    }
    setIsLoading(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    setUsername('');
    setEmail('');
    setPassword('');
    setAuthState('login');
    // It's good practice to stop connection if exists, but refreshing is safer
    window.location.reload();
  };

  const handleJoinRoom = (selectedRoomId: string) => {
    setRoomId(selectedRoomId);
    setInRoom(true);
  };

  const handleCustomRoom = () => {
    const custom = prompt('Katılmak istediğiniz oda adını giriniz:');
    if (custom?.trim()) { setRoomId(custom.trim()); setInRoom(true); }
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

      <Orb className="w-[600px] h-[600px] bg-violet-600 -top-32 -left-32 animate-[pulse_8s_ease-in-out_infinite]" />
      <Orb className="w-[500px] h-[500px] bg-blue-700 top-1/2 -right-48 animate-[pulse_10s_ease-in-out_infinite_2s]" />
      <Orb className="w-[400px] h-[400px] bg-indigo-800 bottom-0 left-1/3 animate-[pulse_12s_ease-in-out_infinite_4s]" />

      <div className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />

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

        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

        <motion.div variants={itemVariants} className="text-center mb-10">
          <div className="relative mb-5 group cursor-pointer inline-block">
            <div className="absolute -inset-3 rounded-3xl opacity-0 group-hover:opacity-100 transition-all duration-500 blur-xl"
              style={{ background: 'radial-gradient(circle, rgba(108,123,255,0.4) 0%, transparent 70%)' }} />
            <div className="relative w-24 h-24 rounded-3xl overflow-hidden transition-all duration-500 group-hover:scale-110 group-hover:-translate-y-1"
              style={{
                boxShadow: '0 8px 32px rgba(108,123,255,0.3), 0 0 0 1px rgba(255,255,255,0.08)',
                filter: 'drop-shadow(0 0 20px rgba(108,123,255,0.3))',
              }}>
              <img src="/logo.png" alt="SandalyeciMetin" className="w-full h-full object-cover transition-all duration-500 group-hover:brightness-110" />
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 60%)' }} />
            </div>
            <div className="absolute -inset-1.5 rounded-3xl border border-violet-500/0 group-hover:border-violet-500/30 transition-all duration-500 group-hover:scale-105" />
          </div>
          <h1 className="text-[28px] font-bold text-white mb-2 tracking-tight"
            style={{ textShadow: '0 0 40px rgba(108,123,255,0.4)' }}>
            SandalyeciMetin
          </h1>
          <p className="text-[14px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {authState === 'rooms' ? `Hoş geldin, ${username}` : (authState === 'login' ? 'Hesabına giriş yap' : 'Yeni hesap oluştur')}
          </p>
        </motion.div>

        <div className="space-y-5">
          {errorMsg && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} 
              className="p-3 rounded-lg text-sm text-center" 
              style={{ background: 'rgba(239,68,68,0.1)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.2)' }}>
              {errorMsg}
            </motion.div>
          )}

          {authState !== 'rooms' ? (
            <form onSubmit={authState === 'login' ? handleLogin : handleRegister} className="space-y-4">
              
              {authState === 'register' && (
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                  <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    onFocus={() => setFocused('username')}
                    onBlur={() => setFocused(null)}
                    placeholder="Kullanıcı Adı"
                    className="w-full pl-12 pr-5 py-4 rounded-2xl text-white placeholder:text-white/20 text-[15px] outline-none transition-all duration-300"
                    style={{
                      background: focused === 'username' ? 'rgba(108,123,255,0.08)' : 'rgba(255,255,255,0.04)',
                      border: focused === 'username' ? '1px solid rgba(108,123,255,0.5)' : '1px solid rgba(255,255,255,0.08)',
                    }}
                  />
                </div>
              )}

              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onFocus={() => setFocused('email')}
                  onBlur={() => setFocused(null)}
                  placeholder="E-posta Adresi"
                  className="w-full pl-12 pr-5 py-4 rounded-2xl text-white placeholder:text-white/20 text-[15px] outline-none transition-all duration-300"
                  style={{
                    background: focused === 'email' ? 'rgba(108,123,255,0.08)' : 'rgba(255,255,255,0.04)',
                    border: focused === 'email' ? '1px solid rgba(108,123,255,0.5)' : '1px solid rgba(255,255,255,0.08)',
                  }}
                />
              </div>

              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onFocus={() => setFocused('password')}
                  onBlur={() => setFocused(null)}
                  placeholder="Şifre"
                  className="w-full pl-12 pr-5 py-4 rounded-2xl text-white placeholder:text-white/20 text-[15px] outline-none transition-all duration-300"
                  style={{
                    background: focused === 'password' ? 'rgba(108,123,255,0.08)' : 'rgba(255,255,255,0.04)',
                    border: focused === 'password' ? '1px solid rgba(108,123,255,0.5)' : '1px solid rgba(255,255,255,0.08)',
                  }}
                />
              </div>

              <motion.button
                type="submit"
                disabled={isLoading}
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.97 }}
                className="relative w-full py-4 mt-2 rounded-2xl text-white font-semibold text-[15px] overflow-hidden cursor-pointer"
                style={{ background: 'linear-gradient(135deg, #6C7BFF 0%, #8B5CF6 50%, #7C3AED 100%)', boxShadow: '0 8px 32px rgba(108,123,255,0.35), 0 1px 0 rgba(255,255,255,0.15) inset', opacity: isLoading ? 0.7 : 1 }}>
                <span className="relative flex items-center justify-center gap-2">
                  <Sparkles size={16} />
                  {isLoading ? 'Bekleniyor...' : (authState === 'login' ? 'Giriş Yap' : 'Kayıt Ol')}
                </span>
              </motion.button>

              <div className="text-center pt-3">
                <span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  {authState === 'login' ? 'Hesabın yok mu? ' : 'Zaten hesabın var mı? '}
                </span>
                <button type="button" onClick={() => { setAuthState(authState === 'login' ? 'register' : 'login'); setErrorMsg(''); }}
                  className="text-[13px] font-semibold cursor-pointer transition-colors duration-200 hover:text-white"
                  style={{ color: 'rgba(108,123,255,0.8)' }}>
                  {authState === 'login' ? 'Kayıt Ol' : 'Giriş Yap'}
                </button>
              </div>
            </form>
          ) : (
            <motion.div variants={itemVariants} className="space-y-3 pt-2">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.25)' }}>
                  Aktif Odalar
                </span>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 6px rgba(52,211,153,0.8)' }} />
                    <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      {globalActiveUsers} online
                    </span>
                  </div>
                  <button onClick={handleLogout} className="text-[11px] text-red-400 hover:text-red-300 transition uppercase tracking-wider font-bold">
                    Çıkış
                  </button>
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

              <div className="text-center pt-3">
                <span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.25)' }}>Yeni bir oda mı açmak istiyorsun? </span>
                <button onClick={handleCustomRoom}
                  className="text-[13px] font-semibold cursor-pointer transition-colors duration-200 hover:text-white"
                  style={{ color: 'rgba(108,123,255,0.8)' }}>
                  Tıkla
                </button>
              </div>
            </motion.div>
          )}
        </div>

        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2/3 h-px bg-gradient-to-r from-transparent via-violet-500/30 to-transparent" />
      </motion.div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
        className="absolute bottom-8 flex items-center gap-2">
        <div className="w-4 h-4 rounded-sm"
          style={{ background: 'linear-gradient(135deg, rgba(108,123,255,0.6), rgba(139,92,246,0.6))' }} />
        <span className="text-[11px] font-bold tracking-[0.25em] uppercase"
          style={{ color: 'rgba(255,255,255,0.2)' }}>SandalyeciMetin</span>
      </motion.div>
    </div>
  );
}

export default App;
