import React from 'react';
import { FileText, Download } from 'lucide-react';

const IMG = /\.(jpe?g|png|gif|webp)(\?.*)?$/i;
const VID = /\.(mp4|webm)(\?.*)?$/i;
const AUD = /\.(mp3|ogg|wav)(\?.*)?$/i;

interface MessageFileAttachmentProps {
  fileUrl: string;
  fileName?: string;
  /** Balon koyu/renkli arka planda mı (indirme kartı kontrastı için) */
  onDark?: boolean;
}

const MessageFileAttachment: React.FC<MessageFileAttachmentProps> = ({ fileUrl, fileName, onDark }) => {
  const name = fileName || fileUrl.split('/').pop() || 'dosya';

  if (IMG.test(fileUrl)) {
    return (
      <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="block my-1 w-fit max-w-[260px] sm:max-w-[340px]">
        <img
          src={fileUrl}
          alt={name}
          className="w-full h-auto max-h-72 rounded-xl border border-white/10 object-contain bg-black/20"
          loading="lazy"
        />
      </a>
    );
  }

  if (VID.test(fileUrl)) {
    return (
      <video src={fileUrl} controls className="my-1 w-full max-w-[340px] max-h-72 rounded-xl border border-white/10 bg-black" />
    );
  }

  if (AUD.test(fileUrl)) {
    return <audio src={fileUrl} controls className="my-1 w-[240px] max-w-full" />;
  }

  return (
    <a
      href={fileUrl}
      target="_blank"
      rel="noopener noreferrer"
      download
      className={`my-1 flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors max-w-[260px] ${
        onDark
          ? 'bg-white/10 border-white/20 hover:border-white/40'
          : 'bg-black/20 border-white/10 hover:border-primary-main/50'
      }`}
    >
      <div className="w-9 h-9 rounded-lg bg-primary-main/20 flex items-center justify-center shrink-0">
        <FileText size={18} className="text-primary-main" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium truncate">{name}</div>
        <div className="text-[11px] opacity-60 flex items-center gap-1"><Download size={11} /> İndir</div>
      </div>
    </a>
  );
};

export default MessageFileAttachment;
