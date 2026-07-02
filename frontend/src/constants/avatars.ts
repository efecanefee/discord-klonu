export const AVATARS = [
  { id: 'default', url: '/avatars/default.png' },
  { id: 'admin', url: '/avatars/admin.png' },
  { id: 'robot', url: '/avatars/robot.png' },
  { id: 'rider', url: '/avatars/rider.png' },
  { id: 'cowboy', url: '/avatars/cowboy.png' },
  { id: 'gangsta', url: '/avatars/gangsta.png' },
  { id: 'cyberpunk', url: '/avatars/cyberpunk.png' },
  { id: 'racer', url: '/avatars/racer.png' },
  { id: 'footballer', url: '/avatars/footballer.png' }
];

export const getAvatarUrl = (id: string) => {
  const avatar = AVATARS.find(a => a.id === id);
  return avatar ? avatar.url : AVATARS[0].url;
};
