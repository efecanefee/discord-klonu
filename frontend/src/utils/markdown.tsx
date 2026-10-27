import React from 'react';
import Spoiler from '../components/Spoiler';

// Mesaj metni biçimlendirme (Discord tarzı):
//   **kalın**  *italik* / _italik_  __altı çizili__  ~~üstü çizili~~  ||spoiler||
//   "> " ile başlayan satırlar alıntı olur.
// Kod blokları çağıran tarafta önceden ayrılır; buraya yalnızca düz metin gelir.
// Biçimlenmemiş parçalar `leaf` ile işlenir (link, resim, @mention).

export type LeafRenderer = (text: string, key: string) => React.ReactNode;

const INLINE = /\|\|([\s\S]+?)\|\||\*\*([\s\S]+?)\*\*|~~([\s\S]+?)~~|__([\s\S]+?)__|\*([^*\s](?:[^*\n]*[^*\s])?)\*|(?<![\p{L}\p{N}_])_([^_\s](?:[^_\n]*[^_\s])?)_(?![\p{L}\p{N}_])/gu;
const URL = /https?:\/\/[^\s]+/g;

function renderInline(text: string, key: string, leaf: LeafRenderer): React.ReactNode[] {
  // Bir URL'nin içinden geçen biçim işaretleri (ör. ..._foo_...) linki bozmasın
  const urls: [number, number][] = [];
  for (const m of text.matchAll(URL)) urls.push([m.index!, m.index! + m[0].length]);
  const cutsUrl = (s: number, e: number) => urls.some(([us, ue]) => (s > us && s < ue) || (e > us && e < ue));

  const out: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  const re = new RegExp(INLINE.source, INLINE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const start = m.index, end = start + m[0].length;
    if (cutsUrl(start, end)) { re.lastIndex = start + 1; continue; }
    if (start > last) out.push(leaf(text.slice(last, start), `${key}_l${i}`));
    const k = `${key}_f${i++}`;
    const [, spoiler, bold, strike, underline, italicStar, italicUnderscore] = m;
    if (spoiler !== undefined) out.push(<Spoiler key={k}>{renderInline(spoiler, k, leaf)}</Spoiler>);
    else if (bold !== undefined) out.push(<strong key={k} className="font-bold">{renderInline(bold, k, leaf)}</strong>);
    else if (strike !== undefined) out.push(<s key={k} className="opacity-80">{renderInline(strike, k, leaf)}</s>);
    else if (underline !== undefined) out.push(<u key={k} className="underline-offset-2">{renderInline(underline, k, leaf)}</u>);
    else out.push(<em key={k} className="italic">{renderInline(italicStar ?? italicUnderscore, k, leaf)}</em>);
    last = end;
  }
  if (last < text.length) out.push(leaf(text.slice(last), `${key}_l${i}`));
  return out;
}

export function renderMarkdown(text: string, key: string, leaf: LeafRenderer): React.ReactNode[] {
  if (!/[*_~|>]/.test(text)) return [leaf(text, key)];

  // Ardışık "> " satırlarını tek alıntı bloğunda topla
  const lines = text.split('\n');
  const out: React.ReactNode[] = [];
  let buf: string[] = [];
  let quote: string[] = [];
  let n = 0;
  const flushText = () => {
    if (buf.length === 0) return;
    out.push(<React.Fragment key={`${key}_t${n}`}>{renderInline(buf.join('\n'), `${key}_t${n++}`, leaf)}</React.Fragment>);
    buf = [];
  };
  const flushQuote = () => {
    if (quote.length === 0) return;
    out.push(
      <span key={`${key}_q${n}`} className="block my-0.5 pl-3 border-l-[3px] border-white/25 text-white/80">
        {renderInline(quote.join('\n'), `${key}_q${n++}`, leaf)}
      </span>
    );
    quote = [];
  };

  lines.forEach((line, idx) => {
    const isLast = idx === lines.length - 1;
    const qm = /^>\s?(.*)$/.exec(line);
    if (qm) {
      flushText();
      quote.push(qm[1]);
    } else {
      flushQuote();
      buf.push(line);
    }
    if (isLast) { flushQuote(); flushText(); }
  });
  return out;
}
