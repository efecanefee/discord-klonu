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
                .Property(r => r.CreatedAt).HasColumnName("created_at");
            modelBuilder.Entity<Room>()
                .HasIndex(r => r.Name).IsUnique();

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
        }
    }
}
