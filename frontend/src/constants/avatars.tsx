export const AVATARS = [
  { id: 'default', img: '/avatars/yuji.png' },
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
  const avatar = AVATARS.find(a => a.id === id) || AVATARS[0];
  if (avatar.img) {
    return <img src={avatar.img} alt="avatar" className="w-full h-full object-cover" />;
  }
  return <span>{avatar.emoji}</span>;
};
