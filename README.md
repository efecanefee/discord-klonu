<div align="center">

# 🪑 SandalyeciMetin

**Discord benzeri, gerçek zamanlı sesli / görüntülü / yazılı sohbet platformu**

[![Status](https://img.shields.io/badge/status-live-brightgreen)](https://sandalyecimetin.vercel.app)
[![Frontend](https://img.shields.io/badge/frontend-React%2019%20%2B%20TypeScript-61dafb?logo=react&logoColor=white)](#-teknoloji)
[![Backend](https://img.shields.io/badge/backend-.NET%2010%20%2B%20SignalR-512bd4?logo=dotnet&logoColor=white)](#-teknoloji)
[![Database](https://img.shields.io/badge/database-PostgreSQL%20(Supabase)-336791?logo=postgresql&logoColor=white)](#-teknoloji)
[![License](https://img.shields.io/badge/license-Proprietary-red)](#-lisans)

**🌐 Canlı:** [sandalyecimetin.vercel.app](https://sandalyecimetin.vercel.app)

</div>

---

## 📖 Genel Bakış

SandalyeciMetin; sabit sohbet odaları (Ana Salon, Müzik Odası), kullanıcıların kurduğu **topluluk sunucuları** (metin + ses kanallı), birebir **özel mesajlaşma** ve **senkron YouTube izleme partisi** sunan, uçtan uca gerçek zamanlı bir web uygulamasıdır. Mobil (iOS/Android) için tam uyumludur ve PWA olarak yüklenebilir.

---

## ✨ Özellikler

### 💬 Mesajlaşma
- **Gerçek zamanlı mesajlaşma** — SignalR WebSocket, optimistic UI (mesaj anında görünür)
- **Emoji tepkileri** — hızlı palet (👍 ❤️ 😂 😮 😢 🔥), mesaj altında sayaçlı chip'ler
- **@mention** — üye listesinden otomatik tamamlama, vurgulu render, etiketlenince öne çıkan mesaj
- **Yanıtlama, düzenleme, silme** (yönetici silmesi dahil) · **"yazıyor..." göstergesi**
- **"Yeni Mesajlar" ayracı** — son okuduğun yerden devam et
- Kod blokları (`` `inline` `` / ` ```blok``` `), URL otomatik link + resim embed
- Dosya / resim gönderme (sürükle-bırak), emoji picker, mesajlarda arama, pagination
- Mesaj geçmişi: odalarda son 7 gün, DM'lerde son 14 gün (Supabase PostgreSQL)

### 🏠 Sunucular & Odalar
- **Topluluk sunucuları** — metin + ses kanallı, herkese açık veya gizli (kodlu)
- **Davet linki** — `?invite=KOD` ile tek tıkla katılım, panelden link kopyalama
- **Rol sistemi** — kurucu 👑 / moderatör 🛡️ / üye; yetki hiyerarşisi
- Moderasyon: kick, ban (sebepli), rol atama, kanal ekleme/silme
- **"Sunucudan Çık"** — üyelikten kalıcı çıkış (kurucu hariç)
- Oda kartlarında canlı "kim içeride" önizlemesi, arama (isim veya kod)

### 🎤 Ses & Görüntü
- **WebRTC** peer-to-peer sesli iletişim (STUN + isteğe bağlı TURN)
- Görüntülü görüşme, **ekran paylaşımı** (PiP modu), Meet benzeri tam ekran video grid
- Konuşan kişi göstergesi (dalga animasyonu), kişi başı ses seviyesi
- Mikrofon / hoparlör cihaz seçimi, kısayol tuşları (mute vb.)
- Arkaplanda kesintisiz ses — lobiye dönünce bağlantı kopmaz (Discord tarzı)

### 🎵 YouTube İzleme Partisi
- **Senkron oynatma** — play/pause/seek herkese yansır, geç katılan doğru saniyeden devam eder
- **Davet akışı** — parti başlatınca odadakilere davet gider, kabul eden birlikte izler
- **Şarkı kuyruğu** — "Kuyruğa ekle", video bitince otomatik geçiş, sıra atlama/çıkarma
- Soundboard — kullanıcıya özel yüklenebilir sesler (Ana Salon)

### 💌 Özel Mesajlar (DM)
- Birebir mesajlaşma; yanıt, düzenleme, silme, dosya gönderme
- Okundu bilgisi (✓ / ✓✓), "yazıyor..." göstergesi
- **Okunmamış rozetleri** — çevrimdışıyken gelen mesajlar login sonrası da görünür
- Oda içinden çıkmadan açılan DM overlay'i

### 👤 Kullanıcı & Profil
- JWT kimlik doğrulama; e-posta doğrulama ve şifre sıfırlama (Resend)
- Profil fotoğrafı yükleme + hazır avatarlar
- Durumlar: Çevrimiçi · Uzakta · Meşgul · Müzik Dinliyor (+ özel durum mesajı)
- Son görülme (gizlenebilir), çevrimiçi kullanıcı listesi

### 🔔 Bildirimler & Arayüz
- **Tarayıcı bildirimleri** — DM ve @mention için (ayarlardan açılır), tıklayınca uygulamaya odaklanır
- Sekme başlığında okunmamış sayısı: `(3) SandalyeciMetin`
- Sentetik bildirim sesleri (giriş/çıkış/mesaj/mute)
- **Glassmorphism** tasarım, Koyu / OLED tema + 6 vurgu rengi, Framer Motion animasyonları
- Azaltılmış hareket (reduced motion) desteği
- **Tam mobil uyumlu** + PWA (ana ekrana yüklenebilir)

---

## 🛠️ Teknoloji

| Katman | Teknolojiler |
|--------|--------------|
| **Frontend** | React 19 · TypeScript · Vite · Tailwind CSS · Framer Motion · SignalR Client · WebRTC · vite-plugin-pwa |
| **Backend** | .NET 10 · ASP.NET Core · SignalR · Entity Framework Core · JWT · Resend (e-posta) |
| **Veritabanı** | PostgreSQL (Supabase) |
| **Deployment** | Vercel (frontend) · Render — Docker (backend) · Supabase (DB) |

### Mimari Notlar
- **SignalR hub** tek merkez: mesajlaşma, WebRTC sinyalleşmesi, YouTube senkronu, typing/reaction event'leri aynı bağlantı üzerinden akar.
- **Broadcast-first mesaj akışı:** mesaj önce yayınlanır, sonra DB'ye yazılır, gerçek ID `MessageIdAssigned` ile yamalanır — algılanan gecikme sıfıra iner.
- **Şema yönetimi:** açılışta idempotent SQL (`CREATE TABLE/COLUMN IF NOT EXISTS`) — migration derdi olmadan sıfır kesintili şema evrimi.
- **WebRTC tam mesh** + isteğe bağlı TURN relay (kısıtlı ağlar/CGNAT için).

---

## 🚀 Yerel Kurulum

### Gereksinimler
- Node.js 18+
- .NET 10 SDK
- PostgreSQL bağlantısı (ör. ücretsiz Supabase projesi)

### 1. Backend

```bash
cd backend/DiscordClone.Api
```

`DATABASE_URL` ortam değişkenini ayarla (Supabase → Project Settings → Database → Connection string):

```bash
# PowerShell
$env:DATABASE_URL = "postgresql://kullanici:parola@host:5432/postgres"

# bash
export DATABASE_URL="postgresql://kullanici:parola@host:5432/postgres"
```

```bash
dotnet run
```

API varsayılan olarak `http://localhost:5098` üzerinde çalışır. Tablolar ilk açılışta otomatik oluşturulur.

| Ortam Değişkeni | Zorunlu | Açıklama |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL bağlantı dizesi |
| `PORT` | ❌ | HTTP portu (varsayılan `5098`) |
| `Jwt:Key` | ❌ | JWT imza anahtarı (üretimde değiştir) |
| `Resend:ApiKey` | ❌ | E-posta doğrulama/sıfırlama için Resend anahtarı |

### 2. Frontend

```bash
cd frontend
npm install
```

```bash
cp .env.example .env.local
```

`.env.local` içinde `VITE_API_URL`'i backend adresine çevir (`http://localhost:5098`). NAT arkasındaki kullanıcılar için isteğe bağlı TURN ayarları da aynı dosyada belgelidir.

```bash
npm run dev
```

Uygulama `http://localhost:5173` adresinde açılır.

### Üretim Derlemesi

```bash
cd frontend
npm run build
```

Backend, Render için hazır `Dockerfile` ile gelir (`backend/DiscordClone.Api/Dockerfile`).

---

## 📁 Proje Yapısı

```
discord-klonu/
├── frontend/                  # React + Vite SPA (PWA)
│   └── src/
│       ├── components/        # ChatRoom, TextChatRoom, DMChatRoom, YoutubePlayerPanel...
│       ├── hooks/             # useWebRTC, useVoiceChannel, useKeybinds...
│       ├── services/          # signalrService (hub istemcisi), roomApi (REST)
│       ├── contexts/          # SettingsContext (tema, ses, bildirim tercihleri)
│       └── utils/             # mentions, lastRead, browserNotifications...
└── backend/
    └── DiscordClone.Api/      # ASP.NET Core API
        ├── Hubs/              # ChatAndSignalingHub — tüm gerçek zamanlı trafik
        ├── Controllers/       # Auth, Rooms, DirectMessages, Users, Upload, Sounds
        ├── Models/            # ChatMessage, Room, RoomMember, MessageReaction...
        └── Data/              # AppDbContext (EF Core, snake_case eşlemeler)
```

---

## 📄 Lisans

**Tescilli (Proprietary) — Tüm hakları saklıdır © 2026 Efecan Efe.**

Kaynak kodu yalnızca inceleme amacıyla herkese açıktır; kopyalama, dağıtma, değiştirme ve kendi projende kullanma yazılı izin gerektirir. Ayrıntılar için [LICENSE](LICENSE) dosyasına bak.

<div align="center">

**MADE BY EFECAN** 🪑

</div>
