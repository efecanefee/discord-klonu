# SandalyeciMetin — Geliştirme Planı

> Tarih: 13 Temmuz 2026
> Kapsam: Kullanıcının istediği 5 ana özellik + ek öneriler ve örnek tasarımlar.
> Yığın: React 19 + TS + Tailwind 4 + Framer Motion (frontend) · .NET 10 + SignalR (backend) · Supabase PostgreSQL

---

## Özet Tablo

| # | Özellik | Zorluk | Öncelik | Etkilenen Dosyalar |
|---|---------|--------|---------|--------------------|
| 1 | Oda içindeyken DM ve Profil erişimi | Orta | Yüksek | `App.tsx`, `ChatRoom.tsx`, `DMChatRoom.tsx` |
| 2 | Dosya paylaşımını aktifleştirme | Orta | Yüksek | `UploadController.cs`, `ChatRoom.tsx`, `DMChatRoom.tsx` |
| 3 | Odadaki kullanıcıya tıklayıp DM açma | Düşük-Orta | Yüksek | `ChatRoom.tsx`, `App.tsx`, `ChatAndSignalingHub.cs` |
| 4 | Bas-konuş (PTT) + tuş atama | Orta-Yüksek | Orta | `SettingsContext.tsx`, `SettingsModal.tsx`, `useWebRTC.ts` |
| 5 | ~~Kitap animasyonu~~ → Akıcı slayt geçişi (REVİZE) | Düşük-Orta | Orta | `App.tsx` (yeni: `RoomPager.tsx`) |
| 6 | Rol sistemi: Kurucu / Moderatör / Üye (YENİ) | Yüksek | Yüksek | Backend geneli + `ChatRoom.tsx` |
| 7 | Lobi yenileme + MADE BY EFECAN düzeltmesi (YENİ) | Düşük | Orta | `App.tsx` |
| 8 | Kanal sistemi: oda = sunucu, metin+ses kanalları (YENİ) | Çok Yüksek | Yüksek | DB + Hub + oda UI komple |
| 9 | Üye listesi: "Odaya Katılanlar" çevrimiçi/çevrimdışı (YENİ) | Orta | Orta | `ChatRoom.tsx`, Hub |
| 10+ | Ek öneriler | — | Seçmeli | Çeşitli |
| 11 | Bildirim sistemi: masaüstü/push + oda susturma (YENİ) | Orta | Yüksek | `SettingsContext.tsx`, Hub, DB |
| 12 | Yanıtlama + @bahsetme + vurgulu bildirim (YENİ) | Orta | Yüksek | `ChatMessage.cs` (kolon var), `TextChatRoom.tsx` |
| 13 | Anti-spam, rate limit & raporlama/moderasyon (YENİ) | Orta-Yüksek | Yüksek | Hub, yeni middleware, DB |
| 14 | Arkadaşlık & engelleme sistemi (YENİ) | Orta | Orta | DB + `UsersController.cs` + Hub |
| 15 | Performans: mesaj sayfalama + sanal liste (YENİ) | Orta | Yüksek | Hub, `TextChatRoom.tsx`, `RoomsController.cs` |
| 16 | PWA + mobil + erişilebilirlik (YENİ) | Orta | Orta | `vite.config.ts`, geneli |
| 17 | Ekran paylaşımı & görüntülü görüşme (YENİ) | Yüksek | Düşük-Orta | `useWebRTC.ts`, Hub |
| 18 | Test, CI/CD & hata izleme (YENİ) | Orta | Orta | Repo geneli |
| 19 | Onboarding + hesap/veri yönetimi (KVKK) (YENİ) | Orta | Orta | `UsersController.cs`, `App.tsx` |

---

## 1) Oda İçindeyken DM ve "Profili Düzenle" Erişimi

### Mevcut Durum
`ChatRoom` bileşeni tam ekran render ediliyor; `App.tsx`'teki sol menü (DM listesi, profil butonu, ayarlar) oda içindeyken tamamen kayboluyor. DM'lere veya profil düzenlemeye ulaşmak için odadan çıkmak gerekiyor.

### Hedef Davranış
- Oda içinde sol tarafta **daraltılabilir mini yan panel (dock)** bulunsun.
- Dock'ta: kendi avatarın (tıklayınca ProfileModal), DM listesi (okunmamış rozetli), ayarlar dişlisi.
- DM'ye tıklayınca oda bağlantısı **kopmadan** DM sohbeti bir **overlay/panel** olarak açılsın (Discord'daki gibi).

### Uygulama Adımları
1. `App.tsx`'te `inRoom === true` iken sol menüyü unmount etmek yerine `w-[72px]` genişliğinde mini moda geçir (state: `sidebarMode: 'full' | 'mini' | 'hidden'`).
2. Mini dock bileşeni oluştur: `components/MiniDock.tsx`
   - Üstte site logosu (tıklayınca lobiye döner — mevcut LeaveRoom akışı).
   - Ortada aktif DM avatarları (unreadCounts rozetleriyle — state zaten `App.tsx`'te var).
   - Altta: kendi avatarın (ProfileModal açar) + Settings dişlisi.
3. DM overlay: `DMChatRoom`'u `position: fixed; right: 0` panel olarak render et (`z-50`, genişlik `380px`, mobilde tam ekran). SignalR bağlantısı tekil (singleton service) olduğu için oda bağlantısı etkilenmez — `JoinRoom`/`LeaveRoom` çağrılmadığı sürece odada kalırsın.
4. `ProfileModal` ve `SettingsModal` zaten global modal — sadece oda içinden tetiklenebilir hale getir (prop veya global state).

### Örnek Tasarım (yerleşim)
```
┌──────┬──────────────────────────────────┬─────────────┐
│ dock │        ODA (ChatRoom)            │  DM paneli  │
│ 72px │                                  │  (açılınca) │
│ ●    │  mesajlar...                     │  380px      │
│ ◉2   │                                  │  ┌───────┐  │
│ ◉    │                                  │  │ Ali   │  │
│ ──   │                                  │  │ ...   │  │
│ 👤   │  [✏ mesaj yaz...        📎 ➤]   │  └───────┘  │
│ ⚙    │                                  │             │
└──────┴──────────────────────────────────┴─────────────┘
● = logo/lobi  ◉ = DM avatarı (rozet: okunmamış)  👤 = profil  ⚙ = ayarlar
```

---

## 2) Dosya Paylaşımını Aktifleştirme

### Mevcut Durum (önemli tespit)
Kod **zaten yazılmış**: backend `UploadController.cs` (10MB limit, uzantı beyaz listesi) ve `ChatRoom.tsx`'te `handleFileUpload` + ataç butonu + sürükle-bırak mevcut. Çalışmamasının muhtemel sebepleri:
- **Render'ın diski geçici (ephemeral)** — `wwwroot/uploads`'a yazılan dosyalar her deploy/restart'ta siliniyor, URL'ler kırılıyor.
- DM tarafında (`DMChatRoom.tsx`) dosya gönderme hiç bağlanmamış olabilir.

### Hedef Davranış
- Dosyalar kalıcı depoya yüklensin, hem oda hem DM'de paylaşılabilsin.
- Görseller inline önizlensin, diğer dosyalar indirilebilir kart olarak görünsün.

### Uygulama Adımları
1. **Depolamayı Supabase Storage'a taşı** (frontend'de `@supabase/supabase-js` zaten kurulu; DB de zaten Supabase):
   - Backend `UploadController`'a `Supabase.Storage` entegrasyonu **veya** daha basiti: backend Supabase Storage REST API'sine `service_role` anahtarıyla yükleme yapsın, public URL dönsün. Frontend akışı hiç değişmez.
   - Bucket: `chat-uploads`, public-read. Dosya adı: `{Guid}.{ext}` (mevcut mantık korunur).
