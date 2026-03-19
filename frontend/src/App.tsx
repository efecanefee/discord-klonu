import { useState, useEffect } from 'react';
import ChatRoom from './components/ChatRoom';
import { ChevronRight, Music, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import signalrService from './services/signalrService';

function App() {
  const [inRoom, setInRoom] = useState(false);
  const [username, setUsername] = useState('');
  const [roomId, setRoomId] = useState('');
  const [globalActiveUsers, setGlobalActiveUsers] = useState<number>(0);

  useEffect(() => {
    const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5098';
    fetch(`${API_BASE_URL}/api/stats/active-users`)
      .then(res => res.json())
      .then(data => setGlobalActiveUsers(data.count))
      .catch(console.error);

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
    <div className="relative min-h-screen flex items-center justify-center bg-bg-base overflow-hidden font-sans">
      
      {/* Container */}
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10 w-full max-w-[420px] bg-bg-card p-8 rounded-[24px] shadow-card border border-border-main"
      >
        <motion.div variants={itemVariants} className="text-center mb-10">
          <h1 className="text-2xl font-semibold text-text-main mb-2 tracking-tight">
            SandalyeciMetin
          </h1>
          <p className="text-text-muted text-[15px] font-normal">
            Hemen konuşmaya başla...
          </p>
        </motion.div>

        <div className="space-y-6">
          <motion.div variants={itemVariants} className="space-y-2">
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider">
              Kullanıcı Adı <span className="text-primary-main ml-0.5">*</span>
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="İsmini gir..."
              className="w-full px-4 py-3.5 bg-bg-surface border border-border-main rounded-xl text-text-main placeholder:text-text-muted/50 focus:border-primary-main focus:ring-glow transition-all duration-200"
            />
          </motion.div>

          <motion.div variants={itemVariants}>
            <button
              onClick={() => handleJoinRoom('Ana Salon')}
              className="w-full py-4 bg-[linear-gradient(135deg,#6C7BFF,#8B5CF6)] hover:brightness-110 text-white font-medium rounded-xl transition-all duration-250 shadow-card hover:shadow-card-hover hover:-translate-y-[2px] active:scale-[0.97] active:translate-y-0 cursor-pointer"
            >
              Giriş Yap
            </button>
          </motion.div>

          <motion.div variants={itemVariants} className="pt-6 border-t border-border-main/50 space-y-4">
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider flex items-center justify-between">
              <span>Aktif Odalar</span>
              <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Online ({globalActiveUsers})</span>
            </h3>
            
            <div className="space-y-4">
              <button 
                onClick={() => handleJoinRoom('Ana Salon')}
                className="group w-full flex items-center justify-between p-5 bg-bg-surface border border-border-main rounded-[20px] shadow-sm transition-all duration-250 cursor-pointer hover:-translate-y-[3px] hover:scale-[1.02] hover:shadow-card-hover active:scale-[0.97]"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-bg-base flex items-center justify-center text-primary-main transition-colors duration-200">
                    <Users size={20} />
                  </div>
                  <div className="text-left">
                    <div className="text-text-main text-[16px] font-semibold">Ana Salon</div>
                    <div className="text-text-muted text-[13px] mt-1 font-normal flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/80"></div> Sohbet Odası
                    </div>
                  </div>
                </div>
                <ChevronRight className="text-text-muted group-hover:text-text-main transition-colors duration-200" size={20} />
              </button>

              <button 
                onClick={() => handleJoinRoom('Müzik Odası')}
                className="group w-full flex items-center justify-between p-5 bg-bg-surface border border-border-main rounded-[20px] shadow-sm transition-all duration-250 cursor-pointer hover:-translate-y-[3px] hover:scale-[1.02] hover:shadow-card-hover active:scale-[0.97]"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-bg-base flex items-center justify-center text-emerald-500 transition-colors duration-200">
                    <Music size={20} />
                  </div>
                  <div className="text-left">
                    <div className="text-text-main text-[16px] font-semibold">Müzik Odası</div>
                    <div className="text-text-muted text-[13px] mt-1 font-normal flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/80"></div> Dinleme Odası
                    </div>
                  </div>
                </div>
                <ChevronRight className="text-text-muted group-hover:text-text-main transition-colors duration-200" size={20} />
              </button>
            </div>
          </motion.div>

          <motion.div variants={itemVariants} className="text-center pt-2">
            <span className="text-text-muted text-[14px]">Yeni bir oda mı açmak istiyorsun? </span>
            <button onClick={handleCustomRoom} className="text-primary-main text-[14px] font-semibold hover:text-primary-hover transition-colors cursor-pointer ml-1">Tıkla</button>
          </motion.div>
        </div>
      </motion.div>

      {/* Footer Branding */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4, ease: "easeOut" }}
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
