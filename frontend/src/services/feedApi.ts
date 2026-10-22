// Ana ekran not akışı REST çağrıları. Canlı güncellemeler signalrService'ten gelir.
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5098';

const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('token')}`,
});

export type FeedPostKind = 'note' | 'poll';
export type PollChoice = 'yes' | 'no';

export interface FeedVotes {
  yes: string[];
  no: string[];
}

export interface FeedReactionGroup {
  emoji: string;
  count: number;
  usernames: string[];
}

export interface FeedPostDto {
  id: number;
  userId: string;
  username: string;
  avatarId: string;
  kind: FeedPostKind;
  text: string;
  eventAt: number | null;   // epoch ms — yalnızca oylamada
  createdAt: number;        // epoch ms
  votes: FeedVotes | null;
  reactions: FeedReactionGroup[];
}

export interface FeedPage {
  items: FeedPostDto[];
  hasMore: boolean;
}

const readError = async (res: Response) => {
  try {
    const data = await res.json();
    if (data?.message) return data.message as string;
  } catch { /* gövde yok */ }
  return 'Bir şeyler ters gitti, tekrar dene.';
};

export const getFeed = async (before?: number): Promise<FeedPage> => {
  const qs = before ? `?before=${before}` : '';
  const res = await fetch(`${API_BASE_URL}/api/feed${qs}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
};

export const createFeedPost = async (kind: FeedPostKind, text: string, eventAt?: number): Promise<FeedPostDto> => {
  const res = await fetch(`${API_BASE_URL}/api/feed`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ kind, text, eventAt: eventAt ?? null }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
};

export const deleteFeedPost = async (id: number): Promise<void> => {
  const res = await fetch(`${API_BASE_URL}/api/feed/${id}`, { method: 'DELETE', headers: authHeaders() });
  if (!res.ok) throw new Error(await readError(res));
};

export const voteFeedPoll = async (id: number, choice: PollChoice): Promise<FeedVotes> => {
  const res = await fetch(`${API_BASE_URL}/api/feed/${id}/vote`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ choice }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
};

export const toggleFeedReaction = async (id: number, emoji: string): Promise<FeedReactionGroup[]> => {
  const res = await fetch(`${API_BASE_URL}/api/feed/${id}/reactions`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ emoji }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
};
