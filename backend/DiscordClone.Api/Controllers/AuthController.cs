using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using DiscordClone.Api.Data;
using DiscordClone.Api.Models;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace DiscordClone.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly AppDbContext _db;
        private readonly IConfiguration _configuration;

        public AuthController(AppDbContext db, IConfiguration configuration)
        {
            _db = db;
            _configuration = configuration;
        }

        [HttpPost("register")]
        public async Task<IActionResult> Register([FromBody] RegisterDto request)
        {
            try
            {
                if (await _db.Users.AnyAsync(u => u.Email == request.Email))
                    return BadRequest("Bu e-posta adresi zaten kullanılıyor.");

                if (await _db.Users.AnyAsync(u => u.Username == request.Username))
                    return BadRequest("Bu kullanıcı adı zaten alınmış.");

                var token = Guid.NewGuid().ToString();
                var user = new User
                {
                    Username = request.Username,
                    Email = request.Email,
                    PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
                    IsVerified = false,
                    VerificationToken = token
                };

                _db.Users.Add(user);
                await _db.SaveChangesAsync();

                Console.WriteLine($"\n[EMAIL MOCK] Lütfen e-postanızı doğrulayın. Doğrulama Linki: /api/auth/verify-email?userId={user.Id}&token={token}\n");

                return Ok(new { message = "Kayıt başarılı. Lütfen e-posta adresinize gönderilen link ile hesabınızı doğrulayın." });
            }
            catch (Exception ex)
            {
                // İç hatayı bulup string olarak döndür (Sorunun ne olduğunu açıkça görelim)
                return StatusCode(500, new { 
                    error = "Veritabanı veya Sunucu Hatası: " + ex.Message, 
                    inner = ex.InnerException?.Message,
                    stack = ex.StackTrace
                });
            }
        }

        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginDto request)
        {
            try
            {
                var user = await _db.Users.SingleOrDefaultAsync(u => u.Email == request.Email);

                if (user == null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
                    return Unauthorized("Geçersiz e-posta veya şifre.");

                if (!user.IsVerified)
                    return Unauthorized("E-posta adresiniz henüz doğrulanmamış. Lütfen e-postanızı kontrol edin.");

                var tokenHandler = new JwtSecurityTokenHandler();
                var jwtKey = _configuration["Jwt:Key"] ?? "VarsayilanCokGizliAnahtarDegistirilmeli123!";
                var key = Encoding.ASCII.GetBytes(jwtKey);
                
                var tokenDescriptor = new SecurityTokenDescriptor
                {
                    Subject = new ClaimsIdentity(new[]
                    {
                        new Claim(ClaimTypes.NameIdentifier, user.Id),
                        new Claim(ClaimTypes.Name, user.Username),
                        new Claim("AvatarId", user.AvatarId ?? "default"),
                        new Claim("FirstName", user.FirstName ?? ""),
                        new Claim("LastName", user.LastName ?? "")
                    }),
                    Expires = DateTime.UtcNow.AddDays(7),
                    SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(key), SecurityAlgorithms.HmacSha256Signature)
                };
                
                var token = tokenHandler.CreateToken(tokenDescriptor);

                return Ok(new { 
                    token = tokenHandler.WriteToken(token), 
                    username = user.Username,
                    avatarId = user.AvatarId ?? "default",
                    firstName = user.FirstName ?? "",
                    lastName = user.LastName ?? ""
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { 
                    error = "Login Hatası: " + ex.Message, 
                    inner = ex.InnerException?.Message 
                });
            }
        }

        [HttpGet("verify-email")]
        public async Task<IActionResult> VerifyEmail([FromQuery] string userId, [FromQuery] string token)
        {
            var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId);
            if (user == null || user.VerificationToken != token)
                return BadRequest("Geçersiz doğrulama linki.");

            user.IsVerified = true;
            user.VerificationToken = null;
            await _db.SaveChangesAsync();

            return Ok("E-posta başarıyla doğrulandı. Artık giriş yapabilirsiniz.");
        }

        [HttpPost("forgot-password")]
        public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordDto request)
        {
            var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == request.Email);
            if (user != null)
            {
                var token = Guid.NewGuid().ToString();
                user.ResetPasswordToken = token;
                await _db.SaveChangesAsync();

                Console.WriteLine($"\n[EMAIL MOCK] Şifre sıfırlama talebi. Link: /api/auth/reset-password (POST) Body: {{ \"userId\": \"{user.Id}\", \"token\": \"{token}\", \"newPassword\": \"...\" }}\n");
            }
            return Ok(new { message = "Eğer e-posta sistemimizde kayıtlıysa, şifre sıfırlama bağlantısı gönderildi." });
        }

        [HttpPost("reset-password")]
        public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordDto request)
        {
            var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == request.UserId);
            if (user == null || user.ResetPasswordToken != request.Token)
                return BadRequest("Geçersiz veya süresi dolmuş sıfırlama linki.");

            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
            user.ResetPasswordToken = null;
            await _db.SaveChangesAsync();

            return Ok(new { message = "Şifreniz başarıyla güncellendi. Yeni şifrenizle giriş yapabilirsiniz." });
        }
        [Authorize]
        [HttpPut("profile")]
        public async Task<IActionResult> UpdateProfile([FromBody] UpdateProfileDto request)
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId == null) return Unauthorized("Kullanıcı kimliği bulunamadı.");

            var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId);
            if (user == null) return NotFound("Kullanıcı bulunamadı.");

            // Check if username is taken by another user
            if (user.Username != request.Username && await _db.Users.AnyAsync(u => u.Username == request.Username))
            {
                return BadRequest("Bu kullanıcı adı zaten alınmış.");
            }

            user.Username = request.Username;
            user.FirstName = request.FirstName;
            user.LastName = request.LastName;
            user.AvatarId = request.AvatarId;

            try
            {
                await _db.SaveChangesAsync();
            }
            catch (Exception ex)
            {
                return BadRequest($"DB Error: {ex.Message} | Inner: {ex.InnerException?.Message}");
            }

            // Yeni JWT üret (Username değiştiği için claimlerin güncellenmesi gerekir)
            var tokenHandler = new JwtSecurityTokenHandler();
            var jwtKey = _configuration["Jwt:Key"] ?? "VarsayilanCokGizliAnahtarDegistirilmeli123!";
            var key = Encoding.ASCII.GetBytes(jwtKey);
            var tokenDescriptor = new SecurityTokenDescriptor
            {
                Subject = new ClaimsIdentity(new[]
                {
                    new Claim(ClaimTypes.NameIdentifier, user.Id),
                    new Claim(ClaimTypes.Name, user.Username),
                    new Claim("AvatarId", user.AvatarId ?? "default"),
                    new Claim("FirstName", user.FirstName ?? ""),
                    new Claim("LastName", user.LastName ?? "")
                }),
                Expires = DateTime.UtcNow.AddDays(7),
                SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(key), SecurityAlgorithms.HmacSha256Signature)
            };
            var token = tokenHandler.CreateToken(tokenDescriptor);

            return Ok(new { 
                message = "Profil güncellendi.",
                token = tokenHandler.WriteToken(token),
                username = user.Username,
                firstName = user.FirstName,
                lastName = user.LastName,
                avatarId = user.AvatarId
            });
        }
    }

    public class ForgotPasswordDto
    {
        public string Email { get; set; } = string.Empty;
    }

    public class ResetPasswordDto
    {
        public string UserId { get; set; } = string.Empty;
        public string Token { get; set; } = string.Empty;
        public string NewPassword { get; set; } = string.Empty;
    }

    public class UpdateProfileDto
    {
        public string Username { get; set; } = string.Empty;
        public string FirstName { get; set; } = string.Empty;
        public string LastName { get; set; } = string.Empty;
        public string AvatarId { get; set; } = "default";
    }
}
