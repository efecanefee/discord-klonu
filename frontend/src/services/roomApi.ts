// Rol sistemi REST çağrıları (Özellik 6)
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5098';

const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('token')}`,
});

export interface RoomMemberDto {
  userId: string;
  username: string;
  avatarId: string;
  role: string;
  joinedAt: string;
}

export interface MyRoomDto {
  id: number;
  name: string;
  description?: string;
  isPrivate: boolean;
  roomCode?: string;
  role: string;      // 'owner' | 'moderator' | 'member'
  joinedAt: string;
}

export interface ChannelDto {
  id: number;
  name: string;
  type: string;      // 'text' | 'voice'
  position: number;
  messageKey: string;
}

export interface RoomBanDto {
  userId: string;
  username: string;
  avatarId: string;
  reason?: string;
  bannedAt: string;
}

async function ok(res: Response): Promise<void> {
  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `İstek başarısız (${res.status})`);
  }
}

export const roomApi = {
  async getMyRooms(): Promise<MyRoomDto[]> {
    const res = await fetch(`${API_BASE_URL}/api/rooms/mine`, { headers: authHeaders() });
    if (!res.ok) return [];
    return res.json();
  },

  async getChannels(roomId: number): Promise<ChannelDto[]> {
    const res = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/channels`, { headers: authHeaders() });
    if (!res.ok) return [];
    return res.json();
  },

  async createChannel(roomId: number, name: string, type: 'text' | 'voice'): Promise<ChannelDto> {
    const res = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/channels`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name, type }),
    });
    await ok(res);
    return res.json();
  },

  async deleteChannel(roomId: number, channelId: number): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/channels/${channelId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    await ok(res);
  },

  async getMembers(roomId: number): Promise<RoomMemberDto[]> {
    const res = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/members`, { headers: authHeaders() });
    if (!res.ok) return [];
    return res.json();
  },

  async getBans(roomId: number): Promise<RoomBanDto[]> {
    const res = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/bans`, { headers: authHeaders() });
    if (!res.ok) return [];
    return res.json();
  },

  async setRole(roomId: number, userId: string, role: 'moderator' | 'member'): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/members/${userId}/role`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ role }),
    });
    await ok(res);
  },

  async leaveRoom(roomId: number): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/leave`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    await ok(res);
  },

  async kick(roomId: number, userId: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/members/${userId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    await ok(res);
  },

  async ban(roomId: number, userId: string, reason?: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/bans/${userId}`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ reason: reason ?? null }),
    });
    await ok(res);
  },

  async unban(roomId: number, userId: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/bans/${userId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    await ok(res);
  },

  async updateRoom(roomId: number, description: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/api/rooms/${roomId}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ description }),
    });
    await ok(res);
  },
};