2. Güvenlik iyileştirmeleri (aynı PR'da):
   - Content-Type doğrulaması (magic bytes: görseller için ilk baytları kontrol et).
   - `.zip`'i beyaz listeden çıkarmayı değerlendir veya tarama ekle.
3. **DM'de dosya**: `DMChatRoom.tsx`'e `ChatRoom`'daki ataç butonu + `handleFileUpload` kopyalanır; Hub'a `SendDirectFileMessage(receiverId, fileUrl, fileName)` metodu eklenir (DB kolonları `file_url`, `file_name` **zaten var**).
4. Görsel önizleme: `/\.(jpe?g|png|gif|webp)$/i` → `<img>` (max-h-64, tıklayınca lightbox); video → `<video controls>`; ses → `<audio controls>`; diğerleri → dosya kartı.

### Örnek Tasarım (mesaj balonları)
```
┌─ Efecan ────────────────┐   ┌─ Efecan ──────────────────┐
│ ┌─────────────────────┐ │   │ ┌───┐ rapor.pdf           │
│ │   [görsel önizleme] │ │   │ │📄 │ 2.4 MB · PDF        │
│ │    tıkla → büyüt    │ │   │ └───┘ [⬇ İndir]           │
│ └─────────────────────┘ │   └───────────────────────────┘
└─────────────────────────┘
```

---

## 3) Odadaki Kullanıcı Profiline Tıklayınca DM Açma

### Mevcut Durum
"Odada Olanlar" listesi sadece isim + avatar gösteriyor; tıklama aksiyonu yok. DM açmak için odadan çıkıp kişiyi bulmak gerekiyor.

### Hedef Davranış
1. Kullanıcıya tıklayınca küçük bir **profil kartı (popover)** açılır: avatar, isim, durum, "Mesaj Gönder" butonu.
2. "Mesaj Gönder" → odadan **ayrılmadan** sağda DM paneli açılır (Özellik 1'deki overlay yeniden kullanılır).

### Uygulama Adımları
1. **Backend**: `RoomUserDto`'ya `UserId` ekle (`ChatAndSignalingHub.JoinRoom` içinde `Context.UserIdentifier` zaten elde; DTO'ya yaz). `RoomUsers` event'i otomatik taşır. *(DM göndermek `receiverId` istediği için bu şart.)*
2. **Frontend**: `ChatRoom.tsx`'te kullanıcı satırına `onClick` → `<UserPopoverCard user={...} />`.
3. Karttaki "Mesaj Gönder" → `App.tsx`'e callback (`onOpenDM(user)`) → `activeDMUser` set edilir, DM overlay açılır. `inRoom` state'ine dokunulmaz; SignalR singleton olduğundan oda düşmez.
4. Kendine tıklayınca "Mesaj Gönder" yerine "Profili Düzenle" göster.

### Örnek Tasarım (popover)
```
   Odada Olanlar (3)
   ┌────────────────┐
   │ 🟢 Ali         │◄─ tık
   └───────┬────────┘
     ┌─────▼──────────────────┐
     │  ┌────┐                │
     │  │ 🦊 │  Ali Yılmaz    │
     │  └────┘  @ali          │
     │  🟢 Çevrimiçi          │
     │  "kod yazıyorum"       │
     │ ┌────────────────────┐ │
     │ │ 💬 Mesaj Gönder    │ │
     │ └────────────────────┘ │
     └────────────────────────┘
```

---

## 4) Bas-Konuş (Push-to-Talk) + Tuş Atama

### Mevcut Durum
`SettingsContext.tsx`'te `pushToTalk: boolean` **tanımlı ama hiçbir yerde kullanılmıyor**. Tuş atama sistemi yok. Mikrofon susturma sadece UI butonuyla yapılıyor.

### Hedef Davranış
- Ayarlar → Ses sekmesinde: "Bas-Konuş" anahtarı + **tuş yakalama alanı** (tıkla → "Bir tuşa bas..." → basılan tuş kaydedilir, ör. `Page Up`).
- Ayrıca ayrı bir **"Mikrofon Aç/Kapat" kısayol tuşu** atanabilsin (toggle).
- PTT açıkken: mikrofon track'i normalde `enabled=false`; atanan tuş **basılı tutulunca** `true`, bırakınca `false`.

### Uygulama Adımları
1. `SettingsContext`'e ekle: `pttKey: string` (varsayılan `"Space"`), `muteToggleKey: string` (varsayılan `"PageUp"`). `KeyboardEvent.code` formatında sakla (layout'tan bağımsız).
2. Yeni hook: `hooks/useKeybinds.ts`
   ```ts
   // window keydown/keyup dinler; input/textarea odaktayken PTT'yi yoksay
   // (e.target instanceof HTMLInputElement kontrolü)
   // keydown(pttKey)  -> setMicEnabled(true)   + e.preventDefault()
   // keyup(pttKey)    -> setMicEnabled(false)
   // keydown(muteToggleKey) -> toggleMute()  (tek basış)
   ```
3. `useWebRTC.ts`: `localStream.getAudioTracks()[0].enabled` üzerinden kontrol; PTT modunda odaya girişte track disabled başlasın. Konuşurken `NotifyMuteStatus` ile diğerlerine yeşil halka bildirimi gönder.
4. `SettingsModal.tsx` → Ses sekmesine "Tuş Atama" bölümü:
   - `KeybindInput` bileşeni: tıklanınca `listening` moduna girer, ilk `keydown`'u yakalar, `e.code` gösterir (`Escape` = iptal, `Backspace` = temizle).
   - Çakışma kontrolü: aynı tuş iki eyleme atanamasın.
5. Kısıt (bilinmeli): tarayıcı sekmesi **odakta değilken** tuşlar yakalanamaz (web sınırı). Bu, ayarların altına küçük bir not olarak yazılsın.

### Örnek Tasarım (Ayarlar → Ses)
```
┌─ Ses ──────────────────────────────────────────┐
│ Mikrofon        [Varsayılan ▾]                 │
│ Hoparlör        [Varsayılan ▾]                 │
│ Gürültü Engelleme            [✓]               │
│ ─────────────────────────────────              │
│ Bas-Konuş Modu               [✓]               │
│   Konuşma Tuşu     ┌──────────────┐            │
│                    │  Page Down   │  (tıkla →  │
│                    └──────────────┘   tuş seç) │
│ Mikrofon Aç/Kapat  ┌──────────────┐            │
│   Kısayolu         │   Page Up    │            │
│                    └──────────────┘            │
│ ⓘ Kısayollar yalnızca sekme odaktayken çalışır │
└────────────────────────────────────────────────┘
```

---

## 5) Oda Geçişi — REVİZE: Kitap Animasyonu Yerine Akıcı Slayt (15 Tem 2026)

> ⚠️ Kitap çevirme animasyonu denendi, beğenilmedi (hantal his). Aşağıdaki akıcı alternatifle değiştirilecek.

