// "Oyunda" durumu ayrı bir alan değil, özel durum mesajının bir biçimidir:
// "🎮 Valorant oynuyor". Böylece mesajı gösteren her yer (DM listesi, profil
// kartı, alt menü) ek iş gerektirmeden oyunu da gösterir.

const GAME_PREFIX = '🎮 ';
const GAME_SUFFIX = ' oynuyor';

export const GAME_PRESETS = ['Valorant', 'League of Legends', 'CS2', 'Minecraft', 'Fortnite', 'GTA V', 'Roblox', 'Rocket League'];

export function gameStatusMessage(game: string): string {
    return `${GAME_PREFIX}${game.trim()}${GAME_SUFFIX}`;
}

// Mesaj bir oyun durumu ise oyunun adı, değilse null
export function parseGameStatus(message?: string | null): string | null {
    if (!message || !message.startsWith(GAME_PREFIX)) return null;
    const body = message.slice(GAME_PREFIX.length);
    return (body.endsWith(GAME_SUFFIX) ? body.slice(0, -GAME_SUFFIX.length) : body).trim() || null;
}
