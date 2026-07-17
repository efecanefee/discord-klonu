export const AVATARS = [
  { id: 'default', emoji: '👤' },
  { id: 'yuji', img: '/avatars/yuji.png' },
  { id: 'admin', img: '/avatars/megumi.png' },
  { id: 'robot', img: '/avatars/yuta.png' },
  { id: 'rider', img: '/avatars/gojo.png' },
  { id: 'cowboy', img: '/avatars/sukuna.png' },
  { id: 'gangsta', img: '/avatars/todo.png' },
  { id: 'cyberpunk', img: '/avatars/toji.png' },
  { id: 'racer', img: '/avatars/nanami.png' },
  { id: 'footballer', img: '/avatars/choso.png' }
];

// Resimli avatarlar `w-full h-full` ile cizilir: cagiran, boyutu belli VE
// `overflow-hidden` olan bir kapsayici vermek zorunda. Aksi halde resim dogal
// boyutunda cikar ve scale-[1.85] ile birlikte kirpilmadan tasar.
export const getAvatarEmoji = (id: string) => {
  const avatar = AVATARS.find(a => a.id === id) || AVATARS[0];
  if (avatar.img) {
    return <img src={avatar.img} alt="avatar" className="w-full h-full object-cover scale-[1.85] translate-y-[9%]" />;
  }
  return <span>{avatar.emoji}</span>;
};
