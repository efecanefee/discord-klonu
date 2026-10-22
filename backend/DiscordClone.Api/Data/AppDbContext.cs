using Microsoft.EntityFrameworkCore;
using DiscordClone.Api.Models;

namespace DiscordClone.Api.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

        public DbSet<ChatMessage> Messages { get; set; }
        public DbSet<User> Users { get; set; }
        public DbSet<Room> Rooms { get; set; }
        public DbSet<DirectMessage> DirectMessages { get; set; }
        public DbSet<RoomMember> RoomMembers { get; set; }
        public DbSet<RoomBan> RoomBans { get; set; }
        public DbSet<Channel> Channels { get; set; }
        public DbSet<UserSound> UserSounds { get; set; }
        public DbSet<SoundboardSave> SoundboardSaves { get; set; }
        public DbSet<SoundFavorite> SoundFavorites { get; set; }
        public DbSet<MessageReaction> MessageReactions { get; set; }
        public DbSet<PushSubscriptionEntry> PushSubscriptions { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            modelBuilder.Entity<ChatMessage>()
                .ToTable("messages");

            modelBuilder.Entity<ChatMessage>()
                .Property(m => m.Id).HasColumnName("id");
            modelBuilder.Entity<ChatMessage>()
                .Property(m => m.RoomId).HasColumnName("room_id");
            modelBuilder.Entity<ChatMessage>()
                .Property(m => m.Username).HasColumnName("username");
            modelBuilder.Entity<ChatMessage>()
                .Property(m => m.Text).HasColumnName("text");
            modelBuilder.Entity<ChatMessage>()
                .Property(m => m.Timestamp).HasColumnName("timestamp");
            modelBuilder.Entity<ChatMessage>()
                .Property(m => m.IsDeleted).HasColumnName("is_deleted");
            modelBuilder.Entity<ChatMessage>()
                .Property(m => m.UserId).HasColumnName("user_id");
            modelBuilder.Entity<ChatMessage>()
                .Property(m => m.IsEdited).HasColumnName("is_edited");
            modelBuilder.Entity<ChatMessage>()
                .Property(m => m.FileUrl).HasColumnName("file_url");
            modelBuilder.Entity<ChatMessage>()
                .Property(m => m.FileName).HasColumnName("file_name");
            modelBuilder.Entity<ChatMessage>()
                .Property(m => m.AvatarId).HasColumnName("avatar_id");
            modelBuilder.Entity<ChatMessage>()
                .Property(m => m.ReplyToId).HasColumnName("reply_to_id");
            modelBuilder.Entity<ChatMessage>()
                .Property(m => m.IsPinned).HasColumnName("is_pinned");
            modelBuilder.Entity<ChatMessage>()
                .Property(m => m.PinnedBy).HasColumnName("pinned_by");
            modelBuilder.Entity<ChatMessage>()
                .Property(m => m.PinnedAt).HasColumnName("pinned_at");

            modelBuilder.Entity<ChatMessage>()
                .HasOne(m => m.User)
                .WithMany(u => u.Messages)
                .HasForeignKey(m => m.UserId)
                .OnDelete(DeleteBehavior.SetNull);

            modelBuilder.Entity<User>()
                .ToTable("users");

            modelBuilder.Entity<User>()
                .Property(u => u.Id).HasColumnName("id");
            modelBuilder.Entity<User>()
                .Property(u => u.Username).HasColumnName("username");
            modelBuilder.Entity<User>()
                .Property(u => u.Email).HasColumnName("email");
            modelBuilder.Entity<User>()
                .Property(u => u.PasswordHash).HasColumnName("password_hash");
            modelBuilder.Entity<User>()
                .Property(u => u.CreatedAt).HasColumnName("created_at");
            modelBuilder.Entity<User>()
                .Property(u => u.FirstName).HasColumnName("first_name");
            modelBuilder.Entity<User>()
                .Property(u => u.LastName).HasColumnName("last_name");
            modelBuilder.Entity<User>()
                .Property(u => u.AvatarId).HasColumnName("avatar_id");
            modelBuilder.Entity<User>()
                .Property(u => u.IsVerified).HasColumnName("is_verified");
            modelBuilder.Entity<User>()
                .Property(u => u.VerificationToken).HasColumnName("verification_token");
            modelBuilder.Entity<User>()
                .Property(u => u.VerificationExpires).HasColumnName("verification_expires");
            modelBuilder.Entity<User>()
                .Property(u => u.ResetPasswordToken).HasColumnName("reset_password_token");
            modelBuilder.Entity<User>()
                .Property(u => u.ResetPasswordExpires).HasColumnName("reset_password_expires");
            modelBuilder.Entity<User>()
                .Property(u => u.LastSeen).HasColumnName("last_seen");
            modelBuilder.Entity<User>()
                .Property(u => u.CustomStatus).HasColumnName("custom_status");
            modelBuilder.Entity<User>()
                .Property(u => u.CustomStatusMessage).HasColumnName("custom_status_message");
            modelBuilder.Entity<User>()
                .Property(u => u.ShowLastSeen).HasColumnName("show_last_seen");
            modelBuilder.Entity<User>()
                .Property(u => u.BannerColor).HasColumnName("banner_color");
            modelBuilder.Entity<User>()
                .Property(u => u.AccentColor).HasColumnName("accent_color");
            modelBuilder.Entity<User>()
                .Property(u => u.Bio).HasColumnName("bio");

            modelBuilder.Entity<User>()
                .HasIndex(u => u.Email).IsUnique();
            modelBuilder.Entity<User>()
                .HasIndex(u => u.Username).IsUnique();

            modelBuilder.Entity<Room>()
                .ToTable("rooms");
            modelBuilder.Entity<Room>()
                .Property(r => r.Id).HasColumnName("id");
            modelBuilder.Entity<Room>()
                .Property(r => r.Name).HasColumnName("name");
            modelBuilder.Entity<Room>()
                .Property(r => r.Type).HasColumnName("type");
            modelBuilder.Entity<Room>()
                .Property(r => r.Description).HasColumnName("description");
            modelBuilder.Entity<Room>()
                .Property(r => r.CreatedBy).HasColumnName("created_by");
            modelBuilder.Entity<Room>()
                .Property(r => r.CreatedByUserId).HasColumnName("created_by_user_id");
            modelBuilder.Entity<Room>()
                .Property(r => r.CreatedAt).HasColumnName("created_at");
            modelBuilder.Entity<Room>()
                .Property(r => r.IsPrivate).HasColumnName("is_private").HasDefaultValue(false);
            modelBuilder.Entity<Room>()
                .Property(r => r.RoomCode).HasColumnName("room_code").HasMaxLength(8);
            modelBuilder.Entity<Room>()
                .HasIndex(r => r.Name).IsUnique();
            modelBuilder.Entity<Room>()
                .HasIndex(r => r.RoomCode).IsUnique();

            modelBuilder.Entity<DirectMessage>()
                .ToTable("direct_messages");
            modelBuilder.Entity<DirectMessage>()
                .Property(m => m.Id).HasColumnName("id");
            modelBuilder.Entity<DirectMessage>()
                .Property(m => m.SenderId).HasColumnName("sender_id");
            modelBuilder.Entity<DirectMessage>()
                .Property(m => m.ReceiverId).HasColumnName("receiver_id");
            modelBuilder.Entity<DirectMessage>()
                .Property(m => m.Content).HasColumnName("content");
            modelBuilder.Entity<DirectMessage>()
                .Property(m => m.CreatedAt).HasColumnName("created_at");
            modelBuilder.Entity<DirectMessage>()
                .Property(m => m.IsRead).HasColumnName("is_read");
            modelBuilder.Entity<DirectMessage>()
                .Property(m => m.IsEdited).HasColumnName("is_edited");
            modelBuilder.Entity<DirectMessage>()
                .Property(m => m.IsDeleted).HasColumnName("is_deleted");
            modelBuilder.Entity<DirectMessage>()
                .Property(m => m.ReplyToId).HasColumnName("reply_to_id");
            modelBuilder.Entity<DirectMessage>()
                .Property(m => m.FileUrl).HasColumnName("file_url");
            modelBuilder.Entity<DirectMessage>()
                .Property(m => m.FileName).HasColumnName("file_name");

            // Kanallar (oda = sunucu, metin + ses kanalları)
            modelBuilder.Entity<Channel>()
                .ToTable("channels");
            modelBuilder.Entity<Channel>()
                .Property(c => c.Id).HasColumnName("id");
            modelBuilder.Entity<Channel>()
                .Property(c => c.RoomId).HasColumnName("room_id");
            modelBuilder.Entity<Channel>()
                .Property(c => c.Name).HasColumnName("name");
            modelBuilder.Entity<Channel>()
                .Property(c => c.Type).HasColumnName("type");
            modelBuilder.Entity<Channel>()
                .Property(c => c.Position).HasColumnName("position");
            modelBuilder.Entity<Channel>()
                .Property(c => c.MessageKey).HasColumnName("message_key");
            modelBuilder.Entity<Channel>()
                .Property(c => c.CreatedBy).HasColumnName("created_by");
            modelBuilder.Entity<Channel>()
                .Property(c => c.CreatedAt).HasColumnName("created_at");
            modelBuilder.Entity<Channel>()
                .HasIndex(c => c.RoomId);

            // Oda üyeleri / rolleri
            modelBuilder.Entity<RoomMember>()
                .ToTable("room_members");
            modelBuilder.Entity<RoomMember>()
                .HasKey(m => new { m.RoomId, m.UserId });
            modelBuilder.Entity<RoomMember>()
                .Property(m => m.RoomId).HasColumnName("room_id");
            modelBuilder.Entity<RoomMember>()
                .Property(m => m.UserId).HasColumnName("user_id");
            modelBuilder.Entity<RoomMember>()
                .Property(m => m.Role).HasColumnName("role");
            modelBuilder.Entity<RoomMember>()
                .Property(m => m.JoinedAt).HasColumnName("joined_at");

            // Oda yasakları
            modelBuilder.Entity<RoomBan>()
                .ToTable("room_bans");
            modelBuilder.Entity<RoomBan>()
                .HasKey(b => new { b.RoomId, b.UserId });
            modelBuilder.Entity<RoomBan>()
                .Property(b => b.RoomId).HasColumnName("room_id");
            modelBuilder.Entity<RoomBan>()
                .Property(b => b.UserId).HasColumnName("user_id");
            modelBuilder.Entity<RoomBan>()
                .Property(b => b.BannedBy).HasColumnName("banned_by");
            modelBuilder.Entity<RoomBan>()
                .Property(b => b.Reason).HasColumnName("reason");
            modelBuilder.Entity<RoomBan>()
                .Property(b => b.BannedAt).HasColumnName("banned_at");

            modelBuilder.Entity<UserSound>()
                .ToTable("user_sounds");
            modelBuilder.Entity<UserSound>()
                .Property(s => s.Id).HasColumnName("id");
            modelBuilder.Entity<UserSound>()
                .Property(s => s.UserId).HasColumnName("user_id");
            modelBuilder.Entity<UserSound>()
                .Property(s => s.Name).HasColumnName("name");
            modelBuilder.Entity<UserSound>()
                .Property(s => s.Url).HasColumnName("url");
            modelBuilder.Entity<UserSound>()
                .Property(s => s.CreatedAt).HasColumnName("created_at");
            modelBuilder.Entity<UserSound>()
                .Property(s => s.IsPublic).HasColumnName("is_public");
            modelBuilder.Entity<UserSound>()
                .Property(s => s.IsDeleted).HasColumnName("is_deleted");

            // Ses Mağazası: kullanıcının soundboard'una eklediği başkalarının sesleri
            modelBuilder.Entity<SoundboardSave>()
                .ToTable("soundboard_saves");
            modelBuilder.Entity<SoundboardSave>()
                .HasKey(s => new { s.UserId, s.SoundId });
            modelBuilder.Entity<SoundboardSave>()
                .Property(s => s.UserId).HasColumnName("user_id");
            modelBuilder.Entity<SoundboardSave>()
                .Property(s => s.SoundId).HasColumnName("sound_id");
            modelBuilder.Entity<SoundboardSave>()
                .Property(s => s.CreatedAt).HasColumnName("created_at");
            modelBuilder.Entity<UserSound>()
                .Property(s => s.PlayCount).HasColumnName("play_count");

            modelBuilder.Entity<SoundFavorite>()
                .ToTable("sound_favorites");
            modelBuilder.Entity<SoundFavorite>()
                .HasKey(f => new { f.UserId, f.SoundId });
            modelBuilder.Entity<SoundFavorite>()
                .Property(f => f.UserId).HasColumnName("user_id");
            modelBuilder.Entity<SoundFavorite>()
                .Property(f => f.SoundId).HasColumnName("sound_id");
            modelBuilder.Entity<SoundFavorite>()
                .Property(f => f.CreatedAt).HasColumnName("created_at");

            // Mesaj tepkileri (emoji reaction)
            modelBuilder.Entity<PushSubscriptionEntry>()
                .ToTable("push_subscriptions");
            modelBuilder.Entity<PushSubscriptionEntry>()
                .Property(p => p.Id).HasColumnName("id");
            modelBuilder.Entity<PushSubscriptionEntry>()
                .Property(p => p.UserId).HasColumnName("user_id");
            modelBuilder.Entity<PushSubscriptionEntry>()
                .Property(p => p.Endpoint).HasColumnName("endpoint");
            modelBuilder.Entity<PushSubscriptionEntry>()
                .Property(p => p.P256dh).HasColumnName("p256dh");
            modelBuilder.Entity<PushSubscriptionEntry>()
                .Property(p => p.Auth).HasColumnName("auth");
            modelBuilder.Entity<PushSubscriptionEntry>()
                .Property(p => p.CreatedAt).HasColumnName("created_at");
            modelBuilder.Entity<PushSubscriptionEntry>()
                .HasIndex(p => p.Endpoint).IsUnique();

            modelBuilder.Entity<MessageReaction>()
                .ToTable("message_reactions");
            modelBuilder.Entity<MessageReaction>()
                .Property(r => r.Id).HasColumnName("id");
            modelBuilder.Entity<MessageReaction>()
                .Property(r => r.MessageId).HasColumnName("message_id");
            modelBuilder.Entity<MessageReaction>()
                .Property(r => r.UserId).HasColumnName("user_id");
            modelBuilder.Entity<MessageReaction>()
                .Property(r => r.Username).HasColumnName("username");
            modelBuilder.Entity<MessageReaction>()
                .Property(r => r.Emoji).HasColumnName("emoji");
            modelBuilder.Entity<MessageReaction>()
                .Property(r => r.CreatedAt).HasColumnName("created_at");
            modelBuilder.Entity<MessageReaction>()
                .HasIndex(r => new { r.MessageId, r.UserId, r.Emoji }).IsUnique();
        }
    }
}
