import { useRef, useCallback } from 'react';

export function useAudioNotifications() {
  const ctxRef = useRef<AudioContext | null>(null);

  const getCtx = () => {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
    }
    return ctxRef.current;
  };

  // Yardımcı: tone çal
  const playTone = useCallback((
    frequency: number,
    duration: number,
    type: OscillatorType = 'sine',
    fadeOut = true,
    startFreq?: number
  ) => {
    try {
      const ctx = getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = type;

      if (startFreq !== undefined) {
        osc.frequency.setValueAtTime(startFreq, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(frequency, ctx.currentTime + duration * 0.6);
      } else {
        osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      }

      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      if (fadeOut) {
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      }

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch {
      // AudioContext kullanıcı etkileşimi olmadan başlayamazsa sessizce geç
    }
  }, []);

  // Kanala giriş sesi — yükselen çift ding
  const playJoinSound = useCallback(() => {
    playTone(660, 0.15, 'sine', true, 520);
    setTimeout(() => playTone(880, 0.2, 'sine', true, 660), 130);
  }, [playTone]);

  // Kanaldan çıkış sesi — alçalan çift dong
  const playLeaveSound = useCallback(() => {
    playTone(660, 0.15, 'sine', true);
    setTimeout(() => playTone(440, 0.25, 'sine', true, 560), 130);
  }, [playTone]);

  // Mikrofon kapat sesi — kısa tık
  const playMuteSound = useCallback(() => {
    playTone(300, 0.08, 'square', true);
  }, [playTone]);

  // Mikrofon aç sesi — hafif pop
  const playUnmuteSound = useCallback(() => {
    playTone(520, 0.12, 'sine', true, 400);
  }, [playTone]);

  // Mesaj gönderme sesi — kısa whoosh
  const playSendSound = useCallback(() => {
    playTone(600, 0.1, 'sine', true, 750);
  }, [playTone]);

  // Mesaj alma sesi — hafif bildirim
  const playReceiveSound = useCallback(() => {
    playTone(820, 0.08, 'sine', true);
    setTimeout(() => playTone(1020, 0.12, 'sine', true), 80);
  }, [playTone]);

  return { playJoinSound, playLeaveSound, playMuteSound, playUnmuteSound, playSendSound, playReceiveSound };
}
