using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Net.Http.Headers;

namespace DiscordClone.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class UploadController : ControllerBase
    {
        private readonly IWebHostEnvironment _env;
        private readonly IHttpClientFactory _httpClientFactory;
        private static readonly string[] AllowedExtensions = { ".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".webm", ".pdf", ".zip", ".txt", ".mp3", ".ogg" };
        private const long MaxFileSize = 10 * 1024 * 1024; // 10MB

        // Supabase Storage yapılandırması (env ile — yoksa local diske düşer)
        private static readonly string? SupabaseUrl = Environment.GetEnvironmentVariable("SUPABASE_URL")?.TrimEnd('/');
        private static readonly string? SupabaseKey = Environment.GetEnvironmentVariable("SUPABASE_SERVICE_ROLE_KEY");
        private static readonly string SupabaseBucket = Environment.GetEnvironmentVariable("SUPABASE_BUCKET") ?? "chat-uploads";

        public UploadController(IWebHostEnvironment env, IHttpClientFactory httpClientFactory)
        {
            _env = env;
            _httpClientFactory = httpClientFactory;
        }

        [HttpPost]
        [RequestSizeLimit(10_485_760)] // 10MB
        public async Task<IActionResult> Upload(IFormFile file)
        {
            if (file == null || file.Length == 0)
                return BadRequest("Dosya seçilmedi.");

            if (file.Length > MaxFileSize)
                return BadRequest("Dosya boyutu 10MB'ı geçemez.");

            var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (!AllowedExtensions.Contains(ext))
                return BadRequest($"Bu dosya türü desteklenmiyor: {ext}");

            var uniqueName = $"{Guid.NewGuid():N}{ext}";

            // Supabase Storage yapılandırılmışsa oraya (kalıcı) yükle
            if (!string.IsNullOrEmpty(SupabaseUrl) && !string.IsNullOrEmpty(SupabaseKey))
            {
                var supabaseUrl = await UploadToSupabase(file, uniqueName);
                if (supabaseUrl != null)
                    return Ok(new { url = supabaseUrl, fileName = file.FileName });
                // Supabase başarısız olursa local'e düş (aşağıda)
            }

            // Local disk (geçici — Render'da redeploy'da silinir)
            var uploadsDir = Path.Combine(_env.ContentRootPath, "wwwroot", "uploads");
            Directory.CreateDirectory(uploadsDir);
            var filePath = Path.Combine(uploadsDir, uniqueName);

            using (var stream = new FileStream(filePath, FileMode.Create))
            {
                await file.CopyToAsync(stream);
            }

            var baseUrl = $"{Request.Scheme}://{Request.Host}";
            var fileUrl = $"{baseUrl}/uploads/{uniqueName}";

            return Ok(new { url = fileUrl, fileName = file.FileName });
        }

        // Supabase Storage REST API'sine service_role anahtarıyla yükler, public URL döner
        private async Task<string?> UploadToSupabase(IFormFile file, string uniqueName)
        {
            try
            {
                var client = _httpClientFactory.CreateClient();
                var uploadUrl = $"{SupabaseUrl}/storage/v1/object/{SupabaseBucket}/{uniqueName}";

                using var content = new StreamContent(file.OpenReadStream());
                content.Headers.ContentType = new MediaTypeHeaderValue(
                    string.IsNullOrEmpty(file.ContentType) ? "application/octet-stream" : file.ContentType);

                using var request = new HttpRequestMessage(HttpMethod.Post, uploadUrl) { Content = content };
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", SupabaseKey);
                request.Headers.TryAddWithoutValidation("apikey", SupabaseKey);
                request.Headers.TryAddWithoutValidation("x-upsert", "true");
                request.Headers.CacheControl = new CacheControlHeaderValue { MaxAge = TimeSpan.FromSeconds(3600) };

                var response = await client.SendAsync(request);
                if (!response.IsSuccessStatusCode)
                {
                    var err = await response.Content.ReadAsStringAsync();
                    Console.WriteLine($"[Upload] Supabase yükleme başarısız ({(int)response.StatusCode}): {err}");
                    return null;
                }

                // Public bucket için genel erişim URL'i
                return $"{SupabaseUrl}/storage/v1/object/public/{SupabaseBucket}/{uniqueName}";
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Upload] Supabase yükleme hatası: {ex.Message}");
                return null;
            }
        }
    }
}
