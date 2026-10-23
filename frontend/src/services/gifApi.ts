// GIF arama — sunucu GIPHY'ye vekalet eder (anahtar tarayıcıya gelmez).
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5098';

export interface Gif {
  id: string;
  title: string;
  url: string;      // mesaja gönderilen
  preview: string;  // ızgarada gösterilen küçük sürüm
  width: number;
  height: number;
}

export class GifNotConfiguredError extends Error {}

export async function fetchGifs(query: string, offset = 0, signal?: AbortSignal): Promise<Gif[]> {
  const q = query.trim();
  const path = q ? `search?q=${encodeURIComponent(q)}&offset=${offset}` : `trending?offset=${offset}`;
  const res = await fetch(`${API_BASE_URL}/api/gifs/${path}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    signal,
  });
  if (res.status === 503) throw new GifNotConfiguredError();
  if (!res.ok) throw new Error(`GIF isteği başarısız: ${res.status}`);
  return res.json();
}
