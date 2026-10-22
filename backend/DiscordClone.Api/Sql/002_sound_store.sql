-- ============================================================
-- Ses Mağazası
-- Backend açılışta bu SQL'i kendisi çalıştırır (Program.cs, 10b);
-- elle çalıştırmak gerekmez. Supabase SQL editöründe elle de
-- çalıştırılabilir. Betik idempotenttir.
-- ============================================================

-- user_sounds artık ortak ses kütüphanesi: her satır bir kullanıcının yüklediği ses.
ALTER TABLE user_sounds ADD COLUMN IF NOT EXISTS is_public  boolean NOT NULL DEFAULT true;  -- mağazada görünsün mü
ALTER TABLE user_sounds ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false; -- yükleyen sildi, ekleyenlerde kalıyor

CREATE INDEX IF NOT EXISTS "IX_user_sounds_store" ON user_sounds (created_at DESC) WHERE is_public AND NOT is_deleted;

-- Kişisel soundboard: kullanıcının mağazadan eklediği başkalarının sesleri.
CREATE TABLE IF NOT EXISTS soundboard_saves (
    user_id    text   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sound_id   bigint NOT NULL REFERENCES user_sounds(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "PK_soundboard_saves" PRIMARY KEY (user_id, sound_id)
);

CREATE INDEX IF NOT EXISTS "IX_soundboard_saves_sound_id" ON soundboard_saves (sound_id);

-- Çalma sayısı ("En çok çalınanlar"). Hub'daki PlaySound URL ile artırır.
ALTER TABLE user_sounds ADD COLUMN IF NOT EXISTS play_count bigint NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "IX_user_sounds_url" ON user_sounds (url);

-- Favoriler: kullanıcının soundboard'unda en başta duran sesler.
CREATE TABLE IF NOT EXISTS sound_favorites (
    user_id    text   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sound_id   bigint NOT NULL REFERENCES user_sounds(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "PK_sound_favorites" PRIMARY KEY (user_id, sound_id)
);
