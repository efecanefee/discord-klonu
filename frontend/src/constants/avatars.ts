export const AVATARS = [
  { 
    id: 'default', 
    name: 'Varsayılan', 
    url: 'https://api.dicebear.com/7.x/identicon/svg?seed=default&backgroundColor=0F172A' 
  },
  { 
    id: 'bald_guy', 
    name: 'Patron', 
    url: 'https://api.dicebear.com/7.x/avataaars/svg?top=noHair&accessories=prescription02&facialHair=beardLight&clothing=hoodie&clothingColor=3c4f5c&skinColor=edb98a' 
  },
  { 
    id: 'cyberpunk', 
    name: 'Siberpunk', 
    url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Neon&primaryColor=7C3AED&baseColor=7C3AED' 
  },
  { 
    id: 'motorcyclist', 
    name: 'Motorcu', 
    url: 'https://api.dicebear.com/7.x/avataaars/svg?style=circle&top=hijab&accessories=sunglasses&clothing=blazerAndShirt&clothingColor=252525&skinColor=edb98a' 
  },
  { 
    id: 'female_1', 
    name: 'Geliştirici', 
    url: 'https://api.dicebear.com/7.x/avataaars/svg?top=longHairStraight&hairColor=2c1b18&clothing=collarAndSweater&clothingColor=7C3AED&skinColor=f8d25c' 
  },
  { 
    id: 'female_2', 
    name: 'Tasarımcı', 
    url: 'https://api.dicebear.com/7.x/avataaars/svg?top=longHairCurly&hairColor=b58143&clothing=blazerAndSweater&clothingColor=65c9ff&skinColor=d08b5b' 
  },
  { 
    id: 'female_3', 
    name: 'Yönetici', 
    url: 'https://api.dicebear.com/7.x/avataaars/svg?top=longHairBob&hairColor=724133&accessories=round&clothing=shirtCrewNeck&clothingColor=ff5c5c&skinColor=ffdbb4' 
  },
  { 
    id: 'gamer_boy', 
    name: 'Gamer', 
    url: 'https://api.dicebear.com/7.x/avataaars/svg?top=shortHairShortWaved&hairColor=2c1b18&accessories=kurt&clothing=hoodie&clothingColor=7C3AED&skinColor=f8d25c' 
  },
  { 
    id: 'ninja', 
    name: 'Ninja', 
    url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Ninja&primaryColor=0F172A&texture=camo' 
  }
];

export const getAvatarUrl = (id: string) => {
  const avatar = AVATARS.find(a => a.id === id);
  return avatar ? avatar.url : AVATARS[0].url;
};
