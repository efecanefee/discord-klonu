import { useState, useEffect, useRef, useCallback } from 'react';
import ChatRoom from './components/ChatRoom';
import DMChatRoom from './components/DMChatRoom';
import ProfileModal from './components/ProfileModal';
import CreateRoomModal from './components/CreateRoomModal';
import NewMessageModal, { type UserData as ModalUserData } from './components/NewMessageModal';
import { getAvatarEmoji } from './constants/avatars';
import { playNotificationSound } from './utils/sound';
import { ChevronRight, Music, Users, Sparkles, Lock, Mail, User, Github, Linkedin, Instagram, Hash, Volume2, MessageSquare, Plus } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import signalrService from './services/signalrService';

const Orb = ({ className }: { className: string }) => (
  <div className={`absolute rounded-full blur-[120px] opacity-30 animate-pulse pointer-events-none ${className}`} />
);

function App() {
  const [authState, setAuthState] = useState<'login' | 'register' | 'rooms' | 'forgot' | 'reset'>('login');
  const [successMsg, setSuccessMsg] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetUserId, setResetUserId] = useState('');
  const [inRoom, setInRoom] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [avatarId, setAvatarId] = useState('default');
  const [userId, setUserId] = useState(localStorage.getItem('userId') || '');
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isCreateRoomModalOpen, setIsCreateRoomModalOpen] = useState(false);
  const [isNewMessageModalOpen, setIsNewMessageModalOpen] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [inDMRoom, setInDMRoom] = useState(false);
  const [activeDMUser, setActiveDMUser] = useState<ModalUserData | null>(null);
  const [activeDMs, setActiveDMs] = useState<ModalUserData[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [globalActiveUsers, setGlobalActiveUsers] = useState(0);
  const [focused, setFocused] = useState<string | null>(null);
  const [hoveredRoom, setHoveredRoom] = useState<string | null>(null);
  const [roomUsers, setRoomUsers] = useState<any[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLogoFlipped, setIsLogoFlipped] = useState(false);
  const [isMainLogoFlipped, setIsMainLogoFlipped] = useState(false);
  const hoverTimeoutRef = useRef<number | null>(null);

  // Dinamik oda listesi
  type RoomData = {
    id: number;
    name: string;
    type: string;
    description?: string;
    createdBy: string;
    createdAt: string;
  };
  const defaultRooms: RoomData[] = [
    { id: -1, name: 'Ana Salon', type: 'text', description: 'Sohbet Odası', createdBy: 'system', createdAt: new Date().toISOString() },
    { id: -2, name: 'Müzik Odası', type: 'text', description: 'Dinleme Odası', createdBy: 'system', createdAt: new Date().toISOString() }
  ];

  const [rooms, setRooms] = useState<RoomData[]>(defaultRooms);

  // Oda için ikon ve renk mapping
  const getRoomVisuals = (room: RoomData) => {
    if (room.type === 'voice') {
      return { icon: Volume2, color: '#10b981', glow: 'rgba(16,185,129,0.3)', sub: room.description || 'Sesli Sohbet' };
    }
    // Özel odalar için özel renkler
    if (room.name === 'Ana Salon') {
      return { icon: Users, color: '#7C3AED', glow: 'rgba(124,58,237,0.3)', sub: room.description || 'Sohbet Odası' };
    }
    if (room.name === 'Müzik Odası') {
      return { icon: Music, color: '#10b981', glow: 'rgba(16,185,129,0.3)', sub: room.description || 'Dinleme Odası' };
    }
    // Varsayılan text odası
    return { icon: Hash, color: '#3B82F6', glow: 'rgba(59,130,246,0.3)', sub: room.description || 'Yazı Kanalı' };
  };

  // Odaları API'den çek
  const fetchRooms = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/rooms`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRooms(() => {
          const merged = [...defaultRooms];
          data.forEach((room: RoomData) => {
            if (!merged.some(r => r.name === room.name)) {
              merged.push(room);
            }
          });
          return merged;
        });
      }
    } catch (err) {
      console.error('Odalar yüklenemedi:', err);
    }
  }, []);

  const handleRoomHover = (roomId: string) => {
    setHoveredRoom(roomId);
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    
    hoverTimeoutRef.current = window.setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/users`);
        if (res.ok) {
           const users = await res.json();
           setRoomUsers(users);
        }
      } catch (err) {
        console.error(err);
      }
    }, 400);
  };

  const handleRoomLeave = () => {
    setHoveredRoom(null);
    setRoomUsers([]);
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
  };

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5098';

  useEffect(() => {
    // Check URL parameters for email verification or password reset
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    const tokenParam = params.get('token');
    const userIdParam = params.get('userId');

    if (action === 'verify' && tokenParam && userIdParam) {
      setIsLoading(true);
      fetch(`${API_BASE_URL}/api/auth/verify-email?userId=${userIdParam}&token=${tokenParam}`)
        .then(async res => {
          if (res.ok) {
             const data = await res.json();
             setSuccessMsg(data.message || 'E-posta doğrulandı! Giriş yapabilirsiniz.');
          } else {
             const text = await res.text();
             setErrorMsg(text || 'Doğrulama başarısız.');
          }
        })
        .catch(() => setErrorMsg('Bağlantı hatası.'))
        .finally(() => setIsLoading(false));
      
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (action === 'reset' && tokenParam && userIdParam) {
      setResetToken(tokenParam);
      setResetUserId(userIdParam);
      setAuthState('reset');
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Check if token exists on load
    const token = localStorage.getItem('token');
    const savedUserId = localStorage.getItem('userId');
    const savedUsername = localStorage.getItem('username');
    const savedFirstName = localStorage.getItem('firstName') || '';
    const savedLastName = localStorage.getItem('lastName') || '';
    const savedAvatarId = localStorage.getItem('avatarId') || 'default';
    if (token && savedUsername && savedUserId) {
      setUserId(savedUserId);
      setUsername(savedUsername);
      setFirstName(savedFirstName);
      setLastName(savedLastName);
      setAvatarId(savedAvatarId);
      setAuthState('rooms');
      connectSignalR();
    }
  }, []);

  const connectSignalR = () => {
    signalrService.startConnection();
    const handleCountUpdate = (count: number) => setGlobalActiveUsers(count);
    signalrService.onActiveUserCountUpdated(handleCountUpdate);

    // Yeni oda oluşturulduğunda dinle
    const handleRoomCreated = (room: RoomData) => {
      setRooms(prev => {
        // Zaten listede varsa ekleme
        if (prev.some(r => r.id === room.id)) return prev;
        return [...prev, room];
      });
    };
    signalrService.onRoomCreated(handleRoomCreated);
  };

  useEffect(() => {
    if (!userId) return;

    const handleReceiveDM = (dm: any) => {
      // Sadece bize gelen mesajları kontrol et
      if (dm.receiverId === userId) {
        // Eğer o an o kullanıcının odasındaysak bildirim yapma
        let isCurrentlyFocused = false;
        setActiveDMUser(prev => {
          if (inDMRoom && prev?.id === dm.senderId) isCurrentlyFocused = true;
          return prev;
        });

        if (!isCurrentlyFocused) {
          playNotificationSound();
          setUnreadCounts(prev => ({
            ...prev,
            [dm.senderId]: (prev[dm.senderId] || 0) + 1
          }));

          // Kullanıcı aktif listede yoksa otomatik ekle
          setActiveDMs(prev => {
            if (!prev.some(u => u.id === dm.senderId)) {
              return [{
                id: dm.senderId,
                username: dm.senderUsername || 'Bilinmeyen Kullanıcı',
                firstName: '',
                lastName: '',
                avatarId: dm.senderAvatarId || 'default',
                customStatus: dm.senderCustomStatus || 'online',
                lastSeen: new Date().toISOString()
              }, ...prev];
            }
            return prev;
          });
        }
      }
    };

    const handleUserStatusChanged = (id: string, status: string, lastSeen: string) => {
      setActiveDMs(prev => prev.map(u => u.id === id ? { ...u, customStatus: status, lastSeen } : u));
      setActiveDMUser(prev => prev?.id === id ? { ...prev, customStatus: status, lastSeen } : prev);
    };

    signalrService.onReceiveDirectMessage(handleReceiveDM);
    signalrService.onUserStatusChanged(handleUserStatusChanged);

    return () => {
      signalrService.offReceiveDirectMessage(handleReceiveDM);
      signalrService.offUserStatusChanged(handleUserStatusChanged);
    };
  }, [userId, inDMRoom]);

  useEffect(() => {
    if (authState === 'rooms') {
      fetch(`${API_BASE_URL}/api/stats/active-users`)
        .then(res => res.json())
        .then(data => setGlobalActiveUsers(data.count))
        .catch(console.error);
      // Odaları yükle
      fetchRooms();
    }
  }, [authState, fetchRooms]);

  const handleLogin = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email || !password) {
      setErrorMsg('Tüm alanları doldurun');
      return;
    }
    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('token', data.token);
        localStorage.setItem('userId', data.userId);
        localStorage.setItem('username', data.username);
        localStorage.setItem('firstName', data.firstName || '');
        localStorage.setItem('lastName', data.lastName || '');
        localStorage.setItem('avatarId', data.avatarId || 'default');
        setUserId(data.userId);
        setUsername(data.username);
        setFirstName(data.firstName || '');
        setLastName(data.lastName || '');
        setAvatarId(data.avatarId || 'default');
        setAuthState('rooms');
        connectSignalR();
      } else {
        const errText = await res.text();
        setErrorMsg(errText || 'Giriş başarısız, e-posta veya şifre hatalı.');
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
    setSuccessMsg('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
      });
      if (res.ok) {
        const data = await res.json();
        setAuthState('login');
        setSuccessMsg(data.message || 'Kayıt başarılı. Lütfen e-posta adresinize gönderilen link ile hesabınızı doğrulayın.');
      } else {
        const text = await res.text();
        setErrorMsg(text || 'Kayıt başarısız.');
      }
    } catch (err) {
      setErrorMsg('Bağlantı hatası.');
    }
    setIsLoading(false);
  };

  const handleForgotPassword = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email) {
      setErrorMsg('Lütfen e-posta adresinizi girin.');
      return;
    }
    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      if (res.ok) {
        const data = await res.json();
        setSuccessMsg(data.message || 'Şifre sıfırlama bağlantısı gönderildi.');
      } else {
        const text = await res.text();
        setErrorMsg(text || 'İşlem başarısız.');
      }
    } catch (err) {
      setErrorMsg('Bağlantı hatası.');
    }
    setIsLoading(false);
  };

  const handleResetPassword = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!password) {
      setErrorMsg('Lütfen yeni şifrenizi girin.');
      return;
    }
    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: resetUserId, token: resetToken, newPassword: password })
      });
      if (res.ok) {
        const data = await res.json();
        setSuccessMsg(data.message || 'Şifreniz güncellendi. Giriş yapabilirsiniz.');
        setAuthState('login');
        setPassword('');
      } else {
        const text = await res.text();
        setErrorMsg(text || 'Sıfırlama başarısız.');
      }
    } catch (err) {
      setErrorMsg('Bağlantı hatası.');
    }
    setIsLoading(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('firstName');
    localStorage.removeItem('lastName');
    localStorage.removeItem('avatarId');
    setUsername('');
    setFirstName('');
    setLastName('');
    setAvatarId('default');
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

  const handleCreateRoom = async (data: { name: string; type: string; description?: string }) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_BASE_URL}/api/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText || 'Oda oluşturulamadı.');
    }
  };

  const handleStartDM = (user: ModalUserData) => {
    setActiveDMUser(user);
    setInDMRoom(true);
    setInRoom(false);
    setRoomId('');
    
    if (!activeDMs.some(u => u.id === user.id)) {
      setActiveDMs(prev => [user, ...prev]);
    }
    // Okunmamışları sıfırla
    setUnreadCounts(prev => {
      const copy = { ...prev };
      delete copy[user.id];
      return copy;
    });
    setIsNewMessageModalOpen(false);
  };

  const handleProfileSave = async (data: { username: string; firstName: string; lastName: string; avatarId: string }) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_BASE_URL}/api/auth/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText || 'Profil güncellenemedi.');
    }
    const result = await res.json();
    localStorage.setItem('token', result.token);
    localStorage.setItem('username', result.username);
    localStorage.setItem('firstName', result.firstName || '');
    localStorage.setItem('lastName', result.lastName || '');
    localStorage.setItem('avatarId', result.avatarId || 'default');
    
    setUsername(result.username);
    setFirstName(result.firstName || '');
    setLastName(result.lastName || '');
    setAvatarId(result.avatarId || 'default');
  };

  if (inRoom) return <ChatRoom username={username} avatarId={avatarId} roomId={roomId} onLeave={() => { setInRoom(false); setRoomId(''); }} />;
  if (inDMRoom && activeDMUser) return <DMChatRoom currentUser={{ id: userId, username }} targetUser={activeDMUser} API_BASE_URL={API_BASE_URL} onLeave={() => { setInDMRoom(false); setActiveDMUser(null); }} />;

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.6, staggerChildren: 0.08, delayChildren: 0.1 } },
  };
  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20, filter: 'blur(8px)' },
    visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] } },
  };

  // Odalar artık dinamik olarak API'den çekiliyor (useState rooms)

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden font-sans bg-[#0F172A]">

      {/* Bokeh / Soft Light Beams */}
      <Orb className="w-[600px] h-[600px] bg-[#7C3AED] blur-[150px] opacity-40 -top-32 -left-32 animate-[pulse_8s_ease-in-out_infinite]" />
      <Orb className="w-[500px] h-[500px] bg-[#8B5CF6] blur-[140px] opacity-40 top-1/2 -right-48 animate-[pulse_10s_ease-in-out_infinite_2s]" />
      <Orb className="w-[450px] h-[450px] bg-[#3B82F6] blur-[160px] opacity-30 bottom-[-100px] left-1/4 animate-[pulse_12s_ease-in-out_infinite_4s]" />




      {authState === 'rooms' && (
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }}
          className="absolute top-5 left-5 z-50 flex flex-col gap-6 max-h-[calc(100vh-40px)] w-64">
          
          <button 
            onClick={() => setIsProfileModalOpen(true)}
            className="flex items-center gap-3 p-2 pr-4 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 hover:border-[#7C3AED]/50 transition-all group backdrop-blur-md shrink-0 w-max"
          >
            <div className="w-10 h-10 rounded-full overflow-hidden border border-[#7C3AED] bg-[#1E293B] flex items-center justify-center text-xl">
              {getAvatarEmoji(avatarId)}
            </div>
            <div className="flex flex-col items-start">
              <span className="text-sm font-bold text-white group-hover:text-[#7C3AED] transition-colors">{username}</span>
              <span className="text-[10px] text-white/50">Profili Düzenle</span>
            </div>
          </button>

          {/* Özel Mesajlar (DM) Bölümü */}
          <div className="flex flex-col flex-1 min-h-0 bg-white/5 border border-white/10 rounded-3xl p-4 backdrop-blur-md">
            <div className="flex items-center justify-between mb-4 px-1">
              <div className="flex items-center gap-2">
                <MessageSquare size={16} className="text-[#7C3AED]" />
                <h3 className="text-sm font-bold text-white/80 uppercase tracking-wider">Özel Mesajlar</h3>
              </div>
            </div>

            {/* DM Listesi */}
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1 pr-2">
              {activeDMs.length === 0 ? (
                <div className="text-center py-6 text-white/30 text-[11px] px-2">
                  Henüz özel mesaj yok. Yeni bir mesaj başlat!
                </div>
              ) : (
                activeDMs.map(user => (
                  <button
                    key={user.id}
                    onClick={() => handleStartDM(user)}
                    className={`w-full flex items-center gap-3 p-2 rounded-xl transition-all ${
                      activeDMUser?.id === user.id ? 'bg-[#7C3AED]/20 border border-[#7C3AED]/30' : 'hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <div className="relative">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm bg-[#1E293B] border border-[#334155]">
                        {getAvatarEmoji(user.avatarId)}
                      </div>
                      <div className={`absolute -bottom-1 -right-1 w-3 h-3 border-2 border-[#0F172A] rounded-full ${user.customStatus === 'online' ? 'bg-green-500' : 'bg-gray-500'}`} />
                    </div>
                    <div className="flex flex-col items-start truncate flex-1">
                      <span className={`text-sm font-semibold truncate ${activeDMUser?.id === user.id ? 'text-white' : 'text-white/80'}`}>
                        {user.username}
                      </span>
                    </div>
                    {unreadCounts[user.id] > 0 && (
                      <div className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.6)] animate-pulse">
                        {unreadCounts[user.id]}
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>

            {/* Yeni Mesaj Butonu */}
            <button
              onClick={() => setIsNewMessageModalOpen(true)}
              className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#7C3AED]/10 text-[#7C3AED] hover:bg-[#7C3AED] hover:text-white transition-all font-semibold text-sm border border-[#7C3AED]/30 hover:shadow-[0_0_20px_rgba(124,58,237,0.3)] shrink-0"
            >
              <Plus size={16} />
              Yeni Mesaj
            </button>
          </div>
        </motion.div>
      )}

      <ProfileModal 
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        currentUsername={username}
        currentFirstName={firstName}
        currentLastName={lastName}
        currentAvatarId={avatarId}
        onSave={handleProfileSave}
      />

      <NewMessageModal
        isOpen={isNewMessageModalOpen}
        onClose={() => setIsNewMessageModalOpen(false)}
        onSelectUser={handleStartDM}
        API_BASE_URL={API_BASE_URL}
      />

      <CreateRoomModal
        isOpen={isCreateRoomModalOpen}
        onClose={() => setIsCreateRoomModalOpen(false)}
        onCreateRoom={handleCreateRoom}
      />

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
          <div className="relative mb-5 group inline-block cursor-pointer" onClick={() => setIsMainLogoFlipped(!isMainLogoFlipped)}>
            <div className="absolute -inset-3 rounded-3xl opacity-0 group-hover:opacity-100 transition-all duration-500 blur-xl pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.4) 0%, transparent 70%)' }} />
            
            {/* 3D Flip Logo */}
            <div 
              className="relative w-24 h-24"
              style={{ perspective: '1000px' }}
            >
              <div 
                className="relative w-full h-full"
                style={{
                  transformStyle: 'preserve-3d',
                  transform: isMainLogoFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                  transition: 'transform 0.7s cubic-bezier(0.4, 0.2, 0.2, 1)',
                }}
              >
                {/* Ön Yüz - Sandalye Logosu */}
                <div 
                  className="absolute inset-0 rounded-3xl overflow-hidden transition-all duration-500 group-hover:scale-110 group-hover:-translate-y-1"
                  style={{
                    backfaceVisibility: 'hidden',
                    boxShadow: '0 8px 32px rgba(124,58,237,0.3), 0 0 0 1px rgba(255,255,255,0.08)',
                    filter: 'drop-shadow(0 0 20px rgba(124,58,237,0.3))',
                  }}
                >
                  <img src="/logo.png" alt="SandalyeciMetin" className="w-full h-full object-cover transition-all duration-500 group-hover:brightness-110" />
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                    style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 60%)' }} />
                </div>

                {/* Arka Yüz - SM Logosu */}
                <div 
                  className="absolute inset-0 rounded-3xl overflow-hidden flex items-center justify-center transition-all duration-500 group-hover:scale-110 group-hover:-translate-y-1"
                  style={{
                    backfaceVisibility: 'hidden',
                    transform: 'rotateY(180deg)',
                    boxShadow: '0 8px 32px rgba(124,58,237,0.3), 0 0 0 1px rgba(255,255,255,0.08)',
                    filter: 'drop-shadow(0 0 20px rgba(124,58,237,0.3))',
                  }}
                >
                  <img src="/sm-logo.jpg" alt="SM" className="w-full h-full object-contain mix-blend-screen transition-all duration-500 group-hover:brightness-125" />
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                    style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.15) 0%, transparent 60%)' }} />
                </div>
              </div>
            </div>

            <div className="absolute -inset-1.5 rounded-3xl border border-violet-500/0 group-hover:border-violet-500/30 transition-all duration-500 group-hover:scale-105 pointer-events-none" />
          </div>
          <h1 className="text-[28px] font-[700] text-white mb-2 tracking-tight"
            style={{ textShadow: '0 0 40px rgba(124,58,237,0.4)' }}>
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
          {successMsg && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} 
              className="p-3 rounded-lg text-sm text-center" 
              style={{ background: 'rgba(52,211,153,0.1)', color: '#6ee7b7', border: '1px solid rgba(52,211,153,0.2)' }}>
              {successMsg}
            </motion.div>
          )}

          {authState === 'forgot' ? (
             <form onSubmit={handleForgotPassword} className="space-y-4">
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
                     background: focused === 'email' ? 'rgba(124,58,237,0.08)' : 'rgba(255,255,255,0.04)',
                     border: focused === 'email' ? '1px solid rgba(124,58,237,0.5)' : '1px solid rgba(255,255,255,0.08)',
                   }}
                 />
               </div>
               <motion.button
                 type="submit"
                 disabled={isLoading}
                 whileHover={{ scale: 1.02, y: -2 }}
                 whileTap={{ scale: 0.97 }}
                 className="relative w-full py-4 mt-2 rounded-2xl text-white font-semibold text-[15px] overflow-hidden cursor-pointer"
                 style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #8B5CF6 50%, #7C3AED 100%)', boxShadow: '0 8px 32px rgba(124,58,237,0.35), 0 1px 0 rgba(255,255,255,0.15) inset', opacity: isLoading ? 0.7 : 1 }}>
                 {isLoading ? 'Gönderiliyor...' : 'Şifre Sıfırlama Linki Gönder'}
               </motion.button>
               <div className="text-center pt-3">
                 <button type="button" onClick={() => { setAuthState('login'); setErrorMsg(''); setSuccessMsg(''); }}
                   className="text-[13px] font-semibold cursor-pointer transition-colors duration-200 hover:text-white"
                   style={{ color: 'rgba(124,58,237,0.8)' }}>
                   Giriş Ekranına Dön
                 </button>
               </div>
             </form>
          ) : authState === 'reset' ? (
             <form onSubmit={handleResetPassword} className="space-y-4">
               <div className="relative">
                 <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                 <input
                   type="password"
                   value={password}
                   onChange={e => setPassword(e.target.value)}
                   onFocus={() => setFocused('password')}
                   onBlur={() => setFocused(null)}
                   placeholder="Yeni Şifre"
                   className="w-full pl-12 pr-5 py-4 rounded-2xl text-white placeholder:text-white/20 text-[15px] outline-none transition-all duration-300"
                   style={{
                     background: focused === 'password' ? 'rgba(124,58,237,0.08)' : 'rgba(255,255,255,0.04)',
                     border: focused === 'password' ? '1px solid rgba(124,58,237,0.5)' : '1px solid rgba(255,255,255,0.08)',
                   }}
                 />
               </div>
               <motion.button
                 type="submit"
                 disabled={isLoading}
                 whileHover={{ scale: 1.02, y: -2 }}
                 whileTap={{ scale: 0.97 }}
                 className="relative w-full py-4 mt-2 rounded-2xl text-white font-semibold text-[15px] overflow-hidden cursor-pointer"
                 style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #8B5CF6 50%, #7C3AED 100%)', boxShadow: '0 8px 32px rgba(124,58,237,0.35), 0 1px 0 rgba(255,255,255,0.15) inset', opacity: isLoading ? 0.7 : 1 }}>
                 {isLoading ? 'Güncelleniyor...' : 'Şifreyi Güncelle'}
               </motion.button>
             </form>
          ) : authState !== 'rooms' ? (
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
                      background: focused === 'username' ? 'rgba(124,58,237,0.08)' : 'rgba(255,255,255,0.04)',
                      border: focused === 'username' ? '1px solid rgba(124,58,237,0.5)' : '1px solid rgba(255,255,255,0.08)',
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
                    background: focused === 'email' ? 'rgba(124,58,237,0.08)' : 'rgba(255,255,255,0.04)',
                    border: focused === 'email' ? '1px solid rgba(124,58,237,0.5)' : '1px solid rgba(255,255,255,0.08)',
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
                    background: focused === 'password' ? 'rgba(124,58,237,0.08)' : 'rgba(255,255,255,0.04)',
                    border: focused === 'password' ? '1px solid rgba(124,58,237,0.5)' : '1px solid rgba(255,255,255,0.08)',
                  }}
                />
              </div>

              <motion.button
                type="submit"
                disabled={isLoading}
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.97 }}
                className="relative w-full py-4 mt-2 rounded-2xl text-white font-semibold text-[15px] overflow-hidden cursor-pointer"
                style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #8B5CF6 50%, #7C3AED 100%)', boxShadow: '0 8px 32px rgba(124,58,237,0.35), 0 1px 0 rgba(255,255,255,0.15) inset', opacity: isLoading ? 0.7 : 1 }}>
                <span className="relative flex items-center justify-center gap-2">
                  <Sparkles size={16} />
                  {isLoading ? 'Bekleniyor...' : (authState === 'login' ? 'Giriş Yap' : 'Kayıt Ol')}
                </span>
              </motion.button>

              <div className="text-center pt-3">
                {authState === 'login' && (
                  <div className="mb-2">
                    <button type="button" onClick={() => { setAuthState('forgot'); setErrorMsg(''); setSuccessMsg(''); }}
                      className="text-[13px] transition-colors duration-200 hover:text-white"
                      style={{ color: 'rgba(255,255,255,0.5)' }}>
                      Şifremi Unuttum
                    </button>
                  </div>
                )}
                <span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  {authState === 'login' ? 'Hesabın yok mu? ' : 'Zaten hesabın var mı? '}
                </span>
                <button type="button" onClick={() => { setAuthState(authState === 'login' ? 'register' : 'login'); setErrorMsg(''); setSuccessMsg(''); }}
                  className="text-[13px] font-semibold cursor-pointer transition-colors duration-200 hover:text-white"
                  style={{ color: 'rgba(124,58,237,0.8)' }}>
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

              {rooms
                .slice()
                .sort((a, b) => {
                  const getOrder = (name: string) => {
                    if (name === 'Ana Salon' || name === 'Genel Oda') return 1;
                    if (name === 'Müzik Odası') return 2;
                    return 3;
                  };
                  const aOrder = getOrder(a.name);
                  const bOrder = getOrder(b.name);
                  if (aOrder !== bOrder) return aOrder - bOrder;
                  return a.id - b.id;
                })
                .map((room) => {
                const visuals = getRoomVisuals(room);
                const RoomIcon = visuals.icon;
                return (
                <motion.button
                  key={room.id}
                  onClick={() => handleJoinRoom(room.name)}
                  onMouseEnter={() => handleRoomHover(room.name)}
                  onMouseLeave={handleRoomLeave}
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  className="group w-full flex items-center justify-between p-4 rounded-2xl cursor-pointer text-left transition-all duration-300 relative overflow-hidden"
                  style={{
                    background: hoveredRoom === room.name ? `${visuals.color}14` : 'rgba(255,255,255,0.03)',
                    border: hoveredRoom === room.name ? `1px solid ${visuals.color}40` : '1px solid rgba(255,255,255,0.06)',
                    boxShadow: hoveredRoom === room.name ? `0 8px 32px ${visuals.glow}` : 'none',
                  }}>

                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    style={{ background: `radial-gradient(circle at 20% 50%, ${visuals.glow} 0%, transparent 60%)` }} />

                  <div className="relative flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-300"
                      style={{
                        background: `${visuals.color}15`,
                        border: `1px solid ${visuals.color}30`,
                        boxShadow: hoveredRoom === room.name ? `0 0 20px ${visuals.glow}` : 'none',
                      }}>
                      <RoomIcon size={18} style={{ color: visuals.color }} />
                    </div>
                    <div>
                      <div className="text-[15px] font-semibold text-white">{room.name}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/70" />
                        <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{visuals.sub}</span>
                      </div>
                      {hoveredRoom === room.name && roomUsers.length > 0 && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-2 text-xs flex flex-wrap gap-1">
                           {roomUsers.map((u, i) => (
                             <span key={i} className="bg-white/10 px-2 py-0.5 rounded text-white/80">{u.username}</span>
                           ))}
                        </motion.div>
                      )}
                    </div>
                  </div>

                  <motion.div animate={{ x: hoveredRoom === room.name ? 3 : 0 }} transition={{ duration: 0.2 }}>
                    <ChevronRight size={18} style={{ color: hoveredRoom === room.name ? visuals.color : 'rgba(255,255,255,0.2)' }} />
                  </motion.div>
                </motion.button>
                );
              })}

              <div className="text-center pt-3">
                <span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.25)' }}>Yeni bir oda mı açmak istiyorsun? </span>
                <button onClick={() => setIsCreateRoomModalOpen(true)}
                  className="text-[13px] font-semibold cursor-pointer transition-colors duration-200 hover:text-white"
                  style={{ color: 'rgba(124,58,237,0.8)' }}>
                  Tıkla
                </button>
              </div>
            </motion.div>
          )}
        </div>

        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2/3 h-px bg-gradient-to-r from-transparent via-violet-500/30 to-transparent" />
      </motion.div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
        className="absolute bottom-8 flex items-center gap-3">
        
        {/* 3D Flip Logo Container */}
        <div 
          className="relative w-7 h-7 cursor-pointer z-50" 
          style={{ perspective: '1000px' }}
          onClick={() => setIsLogoFlipped(!isLogoFlipped)}
        >
          <div 
            className="relative w-full h-full"
            style={{ 
              transformStyle: 'preserve-3d', 
              transform: isLogoFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
              transition: 'transform 0.7s cubic-bezier(0.4, 0.2, 0.2, 1)'
            }}
          >
            {/* Ön Yüz (Sandalye - Orijinal Logo) */}
            <div 
              className="absolute inset-0 flex items-center justify-center"
              style={{ backfaceVisibility: 'hidden' }}
            >
              <img src="/logo.png" alt="Sandalye" className="w-full h-full object-contain mix-blend-screen transition-all duration-300 hover:drop-shadow-[0_0_10px_rgba(0,191,255,0.8)] opacity-90 hover:opacity-100" />
            </div>
            
            {/* Arka Yüz (SM Keskin Logo) */}
            <div 
              className="absolute inset-0 flex items-center justify-center"
              style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
            >
              <img src="/sm-logo.jpg" alt="SM" className="w-full h-full object-contain mix-blend-screen transition-all duration-300 hover:drop-shadow-[0_0_15px_rgba(124,58,237,0.8)] opacity-90 hover:opacity-100" />
            </div>
          </div>
        </div>
        <span className="text-[11px] font-[500] tracking-[0.2em] uppercase"
          style={{ color: 'rgba(255,255,255,0.2)' }}>SANDALYECIMETIN</span>
      </motion.div>

      {/* Sabit Sosyal Medya İkonları */}
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1 }}
        className="fixed bottom-5 right-5 flex flex-col gap-3 z-50">
        <a href="https://github.com/efecanefee" target="_blank" rel="noopener noreferrer" 
           className="p-3 rounded-2xl bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 hover:border-primary-main/50 hover:shadow-[0_0_15px_rgba(124,58,237,0.6)] backdrop-blur-md transition-all duration-300">
          <Github size={20} />
        </a>
        <a href="https://www.linkedin.com/in/efecanefee/" target="_blank" rel="noopener noreferrer" 
           className="p-3 rounded-2xl bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 hover:border-[#0a66c2]/50 hover:shadow-[0_0_15px_rgba(10,102,194,0.6)] backdrop-blur-md transition-all duration-300">
          <Linkedin size={20} />
        </a>
        <a href="https://www.instagram.com/efecan.efeee/" target="_blank" rel="noopener noreferrer" 
           className="p-3 rounded-2xl bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 hover:border-[#e1306c]/50 hover:shadow-[0_0_15px_rgba(225,48,108,0.6)] backdrop-blur-md transition-all duration-300">
          <Instagram size={20} />
        </a>
      </motion.div>
    </div>
  );
}

export default App;

