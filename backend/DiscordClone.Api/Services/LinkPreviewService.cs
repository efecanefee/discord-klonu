using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Caching.Memory;

namespace DiscordClone.Api.Services
{
    public class LinkPreviewDto
    {
        public string Url { get; set; } = "";
        public string Type { get; set; } = "generic"; // "generic" | "youtube" | "twitter"
        public string? Title { get; set; }
        public string? Description { get; set; }
        public string? Image { get; set; }
        public string? SiteName { get; set; }
        public string? ThemeColor { get; set; }
        public string? Author { get; set; }
        public string? AuthorHandle { get; set; }
        public string? AuthorAvatar { get; set; }
        public string? VideoId { get; set; }
        public long? CreatedAt { get; set; }
        public int? Likes { get; set; }
        public int? Reposts { get; set; }
        public int? Replies { get; set; }
    }

    public interface ILinkPreviewService
    {
        Task<LinkPreviewDto?> GetAsync(string url, CancellationToken ct);
    }

    // Mesajdaki linkler için kart verisi (başlık, açıklama, görsel).
    // Sunucu dışarıya istek attığı için SSRF'e karşı her bağlantının gerçek IP'si
    // kontrol edilir (yönlendirmeler ve DNS rebinding dahil): yalnızca genel internet.
    public class LinkPreviewService : ILinkPreviewService
    {
        private const int MaxHtmlBytes = 512 * 1024;
        private static readonly TimeSpan CacheTtl = TimeSpan.FromHours(6);
        private static readonly TimeSpan NegativeCacheTtl = TimeSpan.FromMinutes(20);

        private static readonly Regex YoutubeId = new(@"(?:youtube\.com/(?:watch\?(?:.*&)?v=|shorts/|embed/|live/)|youtu\.be/)([A-Za-z0-9_-]{11})", RegexOptions.IgnoreCase | RegexOptions.Compiled);
        private static readonly Regex TweetPath = new(@"^/([A-Za-z0-9_]{1,15})/status(?:es)?/(\d{5,25})", RegexOptions.Compiled);
        private static readonly Regex MetaTag = new(@"<meta\s[^>]*>", RegexOptions.IgnoreCase | RegexOptions.Compiled);
        private static readonly Regex Attr = new(@"([a-zA-Z:_-]+)\s*=\s*(?:""([^""]*)""|'([^']*)')", RegexOptions.Compiled);
        private static readonly Regex TitleTag = new(@"<title[^>]*>([^<]{1,300})</title>", RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private readonly HttpClient _http;
        private readonly IMemoryCache _cache;
        private readonly ILogger<LinkPreviewService> _logger;

        public LinkPreviewService(IMemoryCache cache, ILogger<LinkPreviewService> logger)
        {
            _cache = cache;
            _logger = logger;

            var handler = new SocketsHttpHandler
            {
                AllowAutoRedirect = true,
                MaxAutomaticRedirections = 4,
                AutomaticDecompression = DecompressionMethods.All,
                ConnectTimeout = TimeSpan.FromSeconds(4),
                PooledConnectionLifetime = TimeSpan.FromMinutes(5),
                UseProxy = false,
                ConnectCallback = SafeConnectAsync,
            };
            _http = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(6) };
            // Bazı siteler (X, Instagram) yalnızca bilinen botlara meta etiketi döndürür
            _http.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)");
            _http.DefaultRequestHeaders.Accept.ParseAdd("text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.5");
            _http.DefaultRequestHeaders.AcceptLanguage.ParseAdd("tr-TR,tr;q=0.9,en;q=0.8");
        }

        public async Task<LinkPreviewDto?> GetAsync(string url, CancellationToken ct)
        {
            if (!TryNormalize(url, out var uri)) return null;
            var key = "lp:" + uri.AbsoluteUri;
            if (_cache.TryGetValue(key, out LinkPreviewDto? cached)) return cached;

            LinkPreviewDto? result = null;
            try
            {
                result = await FetchAsync(uri, ct);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "[LinkPreview] {Url} alınamadı", uri.Host);
            }

