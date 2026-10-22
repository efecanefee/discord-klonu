export const playNotificationSound = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // Modern bir "bloop" efekti
    osc.type = 'sine';
    
    // Frekans zarfı (Frequency envelope)
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.05);
    osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.15);

    // Ses seviyesi zarfı (Amplitude envelope)
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch (e) {
    // Tarayıcı otomatik ses çalmaya izin vermemiş olabilir, sessizce geç
    console.warn("Ses çalınamadı:", e);
  }
};

// Iki tonlu kisa melodi: tones = [frekans Hz, baslangic sn][]
const playTones = (tones: [number, number][], duration = 0.18, volume = 0.35) => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    tones.forEach(([freq, at]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + at);
      gain.gain.setValueAtTime(0, ctx.currentTime + at);
      gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + at + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + duration);
    });
    setTimeout(() => ctx.close().catch(() => { }), (Math.max(...tones.map(t => t[1])) + duration + 0.2) * 1000);
  } catch (e) {
    console.warn("Ses çalınamadı:", e);
  }
};

// Ses baglantisi koptu — inen, dikkat cekici uc ton
export const playConnectionLostSound = () => playTones([[880, 0], [660, 0.2], [440, 0.4]], 0.22, 0.4);

// Baglanti geri geldi — cikan iki ton
export const playConnectionRestoredSound = () => playTones([[523, 0], [784, 0.15]], 0.18, 0.3);
