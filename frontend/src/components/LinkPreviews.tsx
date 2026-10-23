import React, { memo, useEffect, useState } from 'react';
import { Heart, MessageCircle, Play, Repeat2 } from 'lucide-react';
import { extractPreviewUrls, fetchLinkPreview, youtubeIdOf, type LinkPreview } from '../services/linkPreviewApi';

interface LinkPreviewsProps {
  text: string;
  align?: 'start' | 'end';
  compact?: boolean;
}

const compactNumber = (n?: number) =>
  n == null ? null : new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

const hostOf = (url: string) => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
};

// ---------- YouTube: kapak + tıklayınca balonun altında oynar ----------
const YoutubeCard: React.FC<{ url: string; videoId: string; preview: LinkPreview | null }> = ({ url, videoId, preview }) => {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="link-card" style={{ '--lc': '#FF0000' } as React.CSSProperties}>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-text-muted">
        <span className="inline-flex w-4 h-4 items-center justify-center rounded bg-[#FF0000] text-white"><Play size={9} fill="currentColor" /></span>
        YouTube{preview?.author && <span className="font-normal truncate">· {preview.author}</span>}
      </div>
      <a href={url} target="_blank" rel="noopener noreferrer" className="block mt-1 text-[14px] font-semibold text-text-main hover:underline line-clamp-2">
        {preview?.title || 'YouTube videosu'}
      </a>
      <div className="relative mt-2 w-full aspect-video rounded-lg overflow-hidden bg-black">
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`}
            title={preview?.title || 'YouTube'}
            className="absolute inset-0 w-full h-full"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        ) : (
          <button type="button" onClick={() => setPlaying(true)} className="group/yt absolute inset-0 w-full h-full cursor-pointer" aria-label="Videoyu oynat">
            <img src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`} alt="" loading="lazy" className="w-full h-full object-cover transition-transform duration-300 group-hover/yt:scale-[1.03]" />
            <span className="absolute inset-0 bg-black/20 group-hover/yt:bg-black/10 transition-colors" />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-10 rounded-xl bg-[#FF0000] text-white flex items-center justify-center shadow-lg transition-transform group-hover/yt:scale-110">
              <Play size={20} fill="currentColor" />
            </span>
          </button>
        )}
      </div>
    </div>
  );
};

// ---------- X / Twitter ----------
const TweetCard: React.FC<{ p: LinkPreview }> = ({ p }) => (
  <a href={p.url} target="_blank" rel="noopener noreferrer" className="link-card block hover:brightness-110 transition" style={{ '--lc': '#1D9BF0' } as React.CSSProperties}>
    <div className="flex items-center gap-2">
      {p.authorAvatar
        ? <img src={p.authorAvatar} alt="" loading="lazy" className="w-8 h-8 rounded-full object-cover bg-bg-base" />
        : <span className="w-8 h-8 rounded-full bg-bg-base" />}
      <div className="min-w-0 flex-1 leading-tight">
        <div className="text-[13px] font-bold text-text-main truncate">{p.author}</div>
        {p.authorHandle && <div className="text-[11px] text-text-muted truncate">@{p.authorHandle}</div>}
      </div>
      <span className="text-[15px] font-black text-text-main" aria-label="X">𝕏</span>
    </div>
    {p.description && <p className="mt-2 text-[13px] leading-snug text-text-main whitespace-pre-wrap break-words line-clamp-6">{p.description}</p>}
    {p.image && <img src={p.image} alt="" loading="lazy" className="mt-2 w-full max-h-72 object-cover rounded-lg bg-bg-base" />}
    <div className="mt-2 flex items-center gap-4 text-[11px] text-text-muted">
      {p.replies != null && <span className="inline-flex items-center gap-1"><MessageCircle size={12} />{compactNumber(p.replies)}</span>}
      {p.reposts != null && <span className="inline-flex items-center gap-1"><Repeat2 size={12} />{compactNumber(p.reposts)}</span>}
      {p.likes != null && <span className="inline-flex items-center gap-1"><Heart size={12} />{compactNumber(p.likes)}</span>}
      {p.createdAt && <span className="ml-auto">{new Date(p.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
    </div>
  </a>
);

// ---------- Genel site (Open Graph) ----------
const GenericCard: React.FC<{ p: LinkPreview }> = ({ p }) => (
  <div className="link-card" style={p.themeColor ? { '--lc': p.themeColor } as React.CSSProperties : undefined}>
    <div className="flex gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold text-text-muted truncate">{p.siteName || hostOf(p.url)}</div>
        {p.title && (
          <a href={p.url} target="_blank" rel="noopener noreferrer" className="block mt-0.5 text-[14px] font-semibold text-primary-main hover:underline line-clamp-2">
            {p.title}
          </a>
        )}
        {p.description && <p className="mt-1 text-[12.5px] leading-snug text-text-muted line-clamp-3">{p.description}</p>}
      </div>
      {p.image && (
        <a href={p.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
          <img src={p.image} alt="" loading="lazy" className="w-20 h-20 rounded-lg object-cover bg-bg-base" onError={e => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }} />
        </a>
      )}
    </div>
  </div>
);

const PreviewItem: React.FC<{ url: string }> = ({ url }) => {
  const videoId = youtubeIdOf(url);
  const [preview, setPreview] = useState<LinkPreview | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    fetchLinkPreview(url).then(p => { if (alive) setPreview(p); });
    return () => { alive = false; };
  }, [url]);

  // YouTube kartı kapak görseli için sunucuyu beklemez
  if (videoId) return <YoutubeCard url={url} videoId={videoId} preview={preview ?? null} />;
  // Yüklenirken ya da önizlenemeyen linklerde kart yok — link metinde zaten tıklanabilir
  if (!preview) return null;
  if (preview.type === 'twitter') return <TweetCard p={preview} />;
  return <GenericCard p={preview} />;
};

// Mesaj balonunun altında Discord tarzı link kartları
const LinkPreviews: React.FC<LinkPreviewsProps> = ({ text, align = 'start', compact = false }) => {
  const urls = extractPreviewUrls(text);
  if (urls.length === 0) return null;
  return (
    <div className={`flex flex-col gap-2 mt-1.5 ${compact ? 'w-[min(280px,65vw)]' : 'w-[min(400px,72vw)]'} ${align === 'end' ? 'items-end self-end' : 'items-start'}`}>
      {urls.map(u => <PreviewItem key={u} url={u} />)}
    </div>
  );
};

export default memo(LinkPreviews);
