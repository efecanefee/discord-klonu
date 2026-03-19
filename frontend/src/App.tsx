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

  // Animation values based on user rules
  const fadeUp = {
    initial: { opacity: 0, y: 15 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, ease: "easeOut" }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-bg-base overflow-hidden">
      
      {/* Container */}
      <motion.div 
        {...fadeUp}
        className="relative z-10 w-full max-w-[420px] bg-bg-card p-8 rounded-2xl border border-border-main shadow-premium"
      >
        <div className="text-center mb-10">
          <h1 className="text-2xl font-bold text-text-main mb-2 tracking-tight">
            SandalyeciMetin
          </h1>
          <p className="text-text-muted text-sm font-medium">
            Hemen konuşmaya başla...
          </p>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider">
              Kullanıcı Adı <span className="text-primary-main ml-0.5">*</span>
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="İsmini gir..."
              className="w-full px-4 py-3.5 bg-bg-surface border border-border-main rounded-xl text-text-main placeholder:text-text-muted/50 focus:border-primary-main focus:ring-2 focus:ring-primary-main/20 transition-all duration-200"
            />
          </div>

          <button
            onClick={() => handleJoinRoom('Ana Salon')}
            className="w-full py-3.5 bg-primary-main hover:bg-primary-hover text-white font-medium rounded-xl transition-all duration-200 hover:-translate-y-[2px] hover:shadow-premium active:translate-y-[0px] active:scale-[0.98]"
          >
            Giriş Yap
          </button>

          <div className="pt-6 border-t border-border-main/50 space-y-4">
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Aktif Odalar</h3>
            <div className="space-y-3">
              <button 
                onClick={() => handleJoinRoom('Ana Salon')}
                className="group w-full flex items-center justify-between p-4 bg-bg-surface hover:bg-bg-surface border border-border-main hover:border-primary-main/40 rounded-xl transition-all duration-200 hover:-translate-y-[2px] hover:shadow-premium active:translate-y-[0px] active:scale-[0.98]"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-bg-base flex items-center justify-center text-primary-main transition-colors duration-200 group-hover:bg-primary-main/10">
                    <Users size={18} />
                  </div>
                  <div className="text-left">
                    <div className="text-text-main font-medium text-sm">Ana Salon</div>
                    <div className="text-text-muted text-xs mt-1">{globalActiveUsers} kişi aktif</div>
                  </div>
                </div>
                <ChevronRight className="text-text-muted group-hover:text-text-main transition-colors duration-200" size={18} />
              </button>

              <button 
                onClick={() => handleJoinRoom('Müzik Odası')}
                className="group w-full flex items-center justify-between p-4 bg-bg-surface hover:bg-bg-surface border border-border-main hover:border-primary-main/40 rounded-xl transition-all duration-200 hover:-translate-y-[2px] hover:shadow-premium active:translate-y-[0px] active:scale-[0.98]"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-bg-base flex items-center justify-center text-emerald-500 transition-colors duration-200 group-hover:bg-emerald-500/10">
                    <Music size={18} />
                  </div>
                  <div className="text-left">
                    <div className="text-text-main font-medium text-sm">Müzik Odası</div>
                    <div className="text-text-muted text-xs mt-1">{globalActiveUsers} kişi aktif</div>
                  </div>
                </div>
                <ChevronRight className="text-text-muted group-hover:text-text-main transition-colors duration-200" size={18} />
              </button>
            </div>
          </div>

          <div className="text-center pt-2">
            <span className="text-text-muted text-sm">Yeni bir oda mı açmak istiyorsun? </span>
            <button onClick={handleCustomRoom} className="text-primary-main text-sm font-medium hover:text-primary-hover transition-colors">Tıkla</button>
          </div>
        </div>
      </motion.div>

      {/* Footer Branding */}
      <motion.div 
        {...fadeUp}
        transition={{ delay: 0.2, duration: 0.4, ease: "easeOut" }}
        className="absolute bottom-8 left-0 right-0 flex items-center justify-center gap-2"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-text-muted">
          <rect x="11" y="2" width="11" height="11" rx="1" />
          <rect x="2" y="11" width="11" height="11" rx="1" />
        </svg>
        <span className="font-semibold tracking-widest text-xs uppercase text-text-muted">SandalyeciMetin</span>
      </motion.div>
    </div>
  );
}

export default App;
