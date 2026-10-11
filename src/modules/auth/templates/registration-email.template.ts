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
    ].join('\n'),
    html: `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Xác thực email Piggy Back</title>
</head>
<body style="margin:0;padding:0;background:#fff7f9;color:#25181e;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Mã xác thực tài khoản Piggy Back của bạn có hiệu lực trong 10 phút.</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#fff7f9;">
    <tr><td align="center" style="padding:36px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #f0dce4;border-radius:20px;">
        <tr><td style="padding:28px 32px 20px;border-bottom:1px solid #f6e8ed;">
          <span style="font-size:25px;font-weight:800;letter-spacing:-1px;color:#25181e;">Piggy<span style="color:#a8245e;">Back</span><span style="color:#a8245e;">.</span></span>
        </td></tr>
        <tr><td style="padding:32px 32px 12px;">
          <p style="margin:0 0 10px;color:#a8245e;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">BƯỚC CUỐI ĐỂ BẮT ĐẦU</p>
          <h1 style="margin:0 0 14px;font-size:26px;line-height:1.3;color:#25181e;">Xác thực email của bạn</h1>
          <p style="margin:0;color:#725f68;font-size:15px;line-height:1.65;">Nhập mã 6 chữ số bên dưới để hoàn tất tạo tài khoản Piggy Back.</p>
        </td></tr>
        <tr><td align="center" style="padding:22px 32px 24px;">
          <div style="display:inline-block;padding:18px 24px;border:1px solid #efd1dd;border-radius:14px;background:#fff0f5;color:#a8245e;font-family:Arial,Helvetica,sans-serif;font-size:32px;font-weight:800;letter-spacing:9px;line-height:1;">${safeCode}</div>
        </td></tr>
        <tr><td style="padding:0 32px 30px;">
          <p style="margin:0 0 12px;color:#25181e;font-size:14px;line-height:1.6;"><strong>Mã có hiệu lực trong 10 phút.</strong> Nếu bạn không tạo tài khoản, hãy bỏ qua email này.</p>
          <p style="margin:0;color:#725f68;font-size:13px;line-height:1.6;">Your code expires in 10 minutes. If you did not create an account, please ignore this email.</p>
        </td></tr>
      </table>
      <p style="margin:18px 0 0;color:#8a7680;font-size:12px;line-height:1.5;">Piggy Back · Mua sắm vui hơn, tiền về ví nhỏ.</p>
    </td></tr>
  </table>
</body>
</html>`,
  };
}
