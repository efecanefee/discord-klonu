using DiscordClone.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiscordClone.Api.Controllers
{
    [ApiController]
    [Route("api/linkpreview")]
    [Authorize]
    public class LinkPreviewController : ControllerBase
    {
        private readonly ILinkPreviewService _previews;

        public LinkPreviewController(ILinkPreviewService previews)
        {
            _previews = previews;
        }

        /// <summary>
        /// Mesajdaki bir link için önizleme kartı verisi. Önizlenemiyorsa 204.
        /// </summary>
        [HttpGet]
        [ResponseCache(Duration = 3600, Location = ResponseCacheLocation.Client)]
        public async Task<IActionResult> Get([FromQuery] string url, CancellationToken ct)
        {
            if (!LinkPreviewService.TryNormalize(url, out _)) return BadRequest("Geçersiz link.");
            var preview = await _previews.GetAsync(url, ct);
            return preview == null ? NoContent() : Ok(preview);
        }
    }
}
