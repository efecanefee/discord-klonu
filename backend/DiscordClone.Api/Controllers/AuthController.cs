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
            if (await _db.Users.AnyAsync(u => u.Email == request.Email))
                return BadRequest("Bu e-posta adresi zaten kullanılıyor.");

            if (await _db.Users.AnyAsync(u => u.Username == request.Username))
                return BadRequest("Bu kullanıcı adı zaten alınmış.");

            var user = new User
            {
                Username = request.Username,
                Email = request.Email,
                // BCrypt ile şifreleme
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password)
            };

            _db.Users.Add(user);
            await _db.SaveChangesAsync();

            return Ok(new { message = "Kayıt başarılı." });
        }

        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginDto request)
        {
            var user = await _db.Users.SingleOrDefaultAsync(u => u.Email == request.Email);

            if (user == null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
                return Unauthorized("Geçersiz e-posta veya şifre.");

            var tokenHandler = new JwtSecurityTokenHandler();
            // Ortam değişkenlerinden "Jwt:Key" değerini oku. Yoksa fallback (Geliştirme için)
            var jwtKey = _configuration["Jwt:Key"] ?? "VarsayilanCokGizliAnahtarDegistirilmeli123!";
            var key = Encoding.ASCII.GetBytes(jwtKey);
            
            var tokenDescriptor = new SecurityTokenDescriptor
            {
                Subject = new ClaimsIdentity(new[]
                {
                    new Claim(ClaimTypes.NameIdentifier, user.Id), // SignalR bunu kullanacak
                    new Claim(ClaimTypes.Name, user.Username)
                }),
                Expires = DateTime.UtcNow.AddDays(7), // 7 Günlük oturum
                SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(key), SecurityAlgorithms.HmacSha256Signature)
            };
            
            var token = tokenHandler.CreateToken(tokenDescriptor);

            return Ok(new { 
                token = tokenHandler.WriteToken(token), 
                username = user.Username 
            });
        }
    }
}
