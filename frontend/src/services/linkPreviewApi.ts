// Mesajdaki linkler için önizleme kartı verisi. Sunucu sayfayı çekip
// başlık/açıklama/görseli döndürür; aynı link bir oturumda bir kez istenir.
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5098';

export interface LinkPreview {
  url: string;
  type: 'generic' | 'youtube' | 'twitter';
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  themeColor?: string;
  author?: string;
  authorHandle?: string;
  authorAvatar?: string;
  videoId?: string;
  createdAt?: number;
  likes?: number;
  reposts?: number;
  replies?: number;
}

const cache = new Map<string, Promise<LinkPreview | null>>();

export function fetchLinkPreview(url: string): Promise<LinkPreview | null> {
  const hit = cache.get(url);
  if (hit) return hit;
  const p = fetch(`${API_BASE_URL}/api/linkpreview?url=${encodeURIComponent(url)}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
  })
    .then(res => (res.status === 200 ? (res.json() as Promise<LinkPreview>) : null))
    .catch(() => {
      // Ağ hatası kalıcı değil — bir sonraki görüntülemede yeniden denensin
      cache.delete(url);
      return null;
    });
  cache.set(url, p);
  return p;
}

const URL_RE = /https?:\/\/[^\s<>"'`]+/g;
const IMAGE_RE = /\.(jpe?g|gif|png|webp)(\?.*)?$/i;
const YT_RE = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i;

export function youtubeIdOf(url: string): string | null {
  const m = url.match(YT_RE);
  return m ? m[1] : null;
}

// Önizlenecek linkler: kod blokları dışındaki, doğrudan resim olmayan ilk 2 link
export function extractPreviewUrls(text: string, max = 2): string[] {
  if (!text) return [];
  const withoutCode = text.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]+`/g, ' ');
  const out: string[] = [];
  for (const raw of withoutCode.match(URL_RE) ?? []) {
    const url = raw.replace(/[),.!?;:]+$/, '');
    if (IMAGE_RE.test(url)) continue;
    if (/^https?:\/\/(media\d*\.giphy\.com|i\.giphy\.com)\//i.test(url)) continue;
    if (!out.includes(url)) out.push(url);
    if (out.length >= max) break;
  }
  return out;
}
