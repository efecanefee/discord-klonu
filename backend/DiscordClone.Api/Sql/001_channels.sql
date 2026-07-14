-- ============================================================
-- Kanal Sistemi — Faz 1
-- Supabase SQL editöründe, KOD DEPLOY EDİLMEDEN ÖNCE çalıştır.
-- (Backend EnsureCreated kullandığı için bu tablo otomatik oluşmaz;
--  tablo yokken oda oluşturma 500 hatası verir.)
-- Betik idempotenttir — birden fazla kez çalıştırmak güvenlidir.
-- ============================================================

CREATE TABLE IF NOT EXISTS channels (
    id          serial PRIMARY KEY,
    room_id     int NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    name        text NOT NULL,
    type        text NOT NULL DEFAULT 'text',   -- 'text' | 'voice'
    position    int NOT NULL DEFAULT 0,
    message_key text NOT NULL,                   -- SignalR grubu / messages.room_id anahtarı
    created_by  text NOT NULL DEFAULT '',
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_channels_room_id ON channels(room_id);

-- Mevcut (kanal sistemi öncesi) odalar için varsayılan kanalları geri-doldur.
-- Metin kanalının anahtarı = oda adı → eski mesajlar bozulmadan #genel'e bağlı kalır.
INSERT INTO channels (room_id, name, type, position, message_key, created_by)
SELECT r.id, 'genel', 'text', 0, r.name, r.created_by
FROM rooms r
WHERE NOT EXISTS (
    SELECT 1 FROM channels c WHERE c.room_id = r.id AND c.type = 'text'
);

INSERT INTO channels (room_id, name, type, position, message_key, created_by)
SELECT r.id, 'Sesli Sohbet', 'voice', 1, 'voice:' || r.id::text, r.created_by
FROM rooms r
WHERE NOT EXISTS (
    SELECT 1 FROM channels c WHERE c.room_id = r.id AND c.type = 'voice'
);
