# Bugünün Planı — 14 Temmuz 2026 (Yarım Gün · 4-5 Saat)

> Hedef: Discord'a rakip olarak **fark yaratan 1 büyük özellik** + kritik düzeltmeler + hızlı kazanımlar.
> Strateji: Discord'un zayıf/premium'a kilitli olduğu yerlerden vurmak.

---

## Rakip Analizi: Discord'a Karşı Nerede Kazanırız?

| Alan | Discord | SandalyeciMetin fırsatı |
|------|---------|--------------------------|
| Birlikte müzik/video | "Activities" karmaşık, çoğu Nitro'lu | **Senkron dinleme odası — ücretsiz, tek tık** ⭐ |
| Gizlilik | Mesajlar sonsuza dek durur | Mesajlar 7 günde otomatik silinir (**zaten var** — öne çıkar!) |
| Erişim | Uygulama indirtmeye zorlar | Tarayıcıda anında, PWA zaten kurulu |
| Türkçe deneyim | Çeviri kalitesi orta | Türkçe-öncelikli arayüz (mevcut avantaj) |
| Basitlik | Sunucu/kanal/rol karmaşası | Oda kodu ile 6 haneli davet (**zaten var**) |

**Bugünün yıldızı:** Müzik Odası'nı gerçek bir **senkron YouTube dinleme odasına** çevirmek. Discord'da bunun karşılığı ya yok ya premium — bizde ana özellik olur.

---

## Zaman Çizelgesi

### 🕐 Blok 1 — Kritik Düzeltmeler (30-40 dk)
*Rakipten önce kendi ayağımıza sıkmayalım.*

- [ ] `App.tsx` → `handleUpdatePrivacy` yanlış endpoint'e gidiyor: `/api/users/status` → `/api/users/privacy` (kullanıcı durumunu siliyor, 1 satır).
- [ ] `Program.cs` + `AuthController.cs` → gömülü JWT fallback secret'ı kaldır; env yoksa uygulama başlamasın (`throw`).
- [ ] `Program.cs` → `/api/test-db` endpoint'ini sil (herkes DB'ye kayıt atabiliyor).
- [ ] `AuthController` → hata yanıtlarından `stack` ve `inner` alanlarını kaldır (üretimde bilgi sızıntısı).

> Commit: `fix: kritik güvenlik ve privacy düzeltmeleri`

### 🕑 Blok 2 — ⭐ Senkron Müzik Odası (2.5 saat)
*Discord'a karşı ana koz. Müzik Odası zaten var — içini dolduruyoruz.*

**Kapsam (MVP):**
- Odadaki herhangi biri YouTube linki yapıştırır → herkeste aynı anda çalar.
- Oynat/duraklat/ileri sar herkese senkron yansır.
- Sonradan katılan, mevcut konumdan devam eder.
- Basit sıra (queue): art arda eklenen linkler listelenir.

**Backend — `ChatAndSignalingHub.cs`** (~45 dk)
```csharp
// Oda başına state (static ConcurrentDictionary<string, MusicState>)
public record MusicState(string VideoId, bool Playing, double PositionSec, long UpdatedAtMs, List<string> Queue);

public Task SetVideo(string roomId, string videoId)      // → Group: "MusicVideoSet"
public Task PlayPause(string roomId, bool playing, double pos) // → Group: "MusicPlayState"
public Task Seek(string roomId, double pos)              // → Group: "MusicSeek"
public Task AddToQueue(string roomId, string videoId)    // → Group: "MusicQueueUpdated"
// JoinRoom içinde: oda müzik state'i varsa Caller'a "MusicSync" gönder
// (pozisyon = PositionSec + (now - UpdatedAtMs)/1000, playing ise)
```

**Frontend** (~1 saat 45 dk)
- Yeni bileşen: `components/MusicPlayer.tsx` — YouTube IFrame API (`react-youtube` gerekmez, script ile).
- `signalrService.ts`'e 5 event'in on/off/send metodları.
- `ChatRoom.tsx`: oda tipi/adı "Müzik Odası" ise üstte player paneli.
- Senkron mantığı: gelen event'lerde `player.seekTo(pos)` + `playVideo()/pauseVideo()`; **yerel event ile uzak event'i ayır** (flag: `isRemoteAction`) yoksa sonsuz döngü olur.
- Link yakalama: sohbete yapıştırılan YouTube URL'sinde "▶ Birlikte çal" butonu.

**Yerleşim:**
```
┌─────────────────────────────────────────┐
│ 🎵 Müzik Odası          👥 4 kişi       │
│ ┌─────────────────────┐  Sıradakiler:   │
│ │  [YouTube Player]   │  1. lofi mix    │
│ │                     │  2. Tarkan      │
│ │ ▶ ──────●────  2:41 │  [+ link ekle]  │
│ └─────────────────────┘                 │
│ ─────────── sohbet devam eder ───────── │
└─────────────────────────────────────────┘
```

> Commit: `feat: senkron YouTube müzik odası`
> Riskler: iframe autoplay politikası → ilk etkileşimde "Katıl ve dinle" butonu koy (autoplay engelini aşar).

### 🕓 Blok 3 — Hızlı Kazanımlar (45-60 dk)
*Az eforla "canlı" hissi — Discord parite eksiklerini kapat.*

- [ ] **Odada "yazıyor..." göstergesi** (~25 dk): Hub'a `SendRoomTyping(roomId)` → `Clients.OthersInGroup`; frontend'de 3 sn debounce, input altında "Ali yazıyor…".
- [ ] **Sekme başlığında okunmamış rozeti** (~10 dk): `document.title = "(3) SandalyeciMetin"` — `unreadCounts` state'i zaten var.
- [ ] **Gizlilik rozetini pazarla** (~10 dk): Lobiye küçük rozet — "🔒 Mesajlar 7 günde otomatik silinir". Var olan özelliği görünür avantaja çevir.

> Commit: `feat: yazıyor göstergesi + okunmamış rozeti`

### 🕔 Blok 4 — Test + Deploy (30 dk)
- [ ] İki tarayıcı/iki hesapla senkron müzik testi (katıl, oynat, sar, sonradan katıl).
- [ ] Privacy düzeltmesini test et (durum kaybolmuyor mu?).
- [ ] Render + Vercel deploy, canlıda hızlı duman testi.

---

## Zaman Kalırsa (sırayla)
1. **Emoji tepkileri** (mesaja hover → 👍❤️😂) — parite ama etkisi büyük (~1 saat, DB tablosu gerekir; yarına da kalabilir).
2. Müzik odasına **"DJ kilidi"**: sadece sırayı ekleyen kontrolü kilitleyebilsin.

## Bugün Yapma (kapsam sızmasın)
- Bas-konuş / tuş atama → mevcut planda Faz 2'de, yarına.
- Dosya paylaşımı (Supabase Storage) → başlı başına yarım gün, ayrı güne.
- `App.tsx` refactor → özellik günü değil, ayrı temizlik günü.

---

## Günün Sonunda Elde Ne Olacak?
Discord'un ücretsiz sunmadığı **senkron müzik dinleme** canlıda; kritik güvenlik açıkları kapalı; odalar "yazıyor…" ile daha canlı; gizlilik avantajı görünür. Tek cümlelik pazarlama: *"Arkadaşlarınla tek tıkla aynı şarkıyı dinle — kayıt yok, kurulum yok, mesajların 7 günde yok olur."*
