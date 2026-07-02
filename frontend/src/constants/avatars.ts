const svgToDataUrl = (svgStr: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svgStr.trim())}`;

export const AVATARS = [
  {
    id: 'default',
    name: 'Varsayılan',
    url: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
        <rect width="48" height="48" fill="#0F172A"/>
        <circle cx="24" cy="20" r="9" fill="#1E293B" stroke="#7C3AED" stroke-width="2"/>
        <path d="M10 42c0-7 7-12 14-12s14 5 14 12" fill="#1E293B" stroke="#7C3AED" stroke-width="2"/>
        <!-- Neon Glow -->
        <circle cx="24" cy="20" r="3" fill="#7C3AED" opacity="0.5" filter="blur(2px)"/>
      </svg>
    `)
  },
  {
    id: 'admin',
    name: 'Yönetici',
    url: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
        <rect width="48" height="48" fill="#0F172A"/>
        <path d="M24 6l3 6 5-2-2 5 6 3-6 3 2 5-5-2-3 6-3-6-5 2 2-5-6-3 6-3-2-5 5 2z" fill="#7C3AED" opacity="0.3"/>
        <circle cx="24" cy="20" r="7" fill="#1E293B" stroke="#7C3AED" stroke-width="2"/>
        <path d="M14 40c0-5 4-9 10-9s10 4 10 9" fill="#1E293B" stroke="#7C3AED" stroke-width="2"/>
        <!-- Kravat (Tie) -->
        <path d="M22 31l2 8 2-8-2-2z" fill="#7C3AED"/>
      </svg>
    `)
  },
  {
    id: 'robot',
    name: 'Robot',
    url: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
        <rect width="48" height="48" fill="#0F172A"/>
        <path d="M24 6v6" stroke="#7C3AED" stroke-width="2"/>
        <circle cx="24" cy="5" r="2" fill="#7C3AED"/>
        <rect x="12" y="14" width="24" height="22" rx="4" fill="#1E293B" stroke="#7C3AED" stroke-width="2"/>
        <!-- Eyes -->
        <rect x="16" y="22" width="6" height="4" rx="1" fill="#7C3AED"/>
        <rect x="26" y="22" width="6" height="4" rx="1" fill="#7C3AED"/>
        <!-- Mouth -->
        <path d="M20 30h8" stroke="#7C3AED" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `)
  },
  {
    id: 'rider',
    name: 'Sürücü',
    url: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
        <rect width="48" height="48" fill="#0F172A"/>
        <!-- Helmet Base -->
        <path d="M10 24c0-8 6-14 14-14s14 6 14 14v8c0 3-2 6-6 6H16c-4 0-6-3-6-6v-8z" fill="#1E293B" stroke="#7C3AED" stroke-width="2"/>
        <!-- Visor -->
        <path d="M12 22h24v6c0 3-2 5-6 5H18c-4 0-6-2-6-5v-6z" fill="#0F172A" stroke="#7C3AED" stroke-width="1"/>
        <path d="M16 26h16" stroke="#7C3AED" stroke-width="2" opacity="0.5" stroke-linecap="round"/>
      </svg>
    `)
  },
  {
    id: 'cowboy',
    name: 'Kovboy Haydut',
    url: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
        <rect width="48" height="48" fill="#0F172A"/>
        <circle cx="24" cy="22" r="7" fill="#1E293B" stroke="#7C3AED" stroke-width="2"/>
        <!-- Hat -->
        <path d="M6 18c6-6 12-4 18-4s12-2 18 4" stroke="#7C3AED" stroke-width="3" stroke-linecap="round" fill="none"/>
        <path d="M16 16v-4c0-3 3-6 8-6s8 3 8 6v4" fill="#1E293B" stroke="#7C3AED" stroke-width="2"/>
        <!-- Bandana -->
        <path d="M14 26l10 10 10-10z" fill="#7C3AED" opacity="0.9"/>
      </svg>
    `)
  },
  {
    id: 'gangsta',
    name: 'Sokak Serserisi',
    url: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
        <rect width="48" height="48" fill="#0F172A"/>
        <circle cx="24" cy="22" r="8" fill="#1E293B" stroke="#7C3AED" stroke-width="2"/>
        <!-- Bandana Top -->
        <path d="M14 18h20v4H14z" fill="#7C3AED"/>
        <!-- Sunglasses -->
        <rect x="16" y="23" width="6" height="4" rx="1" fill="#0F172A"/>
        <rect x="26" y="23" width="6" height="4" rx="1" fill="#0F172A"/>
        <!-- Body -->
        <path d="M14 40c0-6 4-8 10-8s10 2 10 8" fill="#1E293B" stroke="#7C3AED" stroke-width="2"/>
      </svg>
    `)
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk Asi',
    url: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
        <rect width="48" height="48" fill="#0F172A"/>
        <circle cx="24" cy="22" r="8" fill="#1E293B" stroke="#7C3AED" stroke-width="2"/>
        <!-- Neon Hair -->
        <path d="M16 14l-4-4 6-2 2-6 4 4 4-4 2 6 6 2-4 4" fill="#7C3AED" opacity="0.8"/>
        <!-- Cybernetic Eye Plate -->
        <path d="M24 18h8v8h-4l-4-4v-4z" fill="#7C3AED"/>
        <circle cx="28" cy="22" r="2" fill="#0F172A"/>
        <!-- Body -->
        <path d="M14 40c0-6 4-8 10-8s10 2 10 8" fill="none" stroke="#7C3AED" stroke-width="2"/>
      </svg>
    `)
  },
  {
    id: 'racer',
    name: 'Yarış Pilotu',
    url: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
        <rect width="48" height="48" fill="#0F172A"/>
        <!-- Helmet -->
        <circle cx="24" cy="22" r="10" fill="#1E293B" stroke="#7C3AED" stroke-width="2"/>
        <!-- Goggles -->
        <path d="M14 20h20v6c0 3-2 5-5 5H19c-3 0-5-2-5-5v-6z" fill="#7C3AED" opacity="0.8"/>
        <rect x="17" y="22" width="5" height="3" rx="1" fill="#0F172A"/>
        <rect x="26" y="22" width="5" height="3" rx="1" fill="#0F172A"/>
        <!-- Racing Stripes -->
        <path d="M22 12v6m4-6v6" stroke="#0F172A" stroke-width="2"/>
        <!-- Body -->
        <path d="M14 40c0-6 4-8 10-8s10 2 10 8" fill="#1E293B" stroke="#7C3AED" stroke-width="2"/>
      </svg>
    `)
  },
  {
    id: 'footballer',
    name: 'Futbol Yıldızı',
    url: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
        <rect width="48" height="48" fill="#0F172A"/>
        <circle cx="24" cy="18" r="7" fill="#1E293B" stroke="#7C3AED" stroke-width="2"/>
        <!-- Hair -->
        <path d="M17 16c2-4 12-4 14 0" stroke="#7C3AED" stroke-width="3" fill="none" stroke-linecap="round"/>
        <!-- Jersey -->
        <path d="M14 40c0-8 4-12 10-12s10 4 10 12" fill="#1E293B" stroke="#7C3AED" stroke-width="2"/>
        <!-- Collar -->
        <path d="M20 28l4 5 4-5" stroke="#7C3AED" stroke-width="2" fill="none"/>
        <!-- Number/Detail -->
        <text x="24" y="38" fill="#7C3AED" font-size="8" font-family="sans-serif" font-weight="bold" text-anchor="middle">10</text>
        <!-- Tiny ball -->
        <circle cx="34" cy="34" r="3" fill="#7C3AED"/>
        <path d="M32 34h4m-2-2v4" stroke="#0F172A" stroke-width="1"/>
      </svg>
    `)
  }
];

export const getAvatarUrl = (id: string) => {
  const avatar = AVATARS.find(a => a.id === id);
  return avatar ? avatar.url : AVATARS[0].url;
};
