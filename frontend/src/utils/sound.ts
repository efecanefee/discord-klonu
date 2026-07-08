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
