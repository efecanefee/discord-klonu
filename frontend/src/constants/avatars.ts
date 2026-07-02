export const AVATARS = [
  { id: 'default', emoji: '👤' },
  { id: 'admin', emoji: '👔' },
  { id: 'robot', emoji: '🤖' },
  { id: 'rider', emoji: '🏍️' },
  { id: 'cowboy', emoji: '🤠' },
  { id: 'gangsta', emoji: '😎' },
  { id: 'cyberpunk', emoji: '👾' },
  { id: 'racer', emoji: '🏎️' },
  { id: 'footballer', emoji: '⚽' }
];

export const getAvatarEmoji = (id: string) => {
  const avatar = AVATARS.find(a => a.id === id);
  return avatar ? avatar.emoji : AVATARS[0].emoji;
};
