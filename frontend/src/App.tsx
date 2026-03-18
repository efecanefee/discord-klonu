import { useState, useEffect } from 'react';
import ChatRoom from './components/ChatRoom';
import { ChevronRight, Music, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import signalrService from './services/signalrService';

function App() {
  const [inRoom, setInRoom] = useState(false);
  const [username, setUsername] = useState('');
  const [roomId, setRoomId] = useState('');
  const [globalActiveUsers, setGlobalActiveUsers] = useState<number>(0);

  useEffect(() => {
    // 1. HTTP üzerinden ilk veriyi çek
    const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5098';
    fetch(`${API_BASE_URL}/api/stats/active-users`)
      .then(res => res.json())
      .then(data => setGlobalActiveUsers(data.count))
      .catch(console.error);

    // 2. SignalR'a bağlanıp canlı güncellemeleri dinle
    signalrService.startConnection();

    const handleCountUpdate = (count: number) => {
      setGlobalActiveUsers(count);
    };

    signalrService.onActiveUserCountUpdated(handleCountUpdate);

    return () => {
      signalrService.offActiveUserCountUpdated(handleCountUpdate);
    };
  }, []);

  const handleJoinRoom = (selectedRoomId: string) => {
    if (!username.trim()) {
      alert("Lütfen bir kullanıcı adı giriniz.");
      return;
    }
    setRoomId(selectedRoomId);
    setInRoom(true);
  };

  const handleCustomRoom = () => {
    if (!username.trim()) {
      alert("Lütfen bir kullanıcı adı giriniz.");
      return;
    }
    const custom = prompt("Katılmak istediğiniz oda adını giriniz:");
    if (custom && custom.trim()) {
      setRoomId(custom.trim());
      setInRoom(true);
    }
  };

  if (inRoom) {
    return <ChatRoom username={username} roomId={roomId} onLeave={() => setInRoom(false)} />;
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#0A0B1A]">
      {/* Dynamic patterned background to match the image */}
      <div className="absolute inset-0 z-0 opacity-80 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#13173A] via-[#0A0B1A] to-[#0A0B1A]" />
      <div 
        className="absolute inset-0 z-0 opacity-[0.03]" 
        style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '16px 16px' }}
      ></div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-[420px] bg-[#313338] p-8 rounded-2xl shadow-2xl border border-white/5"
      >
        <div className="text-center mb-8">
          <motion.h1 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="text-2xl font-bold text-white mb-2"
          >
            Sandalyeci Metin!
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="text-gray-400 text-sm"
          >
            Hemen konuşmaya başla...
          </motion.p>
        </div>

        <div className="space-y-6">
          <motion.div 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
          >
            <label className="flex items-center text-xs font-bold text-[#B5BAC1] uppercase mb-2 tracking-wide">
              Kullanıcı Adı <span className="text-red-500 ml-1">*</span>
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="İsmini gir..."
              className="w-full px-4 py-3 bg-[#1E1F22] border border-transparent rounded-lg text-white placeholder-[#87898C] focus:outline-none focus:ring-2 focus:ring-[#5865F2] transition-all"
            />
          </motion.div>

          <motion.button
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            onClick={() => handleJoinRoom('Ana Salon')}
            className="w-full py-3 bg-[#5865F2] hover:bg-[#4752C4] text-white font-semibold rounded-lg shadow-lg hover:shadow-[#5865F2]/20 transition-all active:scale-[0.98]"
          >
            Giriş Yap
          </motion.button>

          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.5 }}
            className="pt-4"
          >
            <h3 className="text-xs font-bold text-[#B5BAC1] uppercase mb-3 tracking-wide">Aktif Odalar</h3>
            <div className="space-y-3">
              <button 
                onClick={() => handleJoinRoom('Ana Salon')}
                className="w-full flex items-center justify-between p-3 bg-[#2B2D31] hover:bg-[#1E1F22] rounded-xl transition-colors group border border-transparent hover:border-white/5 active:scale-[0.98]"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-[#242A42] flex items-center justify-center text-[#5865F2] group-hover:scale-110 transition-transform">
                    <Users size={18} />
                  </div>
                  <div className="text-left">
                    <div className="text-white font-medium text-sm">Ana Salon</div>
                    <div className="text-gray-400 text-xs mt-0.5">{globalActiveUsers} kişi aktif (Sistem geneli)</div>
                  </div>
                </div>
                <ChevronRight className="text-gray-500 group-hover:text-white transition-colors" size={18} />
              </button>

              <button 
                onClick={() => handleJoinRoom('Müzik Odası')}
                className="w-full flex items-center justify-between p-3 bg-[#2B2D31] hover:bg-[#1E1F22] rounded-xl transition-colors group border border-transparent hover:border-white/5 active:scale-[0.98]"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-[#182F2A] flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
                    <Music size={18} />
                  </div>
                  <div className="text-left">
                    <div className="text-white font-medium text-sm">Müzik Odası</div>
                    <div className="text-gray-400 text-xs mt-0.5">{globalActiveUsers} kişi aktif (Sistem geneli)</div>
                  </div>
                </div>
                <ChevronRight className="text-gray-500 group-hover:text-white transition-colors" size={18} />
              </button>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="text-center pt-2"
          >
            <span className="text-gray-400 text-xs">Yeni bir oda mı açmak istiyorsun? </span>
            <button onClick={handleCustomRoom} className="text-[#5865F2] text-xs hover:underline font-medium">Tıkla</button>
          </motion.div>
        </div>
      </motion.div>

      {/* Footer Branding */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        className="absolute bottom-8 left-0 right-0 flex items-center justify-center gap-2 text-[#2D3380]"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
          <rect x="11" y="2" width="11" height="11" rx="1" />
          <rect x="2" y="11" width="11" height="11" rx="1" />
        </svg>
        <span className="font-bold tracking-widest text-sm uppercase text-[#2D3380]">Metin Müzik</span>
      </motion.div>
    </div>
  );
}

export default App;
