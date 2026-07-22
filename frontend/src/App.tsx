import { useState, useEffect, useRef, useCallback, memo } from 'react';
import ChatRoom from './components/ChatRoom';
import TextChatRoom from './components/TextChatRoom';
import DMChatRoom from './components/DMChatRoom';
import MiniDock from './components/MiniDock';
import ProfileModal from './components/ProfileModal';
import CreateRoomModal from './components/CreateRoomModal';
import MyServersPanel from './components/MyServersPanel';
import NewMessageModal, { type UserData as ModalUserData } from './components/NewMessageModal';
import SettingsModal from './components/SettingsModal';
import StatusMenu from './components/StatusMenu';
import { useSettings } from './contexts/SettingsContext';
import { renderAvatar } from './constants/avatars';
import { playNotificationSound } from './utils/sound';
import { Lock, Mail, MessageSquare, Plus, User, Menu, X, Sparkles, Github, Linkedin, Instagram, ChevronDown, Mic, MicOff, Headphones, Settings, Search, Trash2, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Variants } from 'framer-motion';
import signalrService from './services/signalrService';
import RoomCard from './components/RoomCard';
import ClockPanel from './components/ClockPanel';
import ActivityFeed from './components/ActivityFeed';
import VoiceConnectedPill from './components/VoiceConnectedPill';

// Baslik harf harf yalnizca ilk goruntulemede animasyonlanir. memo: App'in her
// render'inda 15 motion.span'in yeniden olusturulmasini engeller.
const AnimatedTitle = memo(function AnimatedTitle() {
  return (
    <h1 className="text-[22px] sm:text-[24px] md:text-[28px] font-[700] text-white mb-2 tracking-tight flex justify-center text-shine"
      style={{ textShadow: '0 0 40px #00B4D860' }}>
      {'SandalyeciMetin'.split('').map((char, index) => (
        <motion.span
          key={index}
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 + index * 0.03, duration: 0.3, ease: 'easeOut' }}
        >
          {char === ' ' ? ' ' : char}
        </motion.span>
      ))}
    </h1>
  );
});

// Kaba sifre gucu gostergesi. Amac kullaniciya yon vermek — gercek zorunluluk
// backend'de olmali, buradaki skor yalnizca gorsel geri bildirim.
const PASSWORD_LEVELS = [
  { label: 'Çok zayıf', color: '#ef4444' },
  { label: 'Zayıf', color: '#f59e0b' },
  { label: 'Orta', color: '#eab308' },
  { label: 'İyi', color: '#22c55e' },
  { label: 'Güçlü', color: '#10b981' },
];

function passwordScore(pw: string): number {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, PASSWORD_LEVELS.length);
}