### Önerilen: Spring Slayt + Kayan Sekme (Discord/iOS hissi)
İki katmanlı çözüm — hem tıklamayla hem kaydırmayla çalışır:

1. **Üstte segment kontrol**: `[ Ana Odalar | Topluluk Odaları ]` — aktif sekmenin arkasında kayan mor "hap" (Framer Motion `layoutId="tabPill"` ile kendiliğinden akıcı geçiş, sıfır ek kod).
2. **İçerik: yatay spring slayt** — sayfalar yan yana bir şeritte (`display:flex; width:200%`), geçişte şerit `x: 0 ⇄ -50%` spring ile kayar:
   ```tsx
   <motion.div animate={{ x: page === 0 ? '0%' : '-50%' }}
     transition={{ type: 'spring', stiffness: 300, damping: 32 }}>
   ```
   - 3D yok, perspektif yok → GPU dostu, her cihazda 60fps.
   - Ayrılan sayfa hafif küçülür + soluklaşır (`scale: 0.96, opacity: 0.6`) → derinlik hissi ucuz yoldan.
3. **Swipe desteği**: aynı şeride `drag="x"` + hız bazlı eşik: `if (Math.abs(velocity.x) > 400 || offset > width*0.3) → sayfa değiştir`. Hız bazlı eşik, kısa ama hızlı kaydırmayı da algılar — akıcılık hissinin asıl sırrı budur.
4. `settings.reducedMotion` açıksa: animasyonsuz anında geçiş (mevcut ayar).

### Neden kitap animasyonundan daha iyi
`rotateY` 3D dönüşümü her karede tüm sayfayı yeniden rasterize eder (özellikle blur/gölge varken yavaş); spring slayt yalnızca `transform: translateX` kullanır — tarayıcının en ucuz animasyonu. Ayrıca sekme + kaydırma ikilisi keşfedilebilir: kullanıcı sürüklemeyi bilmese de sekmeyi görür.

### İnce ayar önerileri
- Sekme geçişinde oda kartları **50ms arayla sırayla** belirsin (`staggerChildren: 0.05`) — "canlı" his.
- Sayfa göstergesi: altta iki nokta `● ○` (mobilde swipe ipucu).

### Örnek Tasarım
```
┌──────────────────────────────────────┐
│   ┌─────────────┬─────────────────┐  │
│   │ ▓ANA ODALAR▓│ Topluluk Odaları│  │ ← kayan mor hap
│   └─────────────┴─────────────────┘  │
│  ┌──────────────────┐                │
│  │ 👥 Ana Salon     │   ← swipe →    │
│  └──────────────────┘                │
│  ┌──────────────────┐                │
│  │ 🎵 Müzik Odası   │                │
│  └──────────────────┘                │
│              ● ○                     │
└──────────────────────────────────────┘
```

---

## 6) Rol Sistemi — Kurucu / Moderatör / Üye (YENİ · 15 Tem 2026)

### Hedef
Topluluk odaları Discord sunucusu gibi çalışsın: odanın **Kurucusu** ve atadığı **Moderatörler** odayı yönetebilsin.

### Roller ve Yetki Matrisi
| Yetki | 👑 Kurucu | 🛡️ Moderatör | Üye |
|-------|:---------:|:------------:|:----:|
| Mesaj yazma / dosya gönderme | ✓ | ✓ | ✓ |
| Kendi mesajını düzenle/sil | ✓ | ✓ | ✓ |
| **Başkasının mesajını silme** | ✓ | ✓ | ✗ |
| **Kullanıcı atma (kick)** | ✓ | ✓ | ✗ |
| **Kullanıcı yasaklama (ban)** | ✓ | ✓* | ✗ |
| **Moderatör atama/alma** | ✓ | ✗ | ✗ |
| Oda adı/açıklama düzenleme | ✓ | ✓ | ✗ |
| **Odayı silme** | ✓ | ✗ | ✗ |

*\* Moderatör, başka bir moderatörü veya kurucuyu banlayamaz/atamaz (hiyerarşi kuralı).*

### Veritabanı (yeni tablolar)
```sql
CREATE TABLE room_members (
    room_id int NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role text NOT NULL DEFAULT 'member',  -- 'owner' | 'moderator' | 'member'
    joined_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (room_id, user_id)
);
CREATE TABLE room_bans (
    room_id int NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id text NOT NULL,
    banned_by text NOT NULL,
    reason text,
    banned_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (room_id, user_id)
);
```
> ÖNEMLİ: `rooms.created_by` şu an **username** tutuyor (değiştirilebilir → sahiplik kaybı riski). Bu işle birlikte `created_by_user_id` kolonuna geçilmeli; oda oluşturulunca `room_members`'a `owner` kaydı atılmalı. Mevcut odalar için migration: username → userId eşleştir.

### Backend Adımları
1. **Model + EF Migration**: `RoomMember.cs`, `RoomBan.cs`; `AppDbContext`'e ekle.
2. **Yetki servisi**: `Services/RoomAuthorizationService.cs`
   ```csharp
   Task<string?> GetRoleAsync(int roomId, string userId);      // null = üye değil
   Task<bool> CanModerateAsync(int roomId, string actorId, string targetId); // hiyerarşi kontrolü
   ```
3. **RoomsController** yeni endpoint'ler:
   - `GET  /api/rooms/{id}/members` — üye + rol listesi
   - `PUT  /api/rooms/{id}/members/{userId}/role` — rol ata (sadece owner)
   - `DELETE /api/rooms/{id}/members/{userId}` — kick (owner/mod, hiyerarşiye tabi)
   - `POST /api/rooms/{id}/bans` + `DELETE /api/rooms/{id}/bans/{userId}` — ban/unban
   - `DeleteRoom` artık `created_by_user_id` ile kontrol etsin (username değil).
4. **Hub değişiklikleri** (`ChatAndSignalingHub`):
   - `JoinRoom`: banlıysa reddet (`Clients.Caller.SendAsync("JoinRejected", "banned")`); üye değilse `member` olarak kaydet.
   - `DeleteMessage`: kendi mesajı **veya** odada mod/owner ise silebilsin.
   - Yeni event'ler: `MemberKicked` (atılan istemci odadan düşürülür + bilgilendirilir), `MemberRoleChanged`, `MemberBanned`.
5. Ana odalar (`system` odaları: Ana Salon, Müzik Odası) rol sistemi **dışında** kalır — herkes üye, kimse yönetici (veya site sahibi global admin olur, aşağıya bak).

### Frontend Adımları
1. "Odada Olanlar" listesinde rol rozetleri: 👑 (altın), 🛡️ (mavi); liste sırası: Kurucu → Modlar → Üyeler.
2. Profil popover'ına (Özellik 3'teki kart) **yönetim bölümü** eklenir — yalnızca yetkin varsa görünür:
   ```
   ┌────────────────────────┐
   │  🦊 Ali · 🛡️ Moderatör │
   │  💬 Mesaj Gönder       │
   │  ── Yönetim ──         │
   │  🛡️ Moderatör Yap/Al   │  ← sadece kurucu görür
   │  👢 Odadan At          │
   │  🚫 Yasakla            │
   └────────────────────────┘
   ```
