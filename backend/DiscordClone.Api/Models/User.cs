namespace DiscordClone.Api.Models
{
    public class User
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string Username { get; set; } = string.Empty;
        public string FirstName { get; set; } = string.Empty;
        public string LastName { get; set; } = string.Empty;
        public string AvatarId { get; set; } = "default";
        public string Email { get; set; } = string.Empty;
        public string PasswordHash { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        // Auth & Security Fields
        public bool IsVerified { get; set; } = false;
        public string? VerificationToken { get; set; }
        public string? ResetPasswordToken { get; set; }

        // Navigation property
        public ICollection<ChatMessage> Messages { get; set; } = new List<ChatMessage>();
    }
}
