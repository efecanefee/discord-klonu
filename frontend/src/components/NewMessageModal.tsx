import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, MessageSquare, Loader2 } from 'lucide-react';
import { getAvatarEmoji } from '../constants/avatars';

export interface UserData {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  avatarId: string;
  customStatus: string; // 'online' | 'offline' vb.
  lastSeen: string;
}

interface NewMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectUser: (user: UserData) => void;
  API_BASE_URL: string;
}

const NewMessageModal: React.FC<NewMessageModalProps> = ({
  isOpen,
  onClose,
  onSelectUser,
  API_BASE_URL
}) => {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<UserData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      fetchUsers();
    }
  }, [isOpen]);

  const fetchUsers = async () => {
    setIsLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Kullanıcılar yüklenemedi.');
      const data = await res.json();
      
      // Kendi kendimize mesaj atmayalım (Opsiyonel: Eğer kendine "Notlar" gibi bir özellik istenirse bu filtre kaldırılabilir)
      const currentUsername = localStorage.getItem('username');
      setUsers(data.filter((u: UserData) => u.username !== currentUsername));
    } catch (err: any) {
      setError(err.message || 'Bilinmeyen bir hata oluştu.');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredUsers = users.filter(u => 
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.firstName.toLowerCase().includes(search.toLowerCase()) ||
    u.lastName.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-500';
      case 'idle': return 'bg-yellow-500';
      case 'dnd': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-md bg-[#0F172A] border border-[#334155] rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[80vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 pb-4 shrink-0">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{
                  background: 'rgba(124, 58, 237, 0.15)',
                  border: '1px solid rgba(124, 58, 237, 0.3)',
                  boxShadow: '0 0 20px rgba(124, 58, 237, 0.2)',
                }}
              >
                <MessageSquare size={20} className="text-[#7C3AED]" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Yeni Mesaj</h2>
                <p className="text-xs text-white/40">Bir kullanıcı ara ve sohbeti başlat</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-white/50 hover:text-white hover:bg-white/5 rounded-full transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Search */}
          <div className="px-6 pb-4 shrink-0">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Kullanıcı ara..."
                autoFocus
                className="w-full bg-[#1E293B] border border-[#334155] rounded-xl pl-10 pr-4 py-3 text-white outline-none focus:border-[#7C3AED] transition-colors text-sm placeholder:text-white/20"
              />
            </div>
          </div>

          <div className="w-full h-px bg-[#334155] shrink-0" />

          {/* User List */}
          <div className="p-4 overflow-y-auto flex-1 custom-scrollbar">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-10 text-white/50">
                <Loader2 size={24} className="animate-spin mb-2" />
                <span className="text-sm">Kullanıcılar yükleniyor...</span>
              </div>
            ) : error ? (
              <div className="p-4 text-center text-sm text-red-400 bg-red-500/10 rounded-xl">
                {error}
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-10 text-white/40 text-sm">
                Kullanıcı bulunamadı.
              </div>
            ) : (
              <div className="space-y-2">
                {filteredUsers.map((user) => (
                  <motion.button
                    key={user.id}
                    onClick={() => {
                      onSelectUser(user);
                      onClose();
                    }}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-transparent hover:border-white/10 transition-all text-left group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl bg-[#1E293B] border border-[#334155]">
                          {getAvatarEmoji(user.avatarId)}
                        </div>
                        {/* Status Indicator */}
                        <div className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 border-2 border-[#0F172A] rounded-full ${getStatusColor(user.customStatus)}`} />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white flex items-center gap-2">
                          {user.username}
                          {user.customStatus === 'online' && (
                            <span className="text-[10px] font-normal text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded-full">
                              Aktif
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-white/40 mt-0.5">
                          {user.firstName} {user.lastName}
                        </div>
                      </div>
                    </div>
                  </motion.button>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default NewMessageModal;
