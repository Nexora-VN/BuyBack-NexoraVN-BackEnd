export interface RegistrationEmailTemplate {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character] ?? character;
  });
}

export function renderRegistrationEmail(code: string): RegistrationEmailTemplate {
  const safeCode = escapeHtml(code);
  return {
    subject: 'Piggy Back | Xác thực email',
    text: [
      'Piggy Back',
      '',
      'Xác thực email của bạn',
      `Mã xác thực: ${code}`,
      'Mã có hiệu lực trong 10 phút. Nếu bạn không tạo tài khoản, hãy bỏ qua email này.',
      '',
      'Verify your email',
      `Verification code: ${code}`,
      'This code expires in 10 minutes. If you did not create an account, ignore this email.',
      '',
      'Piggy Back · Mua sắm vui hơn, tiền về ví nhỏ.',
    ].join('\n'),
    html: `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Xác thực email Piggy Back</title>
</head>
<body style="margin:0;padding:0;background:#fff7f9;color:#25181e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Mã xác thực tài khoản Piggy Back của bạn có hiệu lực trong 10 phút.</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#fff7f9;">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #f0dce4;border-radius:24px;box-shadow:0 8px 30px rgba(168,36,94,0.06);overflow:hidden;">
        <!-- Header -->
        <tr><td style="padding:24px 32px 20px;border-bottom:1px solid #f8ebf0;background:#ffffff;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td align="left" style="vertical-align:middle;">
                <a href="https://piggyback.vn" target="_blank" style="text-decoration:none;display:inline-block;">
                  <img src="https://piggyback.vn/brand-wordmark.png" alt="Piggy Back" width="140" style="display:block;height:auto;border:0;outline:none;" />
                </a>
              </td>
              <td align="right" style="vertical-align:middle;">
                <img src="https://piggyback.vn/logo.png" alt="Piggy Mascot" width="44" height="44" style="display:block;border-radius:50%;border:1px solid #fce7f0;" />
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Mascot & Hero -->
        <tr><td align="center" style="padding:32px 32px 12px;background:#ffffff;">
          <img src="https://piggyback.vn/logo.png" alt="Welcome Mascot" width="88" height="88" style="display:block;margin:0 auto 16px;border-radius:20px;box-shadow:0 6px 16px rgba(168,36,94,0.12);" />
          <p style="margin:0 0 8px;color:#a8245e;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">BƯỚC CUỐI ĐỂ BẮT ĐẦU</p>
          <h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;color:#25181e;font-weight:800;">Xác thực email của bạn</h1>
          <p style="margin:0;color:#725f68;font-size:15px;line-height:1.6;max-width:440px;">Chào mừng bạn đến với Piggy Back! Hãy nhập mã 6 chữ số dưới đây để kích hoạt tài khoản mua sắm hoàn tiền.</p>
        </td></tr>

        <!-- OTP Code Box -->
        <tr><td align="center" style="padding:20px 32px 24px;background:#ffffff;">
          <div style="display:inline-block;padding:18px 32px;border:2px dashed #f3c2d4;border-radius:16px;background:#fff0f5;color:#a8245e;font-family:Arial,Helvetica,sans-serif;font-size:34px;font-weight:800;letter-spacing:10px;line-height:1;box-shadow:0 4px 14px rgba(168,36,94,0.06);">
            ${safeCode}
          </div>
        </td></tr>

        <!-- Expiry Notice -->
        <tr><td style="padding:0 32px 28px;background:#ffffff;">
          <div style="background:#fff9fa;border:1px solid #fce7f0;border-radius:12px;padding:14px 18px;">
            <p style="margin:0 0 6px;color:#25181e;font-size:14px;line-height:1.5;"><strong>Mã có hiệu lực trong 10 phút.</strong> Nếu bạn không tạo tài khoản, hãy bỏ qua email này.</p>
            <p style="margin:0;color:#8a7680;font-size:12px;line-height:1.5;">This verification code expires in 10 minutes. If you did not create an account, please ignore this email.</p>
          </div>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:22px 32px;background:#faf4f6;border-top:1px solid #f6e8ed;text-align:center;">
          <p style="margin:0 0 6px;color:#25181e;font-size:13px;font-weight:700;">Piggy Back · Mua sắm vui hơn, tiền về ví nhỏ.</p>
          <p style="margin:0 0 8px;color:#8a7680;font-size:12px;line-height:1.5;">Hỗ trợ khách hàng: <a href="mailto:noreply@piggyback.vn" style="color:#a8245e;text-decoration:none;font-weight:600;">noreply@piggyback.vn</a> · Website: <a href="https://piggyback.vn" target="_blank" style="color:#a8245e;text-decoration:none;font-weight:600;">piggyback.vn</a></p>
          <p style="margin:0;color:#ad9ba4;font-size:11px;">&copy; 2026 Piggy Back. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}