            _cache.Set(key, result, result == null ? NegativeCacheTtl : CacheTtl);
            return result;
        }

        private async Task<LinkPreviewDto?> FetchAsync(Uri uri, CancellationToken ct)
        {
            var host = uri.Host.ToLowerInvariant();

            var yt = YoutubeId.Match(uri.AbsoluteUri);
            if (yt.Success && (host.EndsWith("youtube.com") || host == "youtu.be"))
                return await FetchYoutubeAsync(uri, yt.Groups[1].Value, ct);

            if (host is "twitter.com" or "www.twitter.com" or "mobile.twitter.com" or "x.com" or "www.x.com"
                or "fxtwitter.com" or "vxtwitter.com" or "fixupx.com")
            {
                var m = TweetPath.Match(uri.AbsolutePath);
                if (m.Success) return await FetchTweetAsync(uri, m.Groups[1].Value, m.Groups[2].Value, ct);
            }

            return await FetchOpenGraphAsync(uri, ct);
        }

        // YouTube: kapak görseli her zaman var; başlık/kanal oEmbed'den
        private async Task<LinkPreviewDto> FetchYoutubeAsync(Uri uri, string videoId, CancellationToken ct)
        {
            var dto = new LinkPreviewDto
            {
                Url = uri.AbsoluteUri,
                Type = "youtube",
                VideoId = videoId,
                SiteName = "YouTube",
                ThemeColor = "#FF0000",
                Image = $"https://i.ytimg.com/vi/{videoId}/hqdefault.jpg",
            };
            try
            {
                var oembed = $"https://www.youtube.com/oembed?format=json&url={Uri.EscapeDataString("https://www.youtube.com/watch?v=" + videoId)}";
                using var res = await _http.GetAsync(oembed, ct);
                if (res.IsSuccessStatusCode)
                {
                    using var doc = JsonDocument.Parse(await ReadLimitedAsync(res, 64 * 1024, ct));
                    dto.Title = Str(doc.RootElement, "title");
                    dto.Author = Str(doc.RootElement, "author_name");
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
            {
                // Başlık gelmezse kart yine kapakla gösterilir
            }
            return dto;
        }

        // X/Twitter sayfaları JS ile çizildiği için meta etiketi vermez; FxTwitter'ın
        // açık API'si (anahtarsız) tweet metnini, yazarı ve medyayı JSON döndürür.
        private async Task<LinkPreviewDto?> FetchTweetAsync(Uri uri, string user, string id, CancellationToken ct)
        {
            using var res = await _http.GetAsync($"https://api.fxtwitter.com/{user}/status/{id}", ct);
            if (!res.IsSuccessStatusCode) return null;
            using var doc = JsonDocument.Parse(await ReadLimitedAsync(res, 256 * 1024, ct));
            if (!doc.RootElement.TryGetProperty("tweet", out var t)) return null;

            var dto = new LinkPreviewDto
            {
                Url = $"https://x.com/{user}/status/{id}",
                Type = "twitter",
                SiteName = "X",
                ThemeColor = "#1D9BF0",
                Description = Clip(Str(t, "text"), 600),
                Likes = Int(t, "likes"),
                Reposts = Int(t, "retweets"),
                Replies = Int(t, "replies"),
            };
            if (t.TryGetProperty("created_timestamp", out var ts) && ts.TryGetInt64(out var sec)) dto.CreatedAt = sec * 1000;
            if (t.TryGetProperty("author", out var a))
            {
                dto.Author = Str(a, "name");
                dto.AuthorHandle = Str(a, "screen_name");
                dto.AuthorAvatar = SafeHttpUrl(Str(a, "avatar_url"));
            }
            if (t.TryGetProperty("media", out var media))
            {
                string? img = null;
                if (media.TryGetProperty("photos", out var photos) && photos.ValueKind == JsonValueKind.Array && photos.GetArrayLength() > 0)
                    img = Str(photos[0], "url");
                else if (media.TryGetProperty("videos", out var videos) && videos.ValueKind == JsonValueKind.Array && videos.GetArrayLength() > 0)
                    img = Str(videos[0], "thumbnail_url");
                dto.Image = SafeHttpUrl(img);
            }
            dto.Title = dto.Author;
            return dto;
        }

        private async Task<LinkPreviewDto?> FetchOpenGraphAsync(Uri uri, CancellationToken ct)
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, uri);
            using var res = await _http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct);
            if (!res.IsSuccessStatusCode) return null;
            var media = res.Content.Headers.ContentType?.MediaType ?? "";
            if (!media.Contains("html")) return null;

            var html = await ReadLimitedAsync(res, MaxHtmlBytes, ct);
            // Meta etiketleri <head> içinde; gövdenin geri kalanına gerek yok
            var headEnd = html.IndexOf("</head>", StringComparison.OrdinalIgnoreCase);
            if (headEnd > 0) html = html[..headEnd];

            var meta = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (Match tag in MetaTag.Matches(html))
            {
                string? name = null, content = null;
                foreach (Match at in Attr.Matches(tag.Value))
                {
                    var k = at.Groups[1].Value.ToLowerInvariant();
                    var v = at.Groups[2].Success ? at.Groups[2].Value : at.Groups[3].Value;
                    if (k is "property" or "name" or "itemprop") name ??= v;
                    else if (k == "content") content = v;
                }
                if (name != null && content != null && !meta.ContainsKey(name)) meta[name] = WebUtility.HtmlDecode(content).Trim();
            }

            string? Pick(params string[] keys) => keys.Select(k => meta.TryGetValue(k, out var v) && v.Length > 0 ? v : null).FirstOrDefault(v => v != null);

            var finalUri = res.RequestMessage?.RequestUri ?? uri;
            var title = Pick("og:title", "twitter:title");
            if (title == null)
            {
                var tm = TitleTag.Match(html);
                if (tm.Success) title = WebUtility.HtmlDecode(tm.Groups[1].Value).Trim();
            }
            var description = Pick("og:description", "twitter:description", "description");
            var image = Pick("og:image:secure_url", "og:image", "og:image:url", "twitter:image", "twitter:image:src");
            if (image != null && Uri.TryCreate(finalUri, image, out var abs)) image = SafeHttpUrl(abs.AbsoluteUri);
            else image = null;

            if (string.IsNullOrWhiteSpace(title) && string.IsNullOrWhiteSpace(description)) return null;

            var color = Pick("theme-color");
            if (color != null && !Regex.IsMatch(color, "^#[0-9a-fA-F]{3,8}$")) color = null;

            return new LinkPreviewDto
            {
                Url = uri.AbsoluteUri,
                Type = "generic",
                Title = Clip(title, 200),
                Description = Clip(description, 350),
                Image = image,
                SiteName = Clip(Pick("og:site_name", "application-name"), 60) ?? finalUri.Host.Replace("www.", ""),
                ThemeColor = color,
            };
        }

        // ---------- yardımcılar ----------

        public static bool TryNormalize(string? raw, out Uri uri)
        {
            uri = null!;
            if (string.IsNullOrWhiteSpace(raw) || raw.Length > 2048) return false;
            if (!Uri.TryCreate(raw.Trim(), UriKind.Absolute, out var u)) return false;
            if (u.Scheme != Uri.UriSchemeHttp && u.Scheme != Uri.UriSchemeHttps) return false;
            if (!string.IsNullOrEmpty(u.UserInfo)) return false;
            if (!u.IsDefaultPort) return false; // 80/443 dışı portlar iç servis taraması için kullanılabilir
            if (u.HostNameType is UriHostNameType.IPv4 or UriHostNameType.IPv6 && IPAddress.TryParse(u.Host.Trim('[', ']'), out var ip) && !IsPublic(ip)) return false;
            if (u.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase) || u.Host.EndsWith(".local", StringComparison.OrdinalIgnoreCase) || u.Host.EndsWith(".internal", StringComparison.OrdinalIgnoreCase)) return false;
            uri = u;
            return true;
        }

        // Her TCP bağlantısında hedef IP doğrulanır — yönlendirme ya da DNS
        // rebinding ile iç ağa (169.254.169.254, 10.x, localhost...) ulaşılamaz.
        private static async ValueTask<Stream> SafeConnectAsync(SocketsHttpConnectionContext ctx, CancellationToken ct)
        {
            var addresses = await Dns.GetHostAddressesAsync(ctx.DnsEndPoint.Host, ct);
            var target = addresses.FirstOrDefault(IsPublic)
                ?? throw new HttpRequestException("Bu adrese bağlanılamaz.");
            if (addresses.Any(a => !IsPublic(a))) throw new HttpRequestException("Bu adrese bağlanılamaz.");

            var socket = new Socket(target.AddressFamily, SocketType.Stream, ProtocolType.Tcp) { NoDelay = true };
            try
            {
                await socket.ConnectAsync(new IPEndPoint(target, ctx.DnsEndPoint.Port), ct);
                return new NetworkStream(socket, ownsSocket: true);
            }
            catch
            {
                socket.Dispose();
                throw;
            }
        }

        private static bool IsPublic(IPAddress ip)
        {
            if (ip.IsIPv4MappedToIPv6) ip = ip.MapToIPv4();
            if (IPAddress.IsLoopback(ip)) return false;
            if (ip.AddressFamily == AddressFamily.InterNetwork)
            {
                var b = ip.GetAddressBytes();
                return !(b[0] == 0 || b[0] == 10 || b[0] == 127
                    || (b[0] == 100 && b[1] >= 64 && b[1] <= 127)   // CGNAT
                    || (b[0] == 169 && b[1] == 254)                 // link-local / bulut metadata
                    || (b[0] == 172 && b[1] >= 16 && b[1] <= 31)
                    || (b[0] == 192 && b[1] == 168)
                    || (b[0] == 192 && b[1] == 0 && b[2] == 0)
                    || (b[0] == 198 && (b[1] == 18 || b[1] == 19))
                    || b[0] >= 224);                                // multicast + ayrılmış
            }
            if (ip.AddressFamily == AddressFamily.InterNetworkV6)
            {
                if (ip.IsIPv6LinkLocal || ip.IsIPv6SiteLocal || ip.IsIPv6Multicast || ip.Equals(IPAddress.IPv6None)) return false;
                var b = ip.GetAddressBytes();
                if ((b[0] & 0xFE) == 0xFC) return false; // fc00::/7 unique local
                if (b[0] == 0x20 && b[1] == 0x02) return false; // 6to4 (iç IPv4'e tünel)
                if (b[0] == 0x00 && b[1] == 0x64 && b[2] == 0xff && b[3] == 0x9b) return false; // NAT64
                return true;
            }
            return false;
        }

        private static async Task<string> ReadLimitedAsync(HttpResponseMessage res, int maxBytes, CancellationToken ct)
        {
            await using var stream = await res.Content.ReadAsStreamAsync(ct);
            var buffer = new byte[maxBytes];
            var total = 0;
            int read;
            while (total < maxBytes && (read = await stream.ReadAsync(buffer.AsMemory(total, maxBytes - total), ct)) > 0)
                total += read;
            var charset = res.Content.Headers.ContentType?.CharSet;
            Encoding enc;
            try { enc = string.IsNullOrEmpty(charset) ? Encoding.UTF8 : Encoding.GetEncoding(charset.Trim('"')); }
            catch { enc = Encoding.UTF8; }
            return enc.GetString(buffer, 0, total);
        }

        private static string? SafeHttpUrl(string? url) =>
            url != null && url.Length <= 2048 && Uri.TryCreate(url, UriKind.Absolute, out var u) && (u.Scheme == Uri.UriSchemeHttps || u.Scheme == Uri.UriSchemeHttp)
                ? u.AbsoluteUri : null;

        private static string? Str(JsonElement el, string prop) =>
            el.ValueKind == JsonValueKind.Object && el.TryGetProperty(prop, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

        private static int? Int(JsonElement el, string prop) =>
            el.TryGetProperty(prop, out var v) && v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out var n) ? n : null;

        private static string? Clip(string? s, int max) =>
            string.IsNullOrWhiteSpace(s) ? null : s.Length <= max ? s : s[..(max - 1)].TrimEnd() + "…";
    }
}
