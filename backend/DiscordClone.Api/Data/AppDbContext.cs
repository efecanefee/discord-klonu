using Microsoft.EntityFrameworkCore;
using DiscordClone.Api.Models;

namespace DiscordClone.Api.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

        public DbSet<ChatMessage> Messages { get; set; }
        public DbSet<User> Users { get; set; }

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
                .HasIndex(u => u.Email).IsUnique();
            modelBuilder.Entity<User>()
                .HasIndex(u => u.Username).IsUnique();
        }
    }
}
