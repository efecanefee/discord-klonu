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
};