3. Mesaj hover menüsü: mod/owner isen başkasının mesajında da "Sil" görünür.
4. Kicklenen/banlanan kullanıcıda toast: "Odadan atıldınız" → lobiye yönlendir.
5. Oda ayarları modali (kurucu için): ad/açıklama düzenleme + ban listesi yönetimi.

### Sonraki adım (opsiyonel, bugün değil)
- **Global admin** (site sahibi): `users.is_admin` kolonu — her odada owner yetkisi + kullanıcı hesabı dondurma.
- Özel roller/renkler (Discord'daki gibi kişiselleştirilmiş roller) — v2.

---

## 7) Lobi Yenileme + "MADE BY EFECAN" Düzeltmesi (YENİ · 15 Tem 2026)

### Sorun 1: Footer görünmüyor
`App.tsx` (~satır 1577): "MADE BY EFECAN" yazısı `absolute bottom-8` ile sayfaya sabitlenmiş. Lobi kartı uzayınca (Topluluk Odaları listesi doluyken) kartın **arkasında/altında kalıyor**.

**Çözüm (önerilen):** `absolute` konumlamayı bırak, yazıyı normal akışta kartın **altına** taşı:
```tsx
// Kart kapsayıcısı: min-h-screen flex flex-col items-center
<LobiKarti />
<footer className="py-6 text-center">
  <span className="...">MADE BY EFECAN</span>
</footer>
```
Sayfa gerekirse kayar, yazı her zaman kartın altında ve görünür. Sosyal medya ikonları (`fixed bottom-5 right-5`) olduğu gibi kalabilir.

### Sorun 2: Lobi kullanışlılığı
Mevcut kart işlevsel ama bilgi vermiyor. İyileştirmeler:

1. **Oda kartları zenginleşsin**: üye sayısı + çevrimiçi sayısı + son aktivite:
   ```
   ┌──────────────────────────────────────────┐
   │ #  Deneme                     🟢 3 · 👥 12│
   │    TEST ODASI                            │
   │    Kurucu: Efecan_ · 5 dk önce aktif  🗑 ›│
   └──────────────────────────────────────────┘
   ```
   Veri: `GET /api/rooms` yanıtına `memberCount`, `onlineCount` eklenir (rol sistemi `room_members` tablosunu getirince ucuz bir JOIN).
2. **Kod ile hızlı katıl**: arama kutusuna 6 haneli kod yapıştırılınca otomatik algıla → doğrudan "Katıl?" onayı göster (arama sonucu beklemeden).
3. **Boş durum tasarımı**: Topluluk sekmesi boşsa ortada illüstrasyon + "İlk odayı sen kur" CTA (şu an boş liste sessiz kalıyor).
4. **Yüklenme iskeleti**: odalar fetch edilirken 2-3 shimmer kart (ani zıplama olmasın).
5. **Sıralama**: en çok çevrimiçi olan üstte; kendi kurduğun odalar "★ Odalarım" başlığıyla en üstte.
6. **"Yeni oda" butonu görünür olsun**: alttaki metin linki yerine sekme satırının yanına `+` butonu (metin linki kalabilir ama birincil giriş `+`).

---

## 8) Kanal Sistemi — Oda = Sunucu, Metin + Ses Kanalları (YENİ · 15 Tem 2026)

### Hedef
Discord sunucu modeli: oda açarken **yazı/ses seçimi kaldırılır**. Her yeni oda otomatik olarak **1 metin kanalı (#genel)** ve **1 ses kanalı (🔊 Sesli Sohbet)** ile doğar. Yetkisi olanlar (Kurucu/Moderatör — Özellik 6'ya bağımlı) sonradan kanal ekleyip silebilir.

### Mimari Not (kritik)
Şu an mesajlar ve SignalR grupları **oda adı** (string) ile anahtarlanıyor (`messages.room_id = room.Name`). Kanal sistemiyle anahtar `channel:{channelId}` olmalı — bu, geriye dönük veri taşıma gerektirir.

### Veritabanı
```sql
CREATE TABLE channels (
    id serial PRIMARY KEY,
    room_id int NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    name text NOT NULL,
    type text NOT NULL DEFAULT 'text',   -- 'text' | 'voice'
    position int NOT NULL DEFAULT 0,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (room_id, name)
);
ALTER TABLE messages ADD COLUMN channel_id int REFERENCES channels(id) ON DELETE CASCADE;
```
**Veri taşıma:** her mevcut oda için `#genel` + `Sesli Sohbet` kanalları oluştur; odanın eski mesajlarını (`room_id = oda adı`) o odanın `#genel` kanalına bağla. Ana odalar (Ana Salon, Müzik Odası) da birer kanal setine kavuşur.

### Backend Adımları
1. `Channel.cs` modeli + EF migration + `AppDbContext`.
2. `CreateRoom` güncellenir: `Type` parametresi kalkar; oda + 2 varsayılan kanal tek transaction'da oluşturulur.
3. Yeni endpoint'ler (`ChannelsController` veya RoomsController altında):
   - `GET    /api/rooms/{roomId}/channels`
   - `POST   /api/rooms/{roomId}/channels` — sadece owner/mod (RoomAuthorizationService)
   - `PUT    /api/channels/{id}` — yeniden adlandır / sırala
   - `DELETE /api/channels/{id}` — owner/mod; **son metin kanalı silinemez**
4. Hub değişiklikleri:
   - `JoinRoom(roomId)` → `JoinChannel(channelId)`; grup adı `channel:{id}`. Oda düzeyinde ikinci bir grup (`room:{id}`) tutulur — üye giriş/çıkış ve kanal listesi güncellemeleri için.
   - `SendMessage` artık `channelId` alır; geçmiş sorgusu kanala göre.
   - Yeni event'ler: `ChannelCreated`, `ChannelDeleted`, `ChannelRenamed` (oda grubuna yayınlanır).
   - Ses: mevcut WebRTC sinyalleşmesi zaten `roomId` string grubuyla çalışıyor → sadece anahtar `channel:{id}` olur, mantık değişmez.
5. `MessageCleanupService` ve `DeleteRoom`'daki mesaj temizliği `channel_id` üzerinden güncellenir.

### Frontend — Oda İçi Yerleşim (Discord benzeri)
`ChatRoom.tsx` üç sütuna ayrılır (bu, mevcut 1349 satırlık dosyayı bölmek için de fırsat):
```
┌──────────┬──────────────────────────────┬──────────────┐
│ KANALLAR │  # genel                     │ KATILANLAR   │
│          │                              │              │
│ METİN    │  mesajlar...                 │ ÇEVRİMİÇİ—3  │
│ # genel  │                              │ 🟢 Efecan_   │
│ # duyuru │                              │ 🟢 Ali       │
│  [+]     │                              │ 🌙 Ayşe      │
│ SES      │                              │              │
│ 🔊 Sohbet│                              │ ÇEVRİMDIŞI—2 │
│  └ 🎧 Ali│  [✏ mesaj yaz...       📎 ➤] │ ⚫ Mehmet    │
└──────────┴──────────────────────────────┴──────────────┘
```
- Sol sütun: kanal listesi; ses kanalının altında **o an içinde olanlar** görünür (Discord'daki gibi). `+` sadece yetkililerde.
- Metin kanalı değiştirmek: `LeaveChannel` + `JoinChannel` (WebRTC'ye dokunmaz → **ses kanalındayken metin kanalları arasında gezilebilir**, Discord'un en sevilen davranışı).
- Mobil: sol sütun hamburger ile açılır çekmece.

### Uygulama Stratejisi
Bu özellik **2 güne bölünmeli**:
- **Gün A (backend):** DB + migration + veri taşıma + Hub + endpoint'ler; eski frontend tek kanalla çalışmaya devam eder (uyumluluk: `JoinRoom` → odanın `#genel` kanalına yönlendirir).
- **Gün B (frontend):** üç sütunlu UI + kanal gezinme + ses kanalı entegrasyonu.

---

## 9) Üye Listesi — "Odaya Katılanlar": Çevrimiçi / Çevrimdışı (YENİ · 15 Tem 2026)

### Mevcut Durum
"Odada Olanlar" sadece **o an bağlı** olanları (SignalR bellek listesi) gösteriyor. Odadan çıkan listeden siliniyor; kalıcı üyelik kavramı yok.

### Hedef
Başlık "**Odaya Katılanlar**" olsun; odaya bir kez katılan herkes listede kalsın, iki grup halinde:
- **ÇEVRİMİÇİ — n**: yeşil nokta; durum mesajı varsa altında; "boşta/rahatsız etmeyin" durumları da renkleriyle (🟢🌙⛔).
- **ÇEVRİMDIŞI — n**: soluk avatar + gri nokta; `showLastSeen` açıksa "son görülme: 2 sa önce".

### Bağımlılık
`room_members` tablosu (Özellik 6 — Rol sistemi) şart: kalıcı üyelik oradan gelir. Rol rozetleriyle birleşir: 👑 kurucu en üstte, sonra 🛡️ modlar, sonra üyeler (her grup kendi içinde çevrimiçi→çevrimdışı sıralı).

### Uygulama Adımları
1. **Backend**: `GET /api/rooms/{id}/members` yanıtı: `{userId, username, avatarId, role, customStatus, customStatusMessage, lastSeen(privacy'e tabi)}`. Hub'daki bellek listesi (`_roomUsers`) yalnızca "o an bağlı" bilgisini verir → yanıtta `isConnected` alanıyla birleştirilir.
2. **Canlı güncelleme**: `UserStatusChanged` event'i **zaten global yayınlanıyor** — frontend listedeki kullanıcıyı gruplar arasında taşır (animasyonlu, aşağıya bak). Odaya ilk kez katılan biri olursa `MemberJoined` event'i yayınlanır.
3. **Frontend**: `components/MemberList.tsx` (ChatRoom'dan ayrı bileşen — Özellik 8'deki sağ sütun). Grup başlıkları daraltılabilir (`▸ ÇEVRİMDIŞI — 12`).

### Animasyon (Framer Motion `layout` — az kodla çok etki)
- Liste elemanlarına `layout` prop'u: kullanıcı çevrimiçi olunca **çevrimdışı grubundan yukarı süzülerek** çevrimiçi grubuna taşınır (`AnimatePresence` + `layout` — kendiliğinden akıcı).
- Durum noktası değişince küçük "pop" (`scale: [1, 1.4, 1]`).
- Yeni katılan üye satırı soldan kayarak girer + 1 sn hafif mor parlama.

---

## 10) Ek Öneriler (istenirse)

### Genel animasyon dokunuşları (15 Tem eki)
- **Lobi kartları**: hover'da hafif yükselme (`y: -3` + gölge artışı); listeye girişte `staggerChildren: 0.05` ile sırayla belirme.
- **Kanal geçişi** (Özellik 8 sonrası): mesaj alanı `opacity+y` ile 150ms çapraz geçiş — sayfa yenilenmiş hissi vermez.
- **Sayı animasyonları**: "2 online" gibi sayaçlar değişince yumuşak sayma (`animate` ile count-up).
- **Ses kanalına katılma**: kanal satırından avatarın "içeri süzülmesi" (`layoutId` ile avatar kanal satırına uçar).
- Hepsi `settings.reducedMotion`'a saygılı olmalı (mevcut ayar).

### Ekstra fikirler (15 Tem eki)
- **Davet linki**: oda kartında "🔗 Davet" → `sandalyecimetin.vercel.app/join/ABC123` panoya kopyalanır; link açılınca otomatik katılma onayı.
- **Oda simgesi**: oda kurarken emoji/renk seçimi (kartlar tektip # ikonundan kurtulur, DB'ye `icon text` kolonu yeter).
- **Son odaya devam**: girişte "Kaldığın yerden: Deneme ›" kısayolu (localStorage).
- **Taslak hatırlama**: kanal değiştirince yazılmakta olan mesaj kaybolmasın (kanal başına draft state).

### Hızlı kazanımlar (düşük efor)
- **Yazıyor... göstergesi odalarda**: DM'de var (`UserTyping`), oda tarafına da eklensin ("Ali yazıyor…").
- **Emoji tepkileri**: mesaja hover → 👍❤️😂 hızlı tepki; DB'de `message_reactions` tablosu, Hub'da `ToggleReaction`.
- **Bağlantı önizlemesi**: mesajdaki URL'ler tıklanabilir olsun; YouTube/görsel linkleri inline gömülsün.
- **Bildirim rozetleri sekme başlığında**: `document.title = "(3) SandalyeciMetin"`.
- **Mesaj arama**: oda içinde `Ctrl+F` benzeri arama çubuğu (mevcut `Search` ikonu zaten import edilmiş).

### Orta vadeli
- **Sesli odada konuşan göstergesi**: WebRTC `AudioContext` + `AnalyserNode` ile konuşana yeşil halka.
- **Okundu bilgisi oda mesajlarında** ve mesajlara **sabitlenme (pin)** özelliği.
- **Tema seçimi**: Ayarlar → Görünüm'e açık/koyu/AMOLED + vurgu rengi (mor sabitken seçilebilir olsun).
- **Oda kategorileri/favoriler**: odaları yıldızlayıp üstte tutma.

### Teknik borç (bu planla birlikte ele alınmalı)
- `handleUpdatePrivacy` yanlış endpoint'e gidiyor (`/status` → `/privacy` olmalı) — **1 satırlık kritik düzeltme**.
- JWT fallback secret koddan kaldırılmalı; hata yanıtlarındaki `stack`/`inner` alanları üretimde kapatılmalı.
- `App.tsx` (1204 satır) bu geliştirmelerle daha da büyüyecek → `pages/Lobby.tsx`, `pages/AuthPage.tsx` olarak bölünmesi tam sırası.

---

## 11) Bildirim Sistemi — Masaüstü / Push + Oda Susturma (YENİ · 14 Tem 2026)

### Mevcut Durum
Bildirim yalnızca **ses** düzeyinde var (`hooks/useAudioNotifications.ts`, `utils/sound.ts`). Sekme başlığı rozeti yok, işletim sistemi bildirimi yok, oda/DM bazlı susturma yok. Sekme arka plandayken kullanıcı yeni mesajdan haberdar olmuyor.

### Hedef Davranış
- **Masaüstü bildirimi** (Web Notifications API): sekme odakta değilken DM ve @bahsetme geldiğinde OS bildirimi çıksın (avatar + isim + önizleme).
- **Sekme başlığı rozeti**: `document.title = "(3) SandalyeciMetin"` + favicon nokta (Özellik 10'daki "hızlı kazanım" burada gerçeklenir).
- **Susturma (mute)**: her oda/kanal ve her DM için `Susturuldu` seçeneği; susturulmuşta ses/masaüstü bildirimi yok, sadece sessiz rozet.
- **Bildirim seviyesi** (oda başına): `Tümü` / `Sadece @bahsetmeler` / `Hiçbiri` (Discord modeli).

### Veritabanı
```sql
CREATE TABLE notification_prefs (
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope_type text NOT NULL,          -- 'room' | 'channel' | 'dm'
    scope_id text NOT NULL,            -- oda/kanal id ya da karşı kullanıcı id
    level text NOT NULL DEFAULT 'all', -- 'all' | 'mentions' | 'none'
    muted_until timestamptz,           -- null = süresiz açık; geçici susturma için
    PRIMARY KEY (user_id, scope_type, scope_id)
);
```

### Uygulama Adımları
1. **İzin akışı**: ilk DM/oda açılışında değil, kullanıcı Ayarlar → Bildirimler'de "Masaüstü bildirimlerine izin ver" düğmesine basınca `Notification.requestPermission()` çağrılır (izin istemini kullanıcı jestine bağlamak tarayıcı gereği).
2. `SettingsContext`'e ekle: `desktopNotifications: boolean`, `notifyLevel: 'all' | 'mentions' | 'none'` (global varsayılan).
3. Yeni hook `hooks/useDesktopNotifications.ts`: `document.visibilityState === 'hidden'` iken gelen mesajda `new Notification(...)`; tıklanınca `window.focus()` + ilgili sohbete git.
4. **Backend**: mesaj yayınında `notification_prefs` sorgulanmaz (istemci-taraflı filtre yeterli, ucuz). Sunucu yalnızca prefs CRUD endpoint'i sunar: `GET/PUT /api/users/me/notification-prefs`.
5. Sekme başlığı rozeti: global okunmamış sayaç (`unreadCounts` zaten `App.tsx`'te) → `useEffect` ile `document.title` güncellenir; sekme odakta iken sıfırlanır.
6. Susturma UI: DM listesi ve oda kartında sağ-tık/uzun-bas menüsü → "🔕 Sustur (1s / 8s / süresiz)".

### Kısıt
Gerçek **push** (sekme tamamen kapalıyken) Service Worker + Web Push (VAPID) gerektirir → Özellik 16 (PWA) ile birlikte yapılmalı. Bu bölümün 1–6. adımları yalnızca **sekme açıkken** çalışan masaüstü bildirimidir; tam push PWA'ya bağımlıdır.

---

## 12) Yanıtlama + @Bahsetme + Vurgulu Bildirim (YENİ · 14 Tem 2026)

### Mevcut Durum (önemli tespit)
`ChatMessage.cs`'te **`ReplyToId` kolonu zaten var** (migration `20260711153350_AddReplyToChatMessage`) ama frontend'de yanıtlama arayüzü yok ve Hub `SendMessage` bu alanı taşımıyor olabilir. @bahsetme (mention) sistemi hiç yok.

### Hedef Davranış
- **Yanıtla**: mesaj hover menüsünde "↩ Yanıtla" → mesaj kutusunun üstünde alıntı şeridi ("Ali'ye yanıt: …") → gönderilince balonun üstünde tıklanabilir alıntı; tıklayınca orijinal mesaja kaydır + kısa vurgu.
- **@bahsetme**: mesaj yazarken `@` yazınca odadaki üyelerden **otomatik tamamlama** açılır; seçilen kişi `@kullanıcı` olarak eklenir. Bahsedilen kişide vurgulu balon (sol kenarda mor şerit) + bildirim (Özellik 11 ile).
- **@herkes / @here**: yalnızca yetkili roller (Özellik 6) kullanabilir.

### Veritabanı
```sql
-- ChatMessage.ReplyToId zaten var. Bahsetmeler için:
CREATE TABLE message_mentions (
    message_id bigint NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    mentioned_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (message_id, mentioned_user_id)
);
```
> Not: Metin içinde `@kullanıcı` ham metin olarak da saklanır; `message_mentions` tablosu "bana bahsedilenler" sorgusunu ve bildirim tetiğini ucuzlatır.

### Uygulama Adımları
1. **Hub `SendMessage`**: imzaya `long? replyToId` ve `string[] mentionedUserIds` ekle; kaydederken `message_mentions` doldur; yayında bu alanları da gönder.
2. **Frontend — yanıtlama**: `TextChatRoom.tsx`'te mesaj state'ine `replyingTo` ekle; alıntı şeridi + `Escape` ile iptal. Balonun içinde `ReplyToId` varsa orijinal mesajın kısaltılmış önizlemesini çöz (mevcut mesaj listesinden `find`).
3. **Frontend — @autocomplete**: `useMentionAutocomplete` hook'u — caret'ten geriye `@…` yakalar, üye listesinden filtreler, `Tab`/`Enter` ile ekler. Metni parse ederken `@kullanıcı` → `<span class="mention">` render.
4. **Bahsedilende bildirim**: gelen mesajda `mentionedUserIds.includes(myUserId)` → ses + masaüstü bildirimi (susturma `level='mentions'` iken bile geçer).
5. **7 günlük silme etkisi**: yanıtlanan orijinal mesaj silinmişse (`MessageCleanupService` 7 günde temizliyor) alıntı "silinmiş mesaj" olarak gösterilir — `ReplyToId` FK `ON DELETE` davranışı kontrol edilmeli (SET NULL önerilir, CASCADE değil).

### Örnek Tasarım
```
┌─ Ali'ye yanıt veriyorsun ──────────── ✕ │
│ "toplantı saat kaçta?"                   │
├──────────────────────────────────────────┤
│ [✏ @efe  15:00'te ...          📎 ➤]     │
└──────────────────────────────────────────┘
   @ yazınca:  ┌───────────────┐
               │ 🦊 Efecan_    │
               │ 🐼 Ayşe       │
               └───────────────┘
```

---

## 13) Anti-Spam, Rate Limiting & Raporlama/Moderasyon (YENİ · 14 Tem 2026)

### Mevcut Durum
Mesaj gönderiminde **hız sınırı yok**; bir kullanıcı saniyede yüzlerce mesaj/dosya gönderebilir (SignalR üzerinden DoS + spam riski). Rapor etme, otomatik moderasyon ve kötüye kullanım kaydı yok. Dosya yükleme limitli (10MB) ama sıklık sınırsız.

### Hedef Davranış
- **Rate limit**: kullanıcı başına mesaj/dosya gönderimi sunucuda sınırlanır (ör. 5 mesaj / 5 sn burst, sonra yavaşlatma). Aşınca "Çok hızlı gönderiyorsun" uyarısı.
- **Raporlama**: mesaj/kullanıcı hover menüsünde "🚩 Şikayet Et" → sebep seçimi → `reports` tablosuna kayıt (Özellik 6 moderatörleri görür).
- **Otomatik filtre** (hafif): davetiye/link seli, tekrar eden aynı mesaj, aşırı büyük harf/mention seli için eşik.

### Veritabanı
```sql
CREATE TABLE reports (
    id serial PRIMARY KEY,
    reporter_id text NOT NULL REFERENCES users(id),
    target_type text NOT NULL,        -- 'message' | 'user'
    target_id text NOT NULL,
    room_id int REFERENCES rooms(id) ON DELETE SET NULL,
    reason text NOT NULL,
    status text NOT NULL DEFAULT 'open', -- 'open' | 'reviewed' | 'dismissed'
    created_at timestamptz NOT NULL DEFAULT now()
);
```

### Uygulama Adımları
1. **Rate limit (sunucu)**: Hub'da kullanıcı başına in-memory sliding-window sayaç (`ConcurrentDictionary<userId, Queue<timestamp>>`). Eşik aşılırsa `SendMessage` sessizce reddedilir + `Clients.Caller.SendAsync("RateLimited", retryAfterMs)`. Ölçeklenince Redis'e taşınır (şimdilik tek instance yeterli).
2. **HTTP rate limit**: `UploadController` ve auth endpoint'lerine ASP.NET `RateLimiter` middleware (`AddRateLimiter`, fixed window). Login/register brute-force koruması için kritik.
3. **Raporlama endpoint'i**: `POST /api/reports`; moderatör paneli `GET /api/rooms/{id}/reports` (Özellik 6 yetkisi).
4. **Frontend**: rapor modali (sebep radio + açıklama); `RateLimited` event'inde gönder butonu kısa süre kilitlenir + geri sayım.
5. **Teknik borç bağlantısı** (Özellik 10): JWT fallback secret kaldırma ve üretimde `stack`/`inner` gizleme bu güvenlik fazıyla birlikte yapılmalı.

---

## 14) Arkadaşlık & Engelleme Sistemi (YENİ · 14 Tem 2026)

### Mevcut Durum
DM herkese açık — herhangi biri herhangi birine mesaj atabilir. Arkadaş listesi, arkadaşlık isteği ve **engelleme** kavramı yok. Bu, hem güvenlik (istenmeyen DM) hem UX (kimlerle konuştuğunu görme) eksiği.

### Hedef Davranış
- **Arkadaşlık isteği** gönder/kabul/reddet; arkadaşlar DM listesinde "Arkadaşlar" başlığı altında online öncelikli.
- **Engelleme**: engellenen kişi sana DM atamaz, mesajların birbirinize görünmez, odada mesajları "engellenen kullanıcı" olarak katlanır.
- **Gizlilik ayarı**: "DM'leri kimler açabilir? Herkes / Sadece arkadaşlar".

### Veritabanı
```sql
CREATE TABLE friendships (
    requester_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    addressee_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'pending', -- 'pending' | 'accepted'
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (requester_id, addressee_id)
);
CREATE TABLE blocks (
    blocker_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker_id, blocked_id)
);
```

### Uygulama Adımları
1. **Endpoint'ler** (`UsersController` veya yeni `FriendsController`): istek gönder/kabul/ret/kaldır; engelle/kaldır; `GET /api/users/me/friends`, `GET /api/users/me/blocks`.
2. **DM koruması**: `SendDirectMessage` (Hub) — gönderen engellenmişse **veya** alıcının "sadece arkadaşlar" ayarı varsa ve arkadaş değillerse reddet.
3. **UserPopoverCard** (mevcut bileşen): "👤 Arkadaş Ekle" / "🚫 Engelle" aksiyonları eklenir; durum arkadaşsa "✓ Arkadaş".
4. **Frontend liste**: DM listesi başlıklara ayrılır (Arkadaşlar / Diğer). Bekleyen istekler için rozet.
5. `User`'a gizlilik alanı: `dm_privacy text DEFAULT 'everyone'` (`'everyone' | 'friends'`).

---

## 15) Performans — Mesaj Sayfalama + Sanal Liste (YENİ · 14 Tem 2026)

### Mevcut Durum (ölçek riski)
Oda/DM açılışında mesaj geçmişinin **tamamı** çekiliyor ve DOM'a basılıyor gibi görünüyor. `MessageCleanupService` 7 günde bir temizlese de yoğun bir odada 7 günde on binlerce mesaj birikebilir → ilk yükleme yavaş + kaydırma takılır. Sonsuz-yukarı-kaydır (infinite scroll) yok.

### Hedef Davranış
- İlk açılışta yalnızca **son 50 mesaj** gelir; yukarı kaydırınca 50'şer sayfa daha yüklenir (cursor tabanlı).
- Uzun listelerde **sanallaştırma** (yalnızca görünür mesajlar DOM'da).

### Uygulama Adımları
1. **Backend cursor pagination**: `GetMessages(channelId, beforeId?, limit=50)` → `Id < beforeId` ile azalan sıralı 50 kayıt. Mevcut "hepsini getir" sorgusu bununla değiştirilir. Ana odalar dahil.
2. **Frontend infinite scroll**: `TextChatRoom.tsx`'te üstteki sentinel `IntersectionObserver` ile görününce eski sayfayı yükle; kaydırma pozisyonu korunur (yeni içerik eklenince zıplama olmasın — `scrollHeight` farkı telafi edilir).
3. **Sanallaştırma**: liste > ~200 mesaj olduğunda `@tanstack/react-virtual` ile pencereleme (değişken yükseklikli satırlar için `measureElement`).
4. **DB index**: `messages (room_id, id DESC)` (veya kanal sistemi sonrası `channel_id, id DESC`) — sayfalama sorgusu için şart.
5. **Alternatif politika**: 7 günlük sert silme yerine "oda başına son N mesajı koru" düşünülebilir; ancak bu, pin/medya kalıcılığı kararlarıyla birlikte ele alınmalı (Özellik 10 "pin" ve Özellik 2 depolama ile bağlantılı).

---

## 16) PWA + Mobil Deneyim + Erişilebilirlik (YENİ · 14 Tem 2026)

### Hedef
Uygulama telefona "yüklenebilir" olsun (ana ekrana ekle), çevrimdışı kabuk açılsın, gerçek push bildirimi (Özellik 11 tamamlayıcısı) mümkün olsun; klavye/okuyucu erişilebilirliği iyileşsin.

### Uygulama Adımları
1. **PWA**: `vite-plugin-pwa` ekle (`vite.config.ts`); `manifest.json` (ad, ikonlar, tema rengi mor, `display: standalone`); Service Worker ile uygulama kabuğu ve statik varlıklar cache'lenir.
2. **Web Push**: VAPID anahtar çifti; SW `push` event'i → `showNotification`. Backend'e `push_subscriptions` tablosu + gönderim servisi (kritik DM/mention'da). Bu, Özellik 11'in "tam push" kısmını kapatır.
3. **Mobil UI cilası**: oda üç sütununda (Özellik 8) sol/sağ paneller çekmece; dokunma hedefleri ≥44px; `safe-area-inset` (iPhone çentik) için padding; sanal klavye açılınca mesaj kutusunun görünür kalması.
4. **Erişilebilirlik (a11y)**:
   - Tüm ikon-butonlara `aria-label` (📎, ⚙, avatar vb.).
   - Modallarda odak tuzağı (focus trap) + `Escape` ile kapatma + açılınca odak, kapanınca tetikleyene geri dönüş.
   - Mesaj listesi `role="log" aria-live="polite"` (okuyucu yeni mesajı duyurur).
   - Renk kontrastı WCAG AA; durum yalnızca renkle değil ikonla da anlatılsın (🟢/🌙/⛔).
   - `settings.reducedMotion` zaten var → tüm yeni animasyonlar buna saygılı.

---

## 17) Ekran Paylaşımı & Görüntülü Görüşme (YENİ · 14 Tem 2026)

### Mevcut Durum
`useWebRTC.ts` yalnızca **ses** akışı taşıyor (mesh P2P). Görüntü ve ekran paylaşımı yok.

### Hedef Davranış
- Ses kanalında (Özellik 8) "🖥 Ekran Paylaş" ve "📹 Kamera" düğmeleri; katılımcı akışları grid halinde.

### Uygulama Adımları
1. **Ekran paylaşımı**: `navigator.mediaDevices.getDisplayMedia()` → yeni video track'i mevcut `RTCPeerConnection`'lara `addTrack` (renegotiation gerekir → `onnegotiationneeded` akışı kurulmalı). Sinyalleşme zaten Hub'da var, mantık genişletilir.
2. **Kamera**: `getUserMedia({ video })` benzer akış; kullanıcı başına en fazla 1 kamera + 1 ekran track'i.
3. **Ölçek uyarısı (kritik)**: mesh topolojisi ~4 kişiden sonra video için bant genişliğini boğar (n² bağlantı). 5+ kişilik görüntülü için **SFU** (ör. LiveKit/mediasoup) gerekir → bu ayrı ve büyük bir altyapı işidir; ilk sürüm 2–4 kişilik küçük görüşmelerle sınırlansın.
4. **UI**: video grid (`TextChatRoom`/ses paneli), konuşana vurgu halkası (Özellik 10 "konuşan göstergesi" ile paylaşılan `AnalyserNode` mantığı), tam ekran + ekranı sabitleme (pin).

> Öncelik düşük tutuldu: yüksek efor + SFU maliyeti. Ses (mevcut) + ekran paylaşımı (küçük grup) makul bir ilk hedef; çok kişili görüntülü v2.

---

## 18) Test, CI/CD & Hata İzleme (YENİ · 14 Tem 2026)

### Mevcut Durum
Görünürde otomatik test, CI hattı ve üretim hata izleme yok. Bu plandaki büyük dönüşümler (özellikle kanal sistemi veri taşıması) test güvencesi olmadan riskli.

### Uygulama Adımları
1. **Frontend testleri**: Vitest + React Testing Library — kritik akışlar (mesaj gönderme, DM açma, keybind/PTT, mention parse). Test edilebilirlik için `App.tsx`'in sayfalara bölünmesi (Özellik 10 teknik borç) ön koşul niteliğinde.
2. **Backend testleri**: xUnit — `RoomAuthorizationService` hiyerarşi kuralları (Özellik 6), rate limit mantığı (Özellik 13), pagination sorgusu (Özellik 15). Hub testleri için in-memory bağlam.
3. **CI (GitHub Actions)**: PR'da `dotnet build/test` + `npm run build/test/lint`; migration'ların derlendiğini doğrula. Yeşil olmadan merge yok.
4. **Hata izleme**: Sentry (frontend + .NET) — üretimde JS hataları ve sunucu exception'ları merkezi görülür. Özellik 10'daki "üretimde `stack`/`inner` gizle" ile uyumlu (kullanıcıya değil, Sentry'ye gitsin).
5. **Deploy sağlığı**: basit `/health` endpoint'i + Render/Vercel ortam değişkeni kontrolü; deploy sonrası smoke test.

---

## 19) Onboarding + Hesap & Veri Yönetimi (KVKK) (YENİ · 14 Tem 2026)

### Hedef
İlk kullanımda kullanıcıyı yönlendir; kullanıcıya kendi verisi üzerinde kontrol ver (yasal + güven).

### Uygulama Adımları
1. **Onboarding**: kayıttan sonra 3 adımlı kısa tur (avatar seç → ilk odaya katıl/oluştur → profil durumu ayarla). `localStorage` ile bir kez gösterilir. Boş lobi için CTA (Özellik 7 ile örtüşür).
2. **Hesap yönetimi** (Ayarlar → Hesap):
   - Şifre değiştir (mevcut şifre doğrulamalı).
   - E-posta değiştir (doğrulama e-postası — `EmailService` zaten var).
   - **Hesabı sil**: onay + şifre → kullanıcı ve ilişkili veriler (`ON DELETE CASCADE` zincirleri) temizlenir. *Silme kalıcı ve geri alınamaz olduğundan çift onay ve net uyarı şart.*
3. **Veri dışa aktarma** (KVKK/GDPR): `GET /api/users/me/export` → kullanıcının profili + mesajları JSON olarak indirilir.
4. **Gizlilik düzeltmesi bağlantısı**: Özellik 10'daki `handleUpdatePrivacy` yanlış endpoint hatası (`/status` → `/privacy`) bu hesap/gizlilik çalışmasıyla birlikte kapatılır.

---

## Önerilen Uygulama Sırası (güncellendi: 15 Tem 2026 — kanal sistemi eklendi)

1. **Faz 1 (temel):** Teknik borç düzeltmeleri → Özellik 7 (lobi + footer, hızlı iş) → Özellik 2 (Supabase Storage ile dosya) → Özellik 1 (mini dock + DM overlay)
2. **Faz 2 (yönetim altyapısı):** Özellik 3 (profil popover → DM) → **Özellik 6 (Rol sistemi)** ← hem popover'daki yönetim menüsü hem kanal yetkileri buna bağlı
3. **Faz 3 (büyük dönüşüm):** **Özellik 8 (Kanal sistemi)** — 2 güne bölünmüş (Gün A: backend+migration, Gün B: üç sütunlu UI) → Özellik 9 (Odaya Katılanlar listesi, kanal UI'ının sağ sütunu olarak birlikte çıkar)
4. **Faz 4 (his/cila):** Özellik 5 REVİZE (spring slayt) → Özellik 4 (PTT + tuş atama) → animasyon dokunuşları + ek öneriler
5. **Faz 5 (etkileşim & güven — YENİ):** Özellik 12 (yanıt + @bahsetme) → Özellik 11 (bildirimler) → Özellik 13 (anti-spam/rapor) → Özellik 14 (arkadaşlık/engelleme). *Not: 12 ve 13, moderasyon için Özellik 6'ya (rol) yaslanır.*
6. **Faz 6 (ölçek & platform — YENİ):** Özellik 15 (sayfalama/sanal liste — büyümeden önce yapılmalı) → Özellik 16 (PWA + push, Özellik 11'i tamamlar) → Özellik 18 (test/CI/hata izleme, sürekli). Özellik 17 (görüntülü/ekran) ve 19 (onboarding/KVKK) seçmeli, hazır olunca.

Bağımlılık zinciri (kritik):
```
Rol sistemi (6) ──► Kanal yetkileri (8) ──► Katılanlar listesi (9)
      │                                          ▲
      └── room_members tablosu ──────────────────┘
```
Notlar:
- **Özellik 6 → 8 → 9 sırası zorunlu**: kanal ekleme yetkisi ve kalıcı üyelik, rol sisteminin `room_members` tablosuna dayanır.
- Kanal sistemi (8) projenin en büyük işi (~2 gün); veri taşıma içerdiği için öncesinde DB yedeği alınmalı.
- Özellik 5 revizesi ve 7 hızlı işler (~1-2 saat) — büyük işlerin arasına "nefes" olarak serpiştirilebilir.
- Her faz bağımsız deploy edilebilir; Özellik 3, Özellik 1'deki DM overlay'ini yeniden kullandığı için bu sıra önemli.
