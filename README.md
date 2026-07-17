# 🪑 SandalyeciMetin

> Discord benzeri gerçek zamanlı sesli/görüntülü sohbet uygulaması

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-live-brightgreen)

**🌐 Canlı Site:** [sandalyecimetin.vercel.app](https://sandalyecimetin.vercel.app)

---

## ✨ Özellikler

### 💬 Mesajlaşma
- Gerçek zamanlı anlık mesajlaşma (SignalR)
- Mesaj geçmişi (1 hafta kalıcı — Supabase PostgreSQL)
- Mesaj düzenleme ve silme
- Optimistic UI (mesaj anında görünür)
- Kod bloğu desteği (`` `inline` `` ve ` ```blok``` `)
- URL otomatik link + resim embed
- Dosya / resim gönderme (sürükle-bırak)
- Emoji picker
- Mesaj arama
- Pagination (büyük geçmişlerde performanslı yükleme)

### 🎤 Ses & Görüntü
- WebRTC peer-to-peer sesli iletişim
- Görüntülü görüşme (kamera açma/kapama)
- Ekran paylaşımı
- Konuşan kişi göstergesi (dalga animasyonu)
- Mikrofon & kulaklık cihaz seçici
- Kişi başı ses seviyesi kontrolü
- Bildirim sesleri (giriş, çıkış, mute, mesaj)

### 👥 Kullanıcı
- Kullanıcı durumları (Çevrimiçi, Uzakta, Meşgul, Müzik Dinliyor)
- Yazıyor... göstergesi
- Zaman damgası tooltip

### 🎨 Arayüz
- Glassmorphism tasarım
- Tema: Sistem / Koyu / Açık / OLED (Ayarlar → Görünüm; seçim kayıtlı kalır)
- Framer Motion animasyonları
- Tam ekran video grid (Meet benzeri)
- Ekran paylaşımı PiP modu

### 🔔 Bildirimler
- Tarayıcı push bildirimleri
- Sekme başlığında okunmamış mesaj sayısı `(3) SandalyeciMetin`

---

## 🛠️ Teknoloji Stack

### Frontend
| Teknoloji | Kullanım |
|-----------|---------|
| React + TypeScript | UI framework |
| Next.js / Vite | Build tool |
| Tailwind CSS | Stil |
| Framer Motion | Animasyon |
| SignalR Client | Gerçek zamanlı bağlantı |
| WebRTC | Ses/görüntü iletişimi |

### Backend
| Teknoloji | Kullanım |
|-----------|---------|
| C# .NET | API framework |
| SignalR | WebSocket hub |
| Entity Framework Core | ORM |
| Supabase PostgreSQL | Veritabanı |

### Deployment
| Servis | Kullanım |
|--------|---------|
| Vercel | Frontend hosting |
| Render | Backend hosting |
| Supabase | PostgreSQL veritabanı |

---

## 🚀 Kurulum

### Gereksinimler
- Node.js 18+
- .NET 8+
- Supabase hesabı

### Frontend
```bash
