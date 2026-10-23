import { X } from 'lucide-react';

interface Props {
    file: File | null;
    previewUrl: string | null;
    onCancel: () => void;
}

const formatSize = (bytes: number) =>
    bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

// Yapıştırılan resmin gönderilmeden önceki önizlemesi
export default function PastedImagePreview({ file, previewUrl, onCancel }: Props) {
    if (!file || !previewUrl) return null;
    const tooBig = file.size > 10 * 1024 * 1024;
    return (
        <div className="mb-2 flex items-center gap-3 bg-bg-surface border border-primary-main/30 rounded-xl p-2 pr-3 shadow-lg">
            <img src={previewUrl} alt="Yapıştırılan resim" className="h-16 w-16 sm:h-20 sm:w-20 object-cover rounded-lg border border-border-main shrink-0" />
            <div className="min-w-0 flex-1 text-sm">
                <div className="text-text-main font-medium truncate">{file.name}</div>
                <div className={tooBig ? 'text-red-400 text-xs' : 'text-text-muted text-xs'}>
                    {tooBig ? 'Dosya boyutu 10MB\'ı geçemez.' : `${formatSize(file.size)} · Göndermek için Enter, iptal için Esc`}
                </div>
            </div>
            <button type="button" onClick={onCancel} title="İptal" className="p-2 text-text-muted hover:text-text-main cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center">
                <X size={16} />
            </button>
        </div>
    );
}
