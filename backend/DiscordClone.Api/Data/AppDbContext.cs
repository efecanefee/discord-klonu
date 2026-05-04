using Microsoft.EntityFrameworkCore;
using DiscordClone.Api.Models;

namespace DiscordClone.Api.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

        public DbSet<ChatMessage> Messages { get; set; }

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
        }
    }
}