function App() {
  const [authState, setAuthState] = useState<'login' | 'register' | 'rooms' | 'forgot' | 'reset'>('login');
  const [successMsg, setSuccessMsg] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetUserId, setResetUserId] = useState('');
  const [inRoom, setInRoom] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [avatarId, setAvatarId] = useState('default');
  const [myCustomStatus, setMyCustomStatus] = useState('online');
  const [myCustomStatusMessage, setMyCustomStatusMessage] = useState('');
  const [myShowLastSeen, setMyShowLastSeen] = useState(true);
  const [userId, setUserId] = useState(localStorage.getItem('userId') || '');
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  // Varsayilan kapali: lobi ilk boyamada DM listesini render etmesin.
  const [isDMOpen, setIsDMOpen] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isCreateRoomModalOpen, setIsCreateRoomModalOpen] = useState(false);
  const [isNewMessageModalOpen, setIsNewMessageModalOpen] = useState(false);
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const profileButtonRef = useRef<HTMLButtonElement>(null);
  const [roomId, setRoomId] = useState('');
  const [inDMRoom, setInDMRoom] = useState(false);
  const [activeDMs, setActiveDMs] = useState<ModalUserData[]>([]);
  const [activeDMUser, setActiveDMUser] = useState<ModalUserData | null>(null);
  // Oda içindeyken odadan çıkmadan açılan DM overlay'i
  const [roomDMUser, setRoomDMUser] = useState<ModalUserData | null>(null);
  const [onlineUserList, setOnlineUserList] = useState<string[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [globalActiveUsers, setGlobalActiveUsers] = useState(0);
  const [focused, setFocused] = useState<'username' | 'email' | 'password' | 'passwordConfirm' | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const { settings } = useSettings();
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMainLogoFlipped, setIsMainLogoFlipped] = useState(false);
  // Sunucularim paneli: varsayilan kapali — istek uzerine acilir, listesi de
  // ancak o zaman yuklenir (lobide gereksiz fetch ve render maliyeti yok).
  const [isServersOpen, setIsServersOpen] = useState(false);
  // Odadan her dönüşte artar → "Sunucularım" listesi yeniden çekilir
  // (üyelik katılma/çıkma ile değişmiş olabilir; rooms.length bunu yakalamaz).
  const [serverListVersion, setServerListVersion] = useState(0);

  const handleUpdatePrivacy = async (showLastSeen: boolean) => {
    setMyShowLastSeen(showLastSeen);
    try {
      const token = localStorage.getItem('token');
      if (token) {
        await fetch(`${API_BASE_URL}/api/users/privacy`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ showLastSeen })
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Dinamik oda listesi
  type RoomData = {
    id: number;
    name: string;
    type: string;
    description?: string;
    createdBy: string;
    createdAt: string;
    isPrivate?: boolean;
    roomCode?: string;
  };
  const defaultRooms: RoomData[] = [
    { id: -1, name: 'Ana Salon', type: 'text', description: 'Sohbet Odası', createdBy: 'system', createdAt: new Date().toISOString() },
    { id: -2, name: 'Müzik Odası', type: 'text', description: 'Dinleme Odası', createdBy: 'system', createdAt: new Date().toISOString() }
  ];

  const [rooms, setRooms] = useState<RoomData[]>(defaultRooms);
  const [activeRoom, setActiveRoom] = useState<RoomData | null>(null);
  // Oda sayfası (0: Ana Odalar, 1: Topluluk Odaları) — spring slayt geçişi
  const [roomPage, setRoomPage] = useState(0);

  const roomPagerRef = useRef<HTMLDivElement>(null); // slayt genişliği ölçümü (swipe eşiği)
  // Topluluk odası arama
  const [roomSearchQuery, setRoomSearchQuery] = useState('');
  const [roomSearchResults, setRoomSearchResults] = useState<RoomData[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  // Oda silme onay diyalogu
  const [deleteConfirmRoom, setDeleteConfirmRoom] = useState<RoomData | null>(null);
  const [isDeletingRoom, setIsDeletingRoom] = useState(false);

  // Oda karti kendi bileseninde (RoomCard): hover gorselleri CSS'te, odadaki
  // kullanici listesi kartin kendi state'inde — App bu yuzden hover'da
  // yeniden render OLMAZ.
  const renderRoomCard = (room: RoomData, opts?: { showMeta?: boolean }) => (
    <RoomCard
      key={room.id}
      room={room}
      isOwner={room.createdBy === username && room.id > 0}
      showMeta={opts?.showMeta ?? false}
      apiBaseUrl={API_BASE_URL}
      onJoin={() => handleJoinRoom(room)}
      onDelete={() => setDeleteConfirmRoom(room)}
    />
  );

  // Odaları API'den çek
  const fetchRooms = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/rooms`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.status === 401) {
        handleLogout();
        return;
      }
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
    // Onceki oturum "offline" birakmis olabilir; oturum acikken kendimizi cevrim ici goster.
    const rawSavedStatus = localStorage.getItem('customStatus') || 'online';
    const savedStatus = rawSavedStatus === 'offline' ? 'online' : rawSavedStatus;
    const savedStatusMsg = localStorage.getItem('customStatusMessage') || '';
    const savedShowLastSeen = localStorage.getItem('showLastSeen') !== 'false'; // default true

    if (token && savedUsername && savedUserId) {
      setUserId(savedUserId);
      setUsername(savedUsername);
      setFirstName(savedFirstName);
      setLastName(savedLastName);
      setAvatarId(savedAvatarId);
      setMyCustomStatus(savedStatus);
      setMyCustomStatusMessage(savedStatusMsg);
      setMyShowLastSeen(savedShowLastSeen);
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
      // Gizli odaları listeye ekleme (sadece kod ile bulunur)
      if (room.isPrivate) return;
      setRooms(prev => {
        // Zaten listede varsa ekleme
        if (prev.some(r => r.id === room.id)) return prev;
        return [...prev, room];
      });
    };
    signalrService.onRoomCreated(handleRoomCreated);

    // Oda silindiğinde dinle
    const handleRoomDeleted = (deletedRoomId: number) => {
      setRooms(prev => prev.filter(r => r.id !== deletedRoomId));
      setRoomSearchResults(prev => prev ? prev.filter(r => r.id !== deletedRoomId) : prev);
      // Silinen odadaysak dışarı çık
      setActiveRoom(prev => {
        if (prev && prev.id === deletedRoomId) {
          setInRoom(false);
          setRoomId('');
          return null;
        }
        return prev;
      });
    };
    signalrService.onRoomDeleted(handleRoomDeleted);

    // Oda güncellendiğinde (açıklama) dinle
    const handleRoomUpdated = (data: { id: number; description?: string }) => {
      setRooms(prev => prev.map(r => r.id === data.id ? { ...r, description: data.description } : r));
      setRoomSearchResults(prev => prev ? prev.map(r => r.id === data.id ? { ...r, description: data.description } : r) : prev);
      setActiveRoom(prev => prev && prev.id === data.id ? { ...prev, description: data.description } : prev);
    };
    signalrService.onRoomUpdated(handleRoomUpdated);
  };

  useEffect(() => {
    if (!userId) return;

    const handleReceiveDM = (dm: any) => {
      const isOutgoing = dm.senderId === userId;
      const contactId = isOutgoing ? dm.receiverId : dm.senderId;

      if (!isOutgoing) {
        // Eğer o an o kullanıcının sohbetindeysek (tam DM veya oda içi overlay) bildirim yapma
        let isCurrentlyFocused = false;
        setActiveDMUser(prev => {
          if (inDMRoom && prev?.id === contactId) isCurrentlyFocused = true;
          return prev;
        });
        if (roomDMUser?.id === contactId) isCurrentlyFocused = true;

        if (!isCurrentlyFocused) {
          playNotificationSound();
          setUnreadCounts(prev => ({
            ...prev,
            [contactId]: (prev[contactId] || 0) + 1
          }));
        }
      }

      // Mesajlaşılan kişiyi her zaman en üste al (WhatsApp tarzı)
      setActiveDMs(prev => {
        const existingIndex = prev.findIndex(u => u.id === contactId);
        
        if (existingIndex !== -1) {
          if (existingIndex === 0) return prev; // Zaten en üstteyse değiştirme
          const contact = prev[existingIndex];
          return [contact, ...prev.filter((_, i) => i !== existingIndex)];
        } else if (!isOutgoing) {
          // Yeni kişiyse ve mesaj geldiyse başa ekle
          return [{
            id: dm.senderId,
            username: dm.senderUsername || dm.SenderUsername || 'Bilinmeyen Kullanıcı',
            firstName: '',
            lastName: '',
            avatarId: dm.senderAvatarId || dm.SenderAvatarId || 'default',
            customStatus: dm.senderCustomStatus || dm.SenderCustomStatus || 'online',
            customStatusMessage: dm.senderCustomStatusMessage || dm.SenderCustomStatusMessage,
            lastSeen: new Date().toISOString()
          }, ...prev];
        }
        return prev;
      });
    };

    const handleUserStatusChanged = (data: { userId: string, status: string, message?: string,  lastSeen?: string; }) => {
      const { userId: id, status, message, lastSeen } = data;
      if (id === userId) {
        // Hub gorunmez kullaniciyi herkese (kendine de) "offline" yayinlar; yereldeki
        // "invisible" secimini ezme. Reconnect sirasindaki "offline" olaylarini da yok say.
        setMyCustomStatus(prev => {
          if (prev === 'invisible' || status === 'offline') return prev;
          localStorage.setItem('customStatus', status);
          return status;
        });
      }
      setActiveDMs(prev => prev.map(u => u.id === id ? { ...u, customStatus: status, customStatusMessage: message, lastSeen } : u));
      setActiveDMUser(prev => prev?.id === id ? { ...prev, customStatus: status, customStatusMessage: message, lastSeen } : prev);
    };

    signalrService.onReceiveDirectMessage(handleReceiveDM);
    signalrService.onUserStatusChanged(handleUserStatusChanged);

    return () => {
      signalrService.offReceiveDirectMessage(handleReceiveDM);
      signalrService.offUserStatusChanged(handleUserStatusChanged);
    };
  }, [userId, inDMRoom, roomDMUser]);

  const fetchRecentDMs = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/directmessages/recent`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401) {
        handleLogout();
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setActiveDMs(data);
      }
    } catch (e) {
      console.error('Son konuşulanlar yüklenemedi:', e);
    }
  }, [API_BASE_URL]);

  useEffect(() => {
    if (authState === 'rooms') {
      fetch(`${API_BASE_URL}/api/stats/active-users`)
        .then(res => res.json())
        .then(data => setGlobalActiveUsers(data.count))
        .catch(console.error);
      
      fetchRooms();
      fetchRecentDMs();
    }
  }, [authState, fetchRooms, fetchRecentDMs]);

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
        localStorage.setItem('customStatus', data.customStatus || 'online');
        localStorage.setItem('customStatusMessage', data.customStatusMessage || '');
        localStorage.setItem('showLastSeen', data.showLastSeen === false ? 'false' : 'true');
        
        setUserId(data.userId);
        setUsername(data.username);
        setFirstName(data.firstName || '');
        setLastName(data.lastName || '');
        setAvatarId(data.avatarId || 'default');
        setMyCustomStatus(data.customStatus || 'online');
        setMyCustomStatusMessage(data.customStatusMessage || '');
        setMyShowLastSeen(data.showLastSeen !== false);
        setAuthState('rooms');
        connectSignalR();
      } else {
        const errText = await res.text();
        setErrorMsg(errText || 'Giriş başarısız, e-posta veya şifre hatalı.');
      }
    } catch {
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
    // Tek alanla yazim hatasi fark edilmiyordu: hesap olusuyor ama kullanici
    // bir daha giremiyordu.
    if (password !== passwordConfirm) {
      setErrorMsg('Şifreler eşleşmiyor');
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
        setPasswordConfirm('');
        setShowPassword(false);
        setSuccessMsg(data.message || 'Kayıt başarılı. Lütfen e-posta adresinize gönderilen link ile hesabınızı doğrulayın.');
      } else {
        const text = await res.text();
        setErrorMsg(text || 'Kayıt başarısız.');
      }
    } catch {
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
    } catch {
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
    } catch {
      setErrorMsg('Bağlantı hatası.');
    }
    setIsLoading(false);
  };

  const handleUpdateStatus = async (status: string, message: string = '') => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/users/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ customStatus: status, customStatusMessage: message })
      });
      if (res.ok) {
        setMyCustomStatus(status);
        setMyCustomStatusMessage(message);
        localStorage.setItem('customStatus', status);
        localStorage.setItem('customStatusMessage', message);
      }
    } catch (err) {
      console.error('Durum güncellenirken hata oluştu:', err);
    }
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

  const handleJoinRoom = (room: RoomData) => {
    // Arkaplanda süren sesli oturum varken aynı odaya girmek sadece görünümü
    // geri açar (yeniden bağlanma yok). Farklı odaya geçişte eski oturum
    // key değişimiyle temiz kapanır — kullanıcıya sor.
    if (activeRoom && !inRoom) {
      if (activeRoom.id === room.id) {
        setInRoom(true);
        return;
      }
      const wasVoice = activeRoom.id < 0 || activeRoom.name === 'Ana Salon' || activeRoom.name === 'Müzik Odası' || activeRoom.type === 'voice';
      if (wasVoice && !window.confirm(`"${activeRoom.name}" sesli sohbetinden ayrılıp "${room.name}" odasına geçilsin mi?`)) {
        return;
      }
    }
    setActiveRoom(room);
    setRoomId(room.name);
    setInRoom(true);
  };

  const handleCreateRoom = async (data: { name: string; description?: string; isPrivate: boolean }) => {
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
    const created = await res.json();
    // Oluşturan kişi olarak listeye hemen ekle (gizli oda dahil — sadece kurucu görür)
    setRooms(prev => prev.some(r => r.id === created.id) ? prev : [...prev, created]);
    return { name: created.name, isPrivate: !!created.isPrivate, roomCode: created.roomCode };
  };

  // Oda arama (isim veya kod ile)
  const handleRoomSearch = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) {
      setRoomSearchResults(null);
      return;
    }
    setIsSearching(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/rooms/search?query=${encodeURIComponent(trimmed)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRoomSearchResults(data);
      } else {
        setRoomSearchResults([]);
      }
    } catch (err) {
      console.error('Oda araması başarısız:', err);
      setRoomSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [API_BASE_URL]);

  // Oda silme (onaylı)
  const handleDeleteRoom = async (room: RoomData) => {
    setIsDeletingRoom(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/rooms/${room.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok || res.status === 204) {
        setRooms(prev => prev.filter(r => r.id !== room.id));
        setRoomSearchResults(prev => prev ? prev.filter(r => r.id !== room.id) : prev);
        setDeleteConfirmRoom(null);
      } else {
        const errText = await res.text();
        alert(errText || 'Oda silinemedi.');
      }
    } catch (err) {
      console.error('Oda silme hatası:', err);
      alert('Oda silinirken bir hata oluştu.');
    } finally {
      setIsDeletingRoom(false);
    }
  };

  // Arama debounce
  useEffect(() => {
    const t = setTimeout(() => { handleRoomSearch(roomSearchQuery); }, 350);
    return () => clearTimeout(t);
  }, [roomSearchQuery, handleRoomSearch]);

  // Ok tuşları ile oda sayfaları arasında geçiş (yazı alanı odakta değilken)
  useEffect(() => {
    if (authState !== 'rooms' || inRoom || inDMRoom) return;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.key === 'ArrowRight') { setRoomPage(1); }
      else if (e.key === 'ArrowLeft') { setRoomPage(0); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [authState, inRoom, inDMRoom]);

  const handleStartDM = (user: ModalUserData) => {
    // Oda içindeysek odadan çıkma — DM'yi overlay olarak aç
    if (inRoom) {
      handleOpenRoomDM(user);
      setIsNewMessageModalOpen(false);
      return;
    }
    // Buraya yalnızca lobiden (inRoom=false) gelinir; arkaplanda sesli oturum
    // varsa roomId'ye dokunma — gizli ChatRoom'un props'u bozulmasın.
    setActiveDMUser(user);
    setInDMRoom(true);

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

  // Oda içindeyken DM overlay'i aç (SignalR singleton olduğu için oda bağlantısı kopmaz)
  const handleOpenRoomDM = (user: ModalUserData) => {
    setRoomDMUser(user);
    if (!activeDMs.some(u => u.id === user.id)) {
      setActiveDMs(prev => [user, ...prev]);
    }
    setUnreadCounts(prev => {
      const copy = { ...prev };
      delete copy[user.id];
      return copy;
    });
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

  // Sabit odalar (Ana Salon, Müzik Odası) ve SES odaları → ChatRoom (WebRTC).
  // Topluluk YAZI odaları → TextChatRoom (sadece mesajlaşma).
  const isVoiceStyle = !!activeRoom && (activeRoom.id < 0 || activeRoom.name === 'Ana Salon' || activeRoom.name === 'Müzik Odası' || activeRoom.type === 'voice');

  // Tam kapatma: oda oturumu unmount olur, ses/WebRTC kapanır. Üyelik
  // değişmiş olabilir (katılma / sunucudan çıkma) → "Sunucularım" tazelensin.
  const handleDisconnectRoom = () => { setInRoom(false); setRoomId(''); setActiveRoom(null); setRoomDMUser(null); setServerListVersion(v => v + 1); };
  // Lobiye dön: ses odalarında oturum arkaplanda mount kalır, ses sürer
  // (Discord tarzı). Yazı odalarında tutmanın anlamı yok — tam kapat.
  const handleReturnToLobby = () => {
    if (isVoiceStyle) { setInRoom(false); setRoomDMUser(null); }
    else handleDisconnectRoom();
  };

  // Oda oturumu ağacı: activeRoom set olduğu sürece mount kalır; lobideyken
  // yalnızca gizlenir ki sesli sohbet kopmasın. ChatRoom'daki key={activeRoom.id}
  // oda değişiminde tam unmount/remount garantiler (useWebRTC temizliği unmount'ta
  // çalışır). key="room-session" ise farklı return dallarında React'in bu ağacı
  // aynı düğüm olarak korumasını sağlar.
  const roomTree = activeRoom && (
      <div key="room-session" className={inRoom ? 'flex h-[100dvh] overflow-hidden bg-bg-base' : 'hidden'}>
        {/* Sol Mini Dock */}
        <MiniDock
          avatarId={avatarId}
          myCustomStatus={myCustomStatus}
          activeDMs={activeDMs}
          unreadCounts={unreadCounts}
          activeDMUserId={roomDMUser?.id}
          onLogoClick={handleReturnToLobby}
          onSelectDM={handleOpenRoomDM}
          onOpenProfile={() => setIsProfileModalOpen(true)}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
          onNewMessage={() => setIsNewMessageModalOpen(true)}
        />

        {/* Oda içeriği */}
        <div className="flex-1 min-w-0 relative">
          {isVoiceStyle ? (
            <ChatRoom key={activeRoom.id} username={username} avatarId={avatarId} roomId={roomId} roomDbId={activeRoom.id} myUserId={userId} roomDescription={activeRoom.description} onLeave={handleDisconnectRoom}
              onOpenProfile={() => setIsProfileModalOpen(true)}
              onOpenDM={(pu) => { if (pu.userId) handleOpenRoomDM({ id: pu.userId, username: pu.username, firstName: '', lastName: '', avatarId: pu.avatarId || 'default', customStatus: 'online' }); }}
            />
          ) : (
            <TextChatRoom key={activeRoom.id} username={username} avatarId={avatarId} roomId={roomId} roomDbId={activeRoom.id} myUserId={userId} roomInfo={{ name: activeRoom.name, description: activeRoom.description, createdBy: activeRoom.createdBy }} onLeave={handleDisconnectRoom}
              onOpenProfile={() => setIsProfileModalOpen(true)}
              onOpenDM={(pu) => { if (pu.userId) handleOpenRoomDM({ id: pu.userId, username: pu.username, firstName: '', lastName: '', avatarId: pu.avatarId || 'default', customStatus: 'online' }); }}
            />
          )}
        </div>

        {/* DM Overlay Paneli — oda bağlantısı kopmadan */}
        <AnimatePresence>
          {roomDMUser && (
            <>
              {/* Mobil karartma */}
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setRoomDMUser(null)}
                className="fixed inset-0 bg-black/60 z-40 md:hidden"
              />
              <motion.div
                initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="fixed top-0 right-0 h-full w-full md:w-[400px] z-50 shadow-2xl border-l border-white/10"
              >
                {/* Kapat butonu (overlay başlığı üzerinde) */}
                <button
                  onClick={() => setRoomDMUser(null)}
                  title="DM panelini kapat"
                  className="absolute top-3 right-3 z-[60] p-2 rounded-full bg-black/50 hover:bg-black/70 text-white/70 hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
                <DMChatRoom
                  currentUser={{ id: userId, username }}
                  targetUser={roomDMUser}
                  API_BASE_URL={API_BASE_URL}
                  onLeave={() => setRoomDMUser(null)}
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>

      </div>
  );

  // Lobideyken arkaplanda süren sesli oturum göstergesi
  const voicePill = activeRoom && !inRoom && isVoiceStyle && (
    <VoiceConnectedPill
      key="voice-pill"
      roomName={activeRoom.name}
      onReturn={() => setInRoom(true)}
      onDisconnect={handleDisconnectRoom}
    />
  );

  if (inRoom && activeRoom) {
    return (
      <>
        {roomTree}
        {/* Oda içinden erişilebilen modallar */}
        <ProfileModal
          isOpen={isProfileModalOpen}
          onClose={() => setIsProfileModalOpen(false)}
          currentUsername={username}
          currentFirstName={firstName}
          currentLastName={lastName}
          currentAvatarId={avatarId}
          onSave={handleProfileSave}
        />
        <SettingsModal
          isOpen={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
          showLastSeen={myShowLastSeen}
          onUpdatePrivacy={handleUpdatePrivacy}
        />
        <NewMessageModal
          isOpen={isNewMessageModalOpen}
          onClose={() => setIsNewMessageModalOpen(false)}
          onSelectUser={handleStartDM}
          API_BASE_URL={API_BASE_URL}
        />
      </>
    );
  }
  if (inDMRoom && activeDMUser) {
    return (
      <>
        {roomTree}
        <DMChatRoom currentUser={{ id: userId, username }} targetUser={activeDMUser} API_BASE_URL={API_BASE_URL} onLeave={() => { setInDMRoom(false); setActiveDMUser(null); }} />
        {voicePill}
      </>
    );
  }

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.35, staggerChildren: 0.05, delayChildren: 0.05 } },
  };
  const itemVariants: Variants = {
    hidden: { opacity: 0, y: settings.reducedMotion ? 0 : 12 },
    visible: { opacity: 1, y: 0, transition: { duration: settings.reducedMotion ? 0 : 0.3, ease: [0.25, 0.46, 0.45, 0.94] } },
  };

  // Odalar artık dinamik olarak API'den çekiliyor (useState rooms)

  return (
    <>
    {roomTree}
    {voicePill}
    <div className="relative min-h-screen flex flex-col items-center justify-start md:justify-center overflow-x-hidden overflow-y-auto py-6 px-4 md:px-6 font-sans bg-bg-base">

      {/* Statik arka plan: tek seferde boyanir, animasyon yok */}
      <div className="app-background" />




      <div className="relative z-10 w-full flex flex-col md:flex-row md:items-stretch justify-center gap-4 md:gap-4 max-w-full md:max-w-[1600px]">

      {authState === 'rooms' && (
        <>
          {/* Overlay (Mobile) */}
          {isSidebarOpen && (
            <div 
              className="fixed inset-0 bg-black/70 z-40 md:hidden"
              onClick={() => setIsSidebarOpen(false)}
            />
          )}

          {/* Sidebar */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15, duration: 0.3 }}
            className={`fixed md:static top-0 left-0 h-full md:h-auto z-50 md:z-auto flex flex-col gap-3 md:gap-4 w-72 md:w-64 md:shrink-0 max-h-screen md:max-h-[calc(100vh-40px)] bg-[#09090b] md:bg-transparent p-5 md:p-0 transition-transform duration-300 shadow-2xl md:shadow-none ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}
          >
            {/* Close Button (Mobile) */}
            <div className="flex md:hidden justify-end mb-[-10px]">
              <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-white/50 hover:text-white bg-white/5 rounded-full cursor-pointer">
                <X size={20} />
              </button>
            </div>
          
          <div className="flex items-center gap-1 bg-bg-surface/80 border border-white/10 p-1.5 rounded-full w-full shrink-0 relative md:bg-[rgba(20,20,26,0.55)] md:border md:border-white/10 md:rounded-[28px] md:p-4 md:backdrop-blur-[18px] md:shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
            <button 
              ref={profileButtonRef}
              onClick={(e) => {
                const target = e.target as HTMLElement;
                if (target.closest('.avatar-container')) {
                  setIsStatusMenuOpen(prev => !prev);
                } else {
                  setIsProfileModalOpen(true);
                }
              }}
              className="flex items-center gap-2 flex-1 hover:bg-white/10 p-1 rounded-full transition-all group overflow-hidden"
            >
              <div className="avatar-container relative cursor-pointer group/avatar">
                <div className="w-9 h-9 rounded-full overflow-hidden border border-primary-main bg-[#18181b] flex items-center justify-center text-lg shrink-0 group-hover/avatar:opacity-80 transition-opacity">
                  {renderAvatar(avatarId)}
                </div>
                <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 border-2 border-[#09090b] rounded-full ${myCustomStatus === 'online' ? 'bg-green-500' : myCustomStatus === 'idle' ? 'bg-yellow-500' : myCustomStatus === 'dnd' ? 'bg-red-500' : 'bg-gray-500'}`} />
              </div>
              <div className="flex flex-col items-start min-w-0 flex-1">
                <span className="text-sm font-bold text-white group-hover:text-primary-main transition-colors truncate w-full text-left">{username}</span>
                <span className="text-[10px] text-white/50 truncate w-full text-left">{myCustomStatusMessage || "Profili Düzenle"}</span>
              </div>
            </button>
            <div className="flex items-center pr-1 gap-0.5 shrink-0">
              <button 
                onClick={() => setIsMicMuted(!isMicMuted)}
                className="p-1.5 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                title={isMicMuted ? "Sesi Aç" : "Sustur"}
              >
                {isMicMuted ? <MicOff size={18} className="text-red-400" /> : <Mic size={18} />}
              </button>
              <button 
                onClick={() => setIsDeafened(!isDeafened)}
                className="p-1.5 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                title={isDeafened ? "Sağırlaştırmayı Kaldır" : "Sağırlaştır"}
              >
                {isDeafened ? <Headphones size={18} className="text-red-400" /> : <Headphones size={18} />}
              </button>
              <button 
                onClick={() => setIsSettingsModalOpen(true)}
                className="p-1.5 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                title="Ayarlar"
              >
                <Settings size={18} />
              </button>
            </div>
            <StatusMenu 
              isOpen={isStatusMenuOpen} 
              onClose={() => setIsStatusMenuOpen(false)} 
              currentStatus={myCustomStatus} 
              currentMessage={myCustomStatusMessage} 
              onUpdateStatus={handleUpdateStatus} 
              buttonRef={profileButtonRef} 
            />
          </div>

          {/* Özel Mesajlar (DM) Bölümü — layout spring'leri kaldirildi: panel
              boyutu CSS ile aninda degisir, icerik yalnizca opacity/transform
              ile girer (compositor isi, olcum-yerlesim animasyonu yok). */}
          <div
            className={`flex flex-col min-h-0 bg-bg-surface/60 border border-white/10 rounded-3xl p-4 overflow-hidden md:bg-[rgba(20,20,26,0.55)] md:border md:border-white/10 md:rounded-[28px] md:backdrop-blur-[18px] md:shadow-[0_8px_32px_rgba(0,0,0,0.3)] md:flex-1 ${isDMOpen ? 'flex-1' : ''}`}
          >
            <button
              onClick={() => setIsDMOpen(!isDMOpen)}
              className="flex items-center justify-between px-1 cursor-pointer w-full hover:bg-white/5 p-1 rounded-lg transition-colors group shrink-0"
            >
              <div className="flex items-center gap-2">
                <MessageSquare size={16} className="text-primary-main" />
                <h3 className="text-sm font-bold text-white/80 uppercase tracking-wider group-hover:text-white transition-colors">Özel Mesajlar</h3>
                {!isDMOpen && Object.values(unreadCounts).reduce((a, b) => a + b, 0) > 0 && (
                  <span className="ml-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.6)] animate-pulse">
                    {Object.values(unreadCounts).reduce((a, b) => a + b, 0)}
                  </span>
                )}
              </div>
              <ChevronDown size={16} className={`text-white/50 group-hover:text-white transition-transform duration-200 ${isDMOpen ? 'rotate-180' : ''}`} />
            </button>

            <div
              className={`flex flex-col overflow-hidden transition-opacity duration-200 ${isDMOpen ? 'flex-1 opacity-100 mt-2' : 'h-0 opacity-0 mt-0 pointer-events-none'}`}
            >
              {/* DM Listesi */}
              <div className="max-h-[60vh] flex-1 overflow-y-auto custom-scrollbar pr-2 pb-4 pt-2 -mx-2 px-2">
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
                        activeDMUser?.id === user.id ? 'bg-primary-main/20 border border-primary-main/30' : 'hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <div className="relative">
                        <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-sm bg-[#18181b] border border-[#334155]">
                          {renderAvatar(user.avatarId)}
                        </div>
                        <div className={`absolute -bottom-1 -right-1 w-3 h-3 border-2 border-[#09090b] rounded-full ${user.customStatus === 'online' ? 'bg-green-500' : user.customStatus === 'idle' ? 'bg-yellow-500' : user.customStatus === 'dnd' ? 'bg-red-500' : 'bg-gray-500'}`} />
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
                className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary-main/10 text-primary-main hover:bg-primary-main hover:text-white transition-all font-semibold text-sm border border-primary-main/30 hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.3)] shrink-0"
              >
                <Plus size={16} />
                Yeni Mesaj
              </button>
            </div>
          </div>
          </motion.div>
        </>
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

      {/* Oda Silme Onay Diyalogu */}
      <AnimatePresence>
        {deleteConfirmRoom && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
            onClick={(e) => { if (e.target === e.currentTarget && !isDeletingRoom) setDeleteConfirmRoom(null); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative w-full max-w-sm bg-[#09090b] border border-[#334155] rounded-3xl overflow-hidden shadow-2xl p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col items-center text-center gap-4">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', boxShadow: '0 0 24px rgba(239,68,68,0.2)' }}
                >
                  <AlertTriangle size={28} className="text-red-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Bu odayı silmek istediğine emin misin?</h3>
                  <p className="text-sm text-white/50 mt-2">
                    <span className="text-white/80 font-semibold">{deleteConfirmRoom.name}</span> odasındaki tüm mesajlar kalıcı olarak silinecektir. Bu işlem geri alınamaz.
                  </p>
                </div>
                <div className="flex gap-3 w-full mt-2">
                  <button
                    onClick={() => setDeleteConfirmRoom(null)}
                    disabled={isDeletingRoom}
                    className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 font-semibold text-sm transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    İptal
                  </button>
                  <button
                    onClick={() => handleDeleteRoom(deleteConfirmRoom)}
                    disabled={isDeletingRoom}
                    className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isDeletingRoom ? 'Siliniyor...' : <><Trash2 size={15} /> Sil</>}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobil tarih & saat şeridi + aktivite akışı — masaüstünde sağ kolonda */}
      {authState === 'rooms' && (
        <div className="md:hidden w-full max-w-[400px] mx-4 space-y-3">
          <div className="flex items-stretch gap-3">
            <button
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Menüyü aç"
              className="shrink-0 flex items-center justify-center px-4 rounded-3xl bg-bg-surface/60 border border-white/10 hover:bg-bg-surface text-white cursor-pointer"
            >
              <Menu size={24} />
            </button>
            <div className="flex-1 min-w-0">
              <ClockPanel compact />
            </div>
          </div>
          <ActivityFeed rooms={rooms} />
        </div>
      )}

      <motion.div variants={containerVariants} initial="hidden" animate="visible"
        className={`relative z-10 w-full max-w-[400px] mx-4 md:mx-0 flex flex-col max-h-screen md:max-h-[calc(100vh-40px)] bg-[rgba(20,20,26,0.55)] border border-white/10 rounded-[28px] shadow-[0_32px_80px_rgba(0,0,0,0.45)] backdrop-blur-[18px] ${authState === 'rooms' ? 'md:w-auto md:max-w-none md:flex-1' : ''}`}
        style={{
          padding: '36px 32px 24px 32px',
        }}>

        <motion.div variants={itemVariants} className="text-center mb-7">
          <div className="relative mb-5 group inline-block cursor-pointer" onClick={() => setIsMainLogoFlipped(!isMainLogoFlipped)}>
            <div className="absolute -inset-3 rounded-3xl opacity-0 group-hover:opacity-100 transition-all duration-500 blur-xl pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(var(--accent-rgb),0.4) 0%, transparent 70%)' }} />
            
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
                    boxShadow: '0 8px 32px rgba(var(--accent-rgb),0.3), 0 0 0 1px rgba(255,255,255,0.08)',
                    filter: 'drop-shadow(0 0 20px rgba(var(--accent-rgb),0.3))',
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
                    boxShadow: '0 8px 32px rgba(var(--accent-rgb),0.3), 0 0 0 1px rgba(255,255,255,0.08)',
                    filter: 'drop-shadow(0 0 20px rgba(var(--accent-rgb),0.3))',
                  }}
                >
                  <img src="/sm-logo.jpg" alt="SM" className="w-full h-full object-contain mix-blend-screen transition-all duration-500 group-hover:brightness-125" />
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                    style={{ background: 'linear-gradient(135deg, rgba(var(--accent-rgb),0.15) 0%, transparent 60%)' }} />
                </div>
              </div>
            </div>

            <div className="absolute -inset-1.5 rounded-3xl border border-violet-500/0 group-hover:border-violet-500/30 transition-all duration-500 group-hover:scale-105 pointer-events-none" />
          </div>
          <AnimatedTitle />
          <p className="text-[14px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
            {authState === 'rooms' ? `Hoş geldin, ${username}` : (authState === 'login' ? 'Hesabına giriş yap' : 'Yeni hesap oluştur')}
          </p>
        </motion.div>

        <div className="space-y-5 flex-1 flex flex-col min-h-0">
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
                   autoComplete="email"
                   className="w-full pl-12 pr-5 py-4 rounded-2xl text-white placeholder:text-white/20 text-[15px] outline-none transition-all duration-300"
                   style={{
                     background: focused === 'email' ? 'rgba(var(--accent-rgb),0.08)' : 'rgba(255,255,255,0.04)',
                     border: focused === 'email' ? '1px solid rgba(var(--accent-rgb),0.5)' : '1px solid rgba(255,255,255,0.08)',
                   }}
                 />
               </div>
               <button
                 type="submit"
                 disabled={isLoading}
                 className="btn-fx relative w-full py-4 mt-2 rounded-2xl text-white font-semibold text-[15px] overflow-hidden cursor-pointer"
                 style={{ background: 'linear-gradient(135deg, var(--color-primary-main) 0%, var(--accent-light) 50%, var(--color-primary-main) 100%)', boxShadow: '0 8px 32px rgba(var(--accent-rgb),0.35), 0 1px 0 rgba(255,255,255,0.15) inset', opacity: isLoading ? 0.7 : 1 }}>
                 {isLoading ? 'Gönderiliyor...' : 'Şifre Sıfırlama Linki Gönder'}
               </button>
               <div className="text-center pt-3">
                 <button type="button" onClick={() => { setAuthState('login'); setErrorMsg(''); setSuccessMsg(''); }}
                   className="text-[13px] font-semibold cursor-pointer transition-colors duration-200 hover:text-white"
                   style={{ color: 'rgba(var(--accent-rgb),0.8)' }}>
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
                   autoComplete="new-password"
                   className="w-full pl-12 pr-5 py-4 rounded-2xl text-white placeholder:text-white/20 text-[15px] outline-none transition-all duration-300"
                   style={{
                     background: focused === 'password' ? 'rgba(var(--accent-rgb),0.08)' : 'rgba(255,255,255,0.04)',
                     border: focused === 'password' ? '1px solid rgba(var(--accent-rgb),0.5)' : '1px solid rgba(255,255,255,0.08)',
                   }}
                 />
               </div>
               <button
                 type="submit"
                 disabled={isLoading}
                 className="btn-fx relative w-full py-4 mt-2 rounded-2xl text-white font-semibold text-[15px] overflow-hidden cursor-pointer"
                 style={{ background: 'linear-gradient(135deg, var(--color-primary-main) 0%, var(--accent-light) 50%, var(--color-primary-main) 100%)', boxShadow: '0 8px 32px rgba(var(--accent-rgb),0.35), 0 1px 0 rgba(255,255,255,0.15) inset', opacity: isLoading ? 0.7 : 1 }}>
                 {isLoading ? 'Güncelleniyor...' : 'Şifreyi Güncelle'}
               </button>
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
                    autoComplete="username"
                    className="w-full pl-12 pr-5 py-4 rounded-2xl text-white placeholder:text-white/20 text-[15px] outline-none transition-all duration-300"
                    style={{
                      background: focused === 'username' ? 'rgba(var(--accent-rgb),0.08)' : 'rgba(255,255,255,0.04)',
                      border: focused === 'username' ? '1px solid rgba(var(--accent-rgb),0.5)' : '1px solid rgba(255,255,255,0.08)',
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
                  autoComplete="email"
                  className="w-full pl-12 pr-5 py-4 rounded-2xl text-white placeholder:text-white/20 text-[15px] outline-none transition-all duration-300"
                  style={{
                    background: focused === 'email' ? 'rgba(var(--accent-rgb),0.08)' : 'rgba(255,255,255,0.04)',
                    border: focused === 'email' ? '1px solid rgba(var(--accent-rgb),0.5)' : '1px solid rgba(255,255,255,0.08)',
                  }}
                />
              </div>

              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onFocus={() => setFocused('password')}
                  onBlur={() => setFocused(null)}
                  placeholder="Şifre"
                  autoComplete={authState === 'register' ? 'new-password' : 'current-password'}
                  className="w-full pl-12 pr-12 py-4 rounded-2xl text-white placeholder:text-white/20 text-[15px] outline-none transition-all duration-300"
                  style={{
                    background: focused === 'password' ? 'rgba(var(--accent-rgb),0.08)' : 'rgba(255,255,255,0.04)',
                    border: focused === 'password' ? '1px solid rgba(var(--accent-rgb),0.5)' : '1px solid rgba(255,255,255,0.08)',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>

              {authState === 'register' && (
                <>
                  {/* Şifre gücü — yalnızca yazmaya başlayınca */}
                  {password && (
                    <div className="flex items-center gap-2 px-1">
                      <div className="flex gap-1 flex-1">
                        {PASSWORD_LEVELS.map((lvl, i) => (
                          <div
                            key={lvl.label}
                            className="h-1 flex-1 rounded-full transition-colors duration-200"
                            style={{ background: i < passwordScore(password) ? PASSWORD_LEVELS[passwordScore(password) - 1].color : 'rgba(255,255,255,0.08)' }}
                          />
                        ))}
                      </div>
                      <span className="text-[11px] shrink-0" style={{ color: PASSWORD_LEVELS[Math.max(0, passwordScore(password) - 1)].color }}>
                        {PASSWORD_LEVELS[Math.max(0, passwordScore(password) - 1)].label}
                      </span>
                    </div>
                  )}

                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={passwordConfirm}
                      onChange={e => setPasswordConfirm(e.target.value)}
                      onFocus={() => setFocused('passwordConfirm')}
                      onBlur={() => setFocused(null)}
                      placeholder="Şifre (Tekrar)"
                      autoComplete="new-password"
                      className="w-full pl-12 pr-5 py-4 rounded-2xl text-white placeholder:text-white/20 text-[15px] outline-none transition-all duration-300"
                      style={{
                        background: focused === 'passwordConfirm' ? 'rgba(var(--accent-rgb),0.08)' : 'rgba(255,255,255,0.04)',
                        border: passwordConfirm && password !== passwordConfirm
                          ? '1px solid rgba(239,68,68,0.6)'
                          : focused === 'passwordConfirm' ? '1px solid rgba(var(--accent-rgb),0.5)' : '1px solid rgba(255,255,255,0.08)',
                      }}
                    />
                  </div>
                  {passwordConfirm && password !== passwordConfirm && (
                    <p className="text-[12px] px-1" style={{ color: 'rgba(239,68,68,0.9)' }}>Şifreler eşleşmiyor</p>
                  )}
                </>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="btn-fx relative w-full py-4 mt-2 rounded-2xl text-white font-semibold text-[15px] overflow-hidden cursor-pointer"
                style={{ background: 'linear-gradient(135deg, var(--color-primary-main) 0%, var(--accent-light) 50%, var(--color-primary-main) 100%)', boxShadow: '0 8px 32px rgba(var(--accent-rgb),0.35), 0 1px 0 rgba(255,255,255,0.15) inset', opacity: isLoading ? 0.7 : 1 }}>
                <span className="relative flex items-center justify-center gap-2">
                  <Sparkles size={16} />
                  {isLoading ? 'Bekleniyor...' : (authState === 'login' ? 'Giriş Yap' : 'Kayıt Ol')}
                </span>
              </button>

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
                <button type="button" onClick={() => { setAuthState(authState === 'login' ? 'register' : 'login'); setErrorMsg(''); setSuccessMsg(''); setPasswordConfirm(''); setShowPassword(false); }}
                  className="text-[13px] font-semibold cursor-pointer transition-colors duration-200 hover:text-white"
                  style={{ color: 'rgba(var(--accent-rgb),0.8)' }}>
                  {authState === 'login' ? 'Kayıt Ol' : 'Giriş Yap'}
                </button>
              </div>
            </form>
          ) : (
            <motion.div variants={itemVariants} className="space-y-3 pt-2 flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.25)' }}>
                  Aktif Odalar
                </span>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 6px rgba(52,211,153,0.8)' }} />
                    <span 
                      className="text-[11px] group relative cursor-help" 
                      style={{ color: 'rgba(255,255,255,0.3)' }}
                      onMouseEnter={async () => {
                        try {
                          const token = localStorage.getItem('token');
                          const res = await fetch(`${API_BASE_URL}/api/users/online`, { headers: { Authorization: `Bearer ${token}` } });
                          if (res.ok) {
                            const data = await res.json();
                            if (data.length === 0) {
                              setOnlineUserList(['[Kimse Yok]']);
                            } else {
                              setOnlineUserList(data);
                            }
                          } else {
                            setOnlineUserList([`[Hata: Yüklenemedi (${res.status})]`]);
                          }
                        } catch {
                          setOnlineUserList(['[Hata: Bağlantı Yok]']);
                        }
                      }}
                      onMouseLeave={() => setOnlineUserList([])}
                    >
                      {globalActiveUsers} online
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max px-3 py-2 bg-[#09090b] border border-[#334155] rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 flex flex-col gap-1 text-[12px] font-medium text-white/90 max-h-48 overflow-y-auto">
                        {onlineUserList.length > 0 ? (
                          onlineUserList[0].startsWith('[Hata') ? (
                            <span className="text-red-400">{onlineUserList[0]}</span>
                          ) : onlineUserList[0].startsWith('[Kimse') ? (
                            <span className="text-white/50">{onlineUserList[0]}</span>
                          ) : (
                            onlineUserList.map(name => <span key={name} className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>{name}</span>)
                          )
                        ) : (
                          <span className="text-white/50">Yükleniyor...</span>
                        )}
                      </div>
                    </span>
                  </div>
                  <button onClick={handleLogout} className="text-[11px] text-red-400 hover:text-red-300 transition uppercase tracking-wider font-bold">
                    Çıkış
                  </button>
                </div>
              </div>

              {/* Kitap-çevirme iki sayfalı oda listesi */}
              {(() => {
                const fixedRooms = rooms.filter(r => r.id < 0 || r.name === 'Ana Salon' || r.name === 'Müzik Odası');
                const communityRooms = rooms
                  .filter(r => r.id > 0 && r.name !== 'Ana Salon' && r.name !== 'Müzik Odası')
                  .slice()
                  .sort((a, b) => a.id - b.id);
                const searchResults = roomSearchResults;
                const reduce = settings.reducedMotion;
                const goRoomPage = (n: number) => { if (n === roomPage) return; setRoomPage(n); };
                const tabs = [{ label: 'Ana Odalar', key: 0 }, { label: 'Topluluk Odaları', key: 1 }];

                const fixedPage = (
                  <div className="space-y-3 h-full overflow-y-auto custom-scrollbar pr-2 pb-2">
                    {fixedRooms.map((room) => renderRoomCard(room))}
                  </div>
                );

                const communityPage = (
                  <div className="flex flex-col h-full">
                    {/* Arama çubuğu */}
                    <div className="relative mb-3 shrink-0">
                      <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
                      <input
                        type="text"
                        value={roomSearchQuery}
                        onChange={(e) => setRoomSearchQuery(e.target.value)}
                        placeholder="İsim veya oda kodu ile ara..."
                        className="w-full bg-white/[0.03] border border-white/10 rounded-2xl pl-10 pr-9 py-3 text-white text-sm placeholder:text-white/25 outline-none focus:border-primary-main/50 transition-colors"
                      />
                      {roomSearchQuery && (
                        <button onClick={() => setRoomSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors">
                          <X size={15} />
                        </button>
                      )}
                    </div>

                    {/* Sonuçlar / liste — her satirda 2 oda, kaydirdikca devam eder */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-2">
                      {searchResults !== null ? (
                        isSearching ? (
                          <div className="text-center py-6 text-white/30 text-[12px]">Aranıyor...</div>
                        ) : searchResults.length === 0 ? (
                          <div className="text-center py-6 text-white/30 text-[12px] px-2">
                            Sonuç bulunamadı. Gizli bir oda için tam kodu girmelisin.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 content-start">
                            {searchResults.map((room) => renderRoomCard(room, { showMeta: true }))}
                          </div>
                        )
                      ) : communityRooms.length === 0 ? (
                        <div className="text-center py-6 text-white/30 text-[12px] px-2">
                          Henüz topluluk odası yok. İlk odayı sen oluştur!
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 content-start">
                          {communityRooms.map((room) => renderRoomCard(room, { showMeta: true }))}
                        </div>
                      )}
                    </div>
                  </div>
                );

                return (
                  <>
                    {/* Segment kontrol — arkada kayan mor hap (layoutId) */}
                    <div className="flex p-1 mb-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] shrink-0">
                      {tabs.map((t) => (
                        <button
                          key={t.key}
                          onClick={() => goRoomPage(t.key)}
                          className="relative flex-1 py-2 text-[13px] font-semibold rounded-xl transition-colors duration-200"
                          style={{ color: roomPage === t.key ? '#fff' : 'rgba(255,255,255,0.4)' }}
                        >
                          {roomPage === t.key && (
                            <motion.div
                              layoutId="roomTabPill"
                              className="absolute inset-0 rounded-xl"
                              style={{ background: 'rgba(var(--accent-rgb),0.9)', boxShadow: '0 4px 16px rgba(var(--accent-rgb),0.35)' }}
                              transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 34 }}
                            />
                          )}
                          <span className="relative z-10">{t.label}</span>
                        </button>
                      ))}
                    </div>

                    {/* İçerik: iki sayfa da yerinde durur, ray yalnizca
                        translateX ile kayar. Unmount/popLayout yok — cikan
                        sayfa akistan kopmadigi icin yerlesim hic bozulmaz,
                        transform animasyonu da tamamen compositor'da. */}
                    <div ref={roomPagerRef} className="relative flex-1 min-h-0 overflow-hidden">
                      <motion.div
                        className="flex h-full"
                        initial={false}
                        animate={{ x: roomPage === 0 ? '0%' : '-100%' }}
                        transition={reduce ? { duration: 0 } : { type: 'tween', duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
                      >
                        <div
                          className="w-full h-full shrink-0 flex flex-col"
                          aria-hidden={roomPage !== 0}
                          style={{ pointerEvents: roomPage === 0 ? 'auto' : 'none' }}
                        >
                          {fixedPage}
                        </div>
                        <div
                          className="w-full h-full shrink-0 flex flex-col"
                          aria-hidden={roomPage !== 1}
                          style={{ pointerEvents: roomPage === 1 ? 'auto' : 'none' }}
                        >
                          {communityPage}
                        </div>
                      </motion.div>
                    </div>

                    {/* Sayfa göstergesi: alta iki nokta (swipe ipucu) */}
                    <div className="flex items-center justify-center gap-2 pt-3 shrink-0">
                      {tabs.map((t) => (
                        <button key={t.key} onClick={() => goRoomPage(t.key)} className="group py-1" title={t.label} aria-label={t.label}>
                          <div className={`h-1.5 rounded-full transition-all duration-300 ${roomPage === t.key ? 'w-5 bg-primary-main' : 'w-1.5 bg-white/20 group-hover:bg-white/40'}`} />
                        </button>
                      ))}
                    </div>
                  </>
                );
              })()}

              <div className="text-center pt-3 shrink-0">
                <span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.25)' }}>Yeni bir oda mı açmak istiyorsun? </span>
                <button onClick={() => setIsCreateRoomModalOpen(true)}
                  className="text-[13px] font-semibold cursor-pointer transition-colors duration-200 hover:text-white"
                  style={{ color: 'rgba(var(--accent-rgb),0.8)' }}>
                  Tıkla
                </button>
              </div>
            </motion.div>
          )}
        </div>

        {/* MADE BY EFECAN */}
        <div className="mt-auto pt-6 flex items-center justify-center pointer-events-none w-full">
          <span
            className="text-[10px] font-bold tracking-[0.3em] uppercase opacity-60 mix-blend-screen"
            style={{ 
              fontFamily: "'Orbitron', sans-serif",
              color: '#F8FAFC',
              textShadow: '0 0 5px rgba(var(--accent-rgb),0.8), 0 0 10px rgba(var(--accent-rgb),0.6)'
            }}>
            MADE BY EFECAN
          </span>
        </div>
      </motion.div>

      {authState === 'rooms' && (
        <div className="hidden md:flex md:flex-col gap-4 md:shrink-0 w-[280px]">
          {/* Sunucularim: varsayilan kapali — baslik her zaman gorunur, liste
              tiklandiginda acilir ve ancak o zaman yuklenir. */}
          <div className={`bg-[rgba(20,20,26,0.55)] border border-white/10 rounded-[28px] shadow-[0_8px_32px_rgba(0,0,0,0.3)] backdrop-blur-[18px] overflow-hidden flex flex-col p-0 relative ${isServersOpen ? 'flex-1 min-h-0' : 'shrink-0'}`}>
            <MyServersPanel
              open={isServersOpen}
              onToggle={() => setIsServersOpen(o => !o)}
              refreshSignal={rooms.length + serverListVersion * 1000}
              onSelectRoom={(r) => {
                const full = rooms.find(x => x.id === r.id);
                handleJoinRoom(full ?? { id: r.id, name: r.name, type: 'text', description: r.description, createdBy: '', createdAt: new Date().toISOString(), isPrivate: r.isPrivate, roomCode: r.roomCode });
              }}
            />
          </div>

          {/* Tarih & Saat */}
          <ClockPanel />

          {/* Son Aktiviteler — oda kurulma/silinme akışı */}
          <ActivityFeed rooms={rooms} />

          {/* Sağ Alt Bölme — Sosyal İkonlar */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, type: 'spring', stiffness: 260, damping: 28 }}
            className="shrink-0 flex items-center justify-center gap-3 p-4 bg-[rgba(20,20,26,0.55)] border border-white/10 rounded-[28px] shadow-[0_8px_32px_rgba(0,0,0,0.3)] backdrop-blur-[18px]">
            <a href="https://github.com/efecanefee" target="_blank" rel="noopener noreferrer"
               className="p-3 rounded-2xl bg-bg-surface/80 border border-white/10 text-white/70 hover:text-white hover:bg-bg-surface hover:border-primary-main/50 hover:shadow-[0_0_15px_rgba(var(--accent-rgb),0.6)] transition-all duration-300">
              <Github size={20} />
            </a>
            <a href="https://www.linkedin.com/in/efecanefee/" target="_blank" rel="noopener noreferrer"
               className="p-3 rounded-2xl bg-bg-surface/80 border border-white/10 text-white/70 hover:text-white hover:bg-bg-surface hover:border-[#0a66c2]/50 hover:shadow-[0_0_15px_rgba(10,102,194,0.6)] transition-all duration-300">
              <Linkedin size={20} />
            </a>
            <a href="https://www.instagram.com/efecan.efeee/" target="_blank" rel="noopener noreferrer"
               className="p-3 rounded-2xl bg-bg-surface/80 border border-white/10 text-white/70 hover:text-white hover:bg-bg-surface hover:border-[#e1306c]/50 hover:shadow-[0_0_15px_rgba(225,48,108,0.6)] transition-all duration-300">
              <Instagram size={20} />
            </a>
          </motion.div>
        </div>
      )}

      </div>

      {/* Removed external MADE BY EFECAN */}
      {/* Sosyal Medya İkonları (yalnızca mobil) — sabit değil, içerik akışında en altta */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.3 }}
        className="md:hidden flex flex-row justify-center gap-3 mt-4 mb-2 w-full">
        <a href="https://github.com/efecanefee" target="_blank" rel="noopener noreferrer" 
           className="p-3 rounded-2xl bg-bg-surface/80 border border-white/10 text-white/70 hover:text-white hover:bg-bg-surface hover:border-primary-main/50 hover:shadow-[0_0_15px_rgba(var(--accent-rgb),0.6)] transition-all duration-300">
          <Github size={20} />
        </a>
        <a href="https://www.linkedin.com/in/efecanefee/" target="_blank" rel="noopener noreferrer" 
           className="p-3 rounded-2xl bg-bg-surface/80 border border-white/10 text-white/70 hover:text-white hover:bg-bg-surface hover:border-[#0a66c2]/50 hover:shadow-[0_0_15px_rgba(10,102,194,0.6)] transition-all duration-300">
          <Linkedin size={20} />
        </a>
        <a href="https://www.instagram.com/efecan.efeee/" target="_blank" rel="noopener noreferrer" 
           className="p-3 rounded-2xl bg-bg-surface/80 border border-white/10 text-white/70 hover:text-white hover:bg-bg-surface hover:border-[#e1306c]/50 hover:shadow-[0_0_15px_rgba(225,48,108,0.6)] transition-all duration-300">
          <Instagram size={20} />
        </a>
      </motion.div>

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        showLastSeen={myShowLastSeen}
        onUpdatePrivacy={handleUpdatePrivacy}
      />
    </div>
    </>
  );
}

export default App;

