using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Resend;

namespace DiscordClone.Api.Services
{
    public interface IEmailService
    {
        Task SendVerificationEmailAsync(string toEmail, string token, string userId);
        Task SendPasswordResetEmailAsync(string toEmail, string token, string userId);
    }

    public class EmailService : IEmailService
    {
        private readonly IResend _resend;
        private readonly ILogger<EmailService> _logger;
        private readonly string _frontendUrl;
        private readonly string _fromEmail;

        public EmailService(IResend resend, ILogger<EmailService> logger, IConfiguration configuration)
        {
            _resend = resend;
            _logger = logger;
            _frontendUrl = configuration["FrontendUrl"] ?? "http://localhost:5173";
            _fromEmail = configuration["Resend:FromEmail"] ?? "onboarding@resend.dev";
        }

        public async Task SendVerificationEmailAsync(string toEmail, string token, string userId)
        {
            var verificationLink = $"{_frontendUrl}/?action=verify&token={token}&userId={userId}";
            var message = new EmailMessage
            {
                From = _fromEmail,
                To = toEmail,
                Subject = "SandalyeciMetin - E-posta Adresinizi Doğrulayın",
                HtmlBody = $@"
                    <h2>Hoş Geldiniz!</h2>
                    <p>Hesabınızı doğrulamak için aşağıdaki bağlantıya tıklayın. Bu bağlantı 24 saat geçerlidir.</p>
                    <p><a href='{verificationLink}' style='display:inline-block;padding:10px 20px;background-color:#7C3AED;color:white;text-decoration:none;border-radius:5px;'>Hesabımı Doğrula</a></p>
                    <p>Eğer butona tıklayamazsanız şu linki tarayıcınıza kopyalayabilirsiniz: <br/>
                    {verificationLink}</p>
                "
            };

            try
            {
                await _resend.EmailSendAsync(message);
                _logger.LogInformation($"Doğrulama e-postası gönderildi: {toEmail}");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"E-posta gönderim hatası (Doğrulama): {toEmail}");
            }
        }

        public async Task SendPasswordResetEmailAsync(string toEmail, string token, string userId)
        {
            var resetLink = $"{_frontendUrl}/?action=reset&token={token}&userId={userId}";
            var message = new EmailMessage
            {
                From = _fromEmail,
                To = toEmail,
                Subject = "SandalyeciMetin - Şifre Sıfırlama",
                HtmlBody = $@"
                    <h2>Şifre Sıfırlama Talebi</h2>
                    <p>Hesabınız için şifre sıfırlama talebinde bulundunuz. Bu bağlantı 15 dakika geçerlidir.</p>
                    <p><a href='{resetLink}' style='display:inline-block;padding:10px 20px;background-color:#7C3AED;color:white;text-decoration:none;border-radius:5px;'>Şifremi Sıfırla</a></p>
                    <p>Eğer butona tıklayamazsanız şu linki tarayıcınıza kopyalayabilirsiniz: <br/>
                    {resetLink}</p>
                    <p>Eğer bu işlemi siz yapmadıysanız lütfen bu e-postayı dikkate almayın.</p>
                "
            };

            try
            {
                await _resend.EmailSendAsync(message);
                _logger.LogInformation($"Şifre sıfırlama e-postası gönderildi: {toEmail}");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"E-posta gönderim hatası (Sıfırlama): {toEmail}");
            }
        }
    }
}
