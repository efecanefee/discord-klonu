using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;

namespace DiscordClone.Api.Controllers
{
    // GIF arama — GIPHY API'sine sunucu üzerinden gidilir ki anahtar tarayıcıya
    // sızmasın. Anahtar Render'da Giphy__ApiKey (ya da GIPHY_API_KEY) olarak girilir.
    // (Tenor API'si Google tarafından kapatıldı, bu yüzden GIPHY.)
    [ApiController]
    [Route("api/gifs")]
    [Authorize]
    public class GifsController : ControllerBase
    {
        private const int PageSize = 24;
        private readonly IHttpClientFactory _httpFactory;
        private readonly IMemoryCache _cache;
        private readonly string? _apiKey;

        public GifsController(IHttpClientFactory httpFactory, IMemoryCache cache, IConfiguration config)
        {
            _httpFactory = httpFactory;
            _cache = cache;
            _apiKey = new[] { "Giphy:ApiKey", "GIPHY_API_KEY", "GIPHY_APIKEY" }
                .Select(k => config[k]).FirstOrDefault(v => !string.IsNullOrWhiteSpace(v));
        }

        public record GifDto(string Id, string Title, string Url, string Preview, int Width, int Height);

        [HttpGet("trending")]
        public Task<IActionResult> Trending([FromQuery] int offset = 0, CancellationToken ct = default)
            => Query("trending", null, offset, ct);

        [HttpGet("search")]
        public Task<IActionResult> Search([FromQuery] string q, [FromQuery] int offset = 0, CancellationToken ct = default)
        {
            q = (q ?? "").Trim();
            if (q.Length == 0) return Trending(offset, ct);
            if (q.Length > 50) q = q[..50];
            return Query("search", q, offset, ct);
        }

        private async Task<IActionResult> Query(string endpoint, string? q, int offset, CancellationToken ct)
        {
            if (_apiKey == null) return StatusCode(503, new { error = "no_key" });
            offset = Math.Clamp(offset, 0, 480);

            var cacheKey = $"gif:{endpoint}:{q?.ToLowerInvariant()}:{offset}";
            if (_cache.TryGetValue(cacheKey, out List<GifDto>? cached)) return Ok(cached);

            var url = $"https://api.giphy.com/v1/gifs/{endpoint}?api_key={Uri.EscapeDataString(_apiKey)}&limit={PageSize}&offset={offset}&rating=pg-13&bundle=messaging_non_clips";
            if (q != null) url += $"&q={Uri.EscapeDataString(q)}&lang=tr";

            var http = _httpFactory.CreateClient();
            http.Timeout = TimeSpan.FromSeconds(6);
            using var res = await http.GetAsync(url, ct);
            if (!res.IsSuccessStatusCode) return StatusCode(502, new { error = "provider" });

            using var doc = await JsonDocument.ParseAsync(await res.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
            var list = new List<GifDto>();
            foreach (var g in doc.RootElement.GetProperty("data").EnumerateArray())
            {
                if (!g.TryGetProperty("images", out var images)) continue;
                // Mesaja giden: ~200px yükseklikte hafif sürüm; ızgarada: küçük önizleme
                var full = Img(images, "fixed_height") ?? Img(images, "downsized");
                var preview = Img(images, "fixed_height_small") ?? full;
                if (full == null || preview == null) continue;
                list.Add(new GifDto(
                    g.GetProperty("id").GetString() ?? "",
                    g.TryGetProperty("title", out var t) ? t.GetString() ?? "" : "",
                    full.Value.url, preview.Value.url, full.Value.w, full.Value.h));
            }

            _cache.Set(cacheKey, list, TimeSpan.FromMinutes(q == null ? 30 : 10));
            return Ok(list);
        }

        private static (string url, int w, int h)? Img(JsonElement images, string name)
        {
            if (!images.TryGetProperty(name, out var i) || !i.TryGetProperty("url", out var u)) return null;
            var url = u.GetString();
            if (string.IsNullOrEmpty(url) || !url.StartsWith("https://")) return null;
            int.TryParse(i.TryGetProperty("width", out var w) ? w.GetString() : null, out var wi);
            int.TryParse(i.TryGetProperty("height", out var h) ? h.GetString() : null, out var hi);
            return (url, wi, hi);
        }
    }
}
