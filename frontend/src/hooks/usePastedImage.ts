import { useCallback, useEffect, useState } from 'react';

const pad = (n: number) => String(n).padStart(2, '0');

// Panodaki ilk resmi dosya olarak döndürür. Panoda düz metin de varsa
// (ör. Excel/Word'den kopyalama) metin yapıştırma bozulmasın diye karışmaz.
function getClipboardImage(data: DataTransfer): File | null {
    if (data.getData('text/plain').trim()) return null;
    const item = Array.from(data.items).find(i => i.kind === 'file' && i.type.startsWith('image/'));
    const blob = item?.getAsFile();
    if (!blob) return null;
    // Ekran görüntüleri hep "image.png" adıyla gelir; okunur bir ad verelim
    const d = new Date();
    const ext = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
    const name = `ekran-goruntusu-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.${ext}`;
    return new File([blob], name, { type: blob.type });
}

// Ctrl+V ile yapıştırılan resmi gönderilmeden önce önizlemede bekletir.
export function usePastedImage() {
    const [pasted, setPasted] = useState<{ file: File; previewUrl: string } | null>(null);

    // Önizleme adresi değiştiğinde ya da bileşen kapanınca eskisini serbest bırak
    useEffect(() => {
        if (!pasted) return;
        return () => URL.revokeObjectURL(pasted.previewUrl);
    }, [pasted]);

    const onPaste = useCallback((e: React.ClipboardEvent) => {
        const img = getClipboardImage(e.clipboardData);
        if (!img) return;
        e.preventDefault();
        setPasted({ file: img, previewUrl: URL.createObjectURL(img) });
    }, []);

    const clear = useCallback(() => setPasted(null), []);

    // Bekleyen resmi alır ve önizlemeyi kapatır
    const take = useCallback(() => {
        const f = pasted?.file ?? null;
        setPasted(null);
        return f;
    }, [pasted]);

    return { file: pasted?.file ?? null, previewUrl: pasted?.previewUrl ?? null, onPaste, clear, take };
}
