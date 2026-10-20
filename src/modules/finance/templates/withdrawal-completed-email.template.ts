export interface WithdrawalCompletedEmailData {
  userName?: string | null;
  amount: bigint | number | string;
  bankName: string;
  accountHolder: string;
  accountNumberMasked?: string;
  transferReference?: string | null;
  completedAt?: Date;
}

export interface WithdrawalCompletedEmailTemplate {
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

export function formatVnd(amount: bigint | number | string): string {
  const num = typeof amount === 'bigint' ? Number(amount) : Number(amount) || 0;
  return new Intl.NumberFormat('vi-VN').format(num) + ' đ';
}

function formatDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export function renderWithdrawalCompletedEmail(
  data: WithdrawalCompletedEmailData,
): WithdrawalCompletedEmailTemplate {
  const formattedAmount = formatVnd(data.amount);
  const timeStr = formatDate(data.completedAt);
  const safeName = data.userName ? escapeHtml(data.userName) : '';
  const safeBankName = escapeHtml(data.bankName);
  const safeAccountHolder = escapeHtml(data.accountHolder);
  const safeAccountNumber = data.accountNumberMasked
    ? escapeHtml(data.accountNumberMasked)
    : 'Đã xác thực';
  const safeReference = data.transferReference
    ? escapeHtml(data.transferReference)
    : 'Hệ thống đã xác nhận';

  const textLines = [
    'Piggy Back',
    '',
    ...(safeName ? [`Xin chào ${data.userName},`, ''] : []),
    'Yêu cầu rút tiền đã hoàn tất!',
    `Số tiền rút: ${formattedAmount}`,
    `Ngân hàng nhận: ${data.bankName}`,
    `Chủ tài khoản: ${data.accountHolder}`,
    `Số tài khoản: ${data.accountNumberMasked ?? 'Đã xác thực'}`,
    `Mã tham chiếu: ${data.transferReference ?? 'Hệ thống đã xác nhận'}`,
    `Thời gian: ${timeStr}`,
    '',
    'Số tiền rút đã được chuyển khoản thành công tới tài khoản ngân hàng của bạn.',
    'Xem chi tiết ví tại: https://piggyback.vn/app/wallet',
    '',
    'Piggy Back · Mua sắm vui hơn, tiền về ví nhỏ.',
  ];

  return {
    subject: `Piggy Back | Rút tiền thành công: ${formattedAmount}`,
    text: textLines.join('\n'),
    html: `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Rút tiền thành công Piggy Back</title>
</head>
<body style="margin:0;padding:0;background:#fff7f9;color:#25181e;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Yêu cầu rút tiền ${formattedAmount} của bạn đã được chuyển khoản thành công.</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#fff7f9;">
    <tr><td align="center" style="padding:36px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #f0dce4;border-radius:20px;">
        <tr><td style="padding:28px 32px 20px;border-bottom:1px solid #f6e8ed;">
          <span style="font-size:25px;font-weight:800;letter-spacing:-1px;color:#25181e;">Piggy<span style="color:#a8245e;">Back</span><span style="color:#a8245e;">.</span></span>
        </td></tr>
        <tr><td style="padding:32px 32px 12px;">
          <p style="margin:0 0 10px;color:#a8245e;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">RÚT TIỀN THÀNH CÔNG</p>
          <h1 style="margin:0 0 14px;font-size:26px;line-height:1.3;color:#25181e;">Yêu cầu rút tiền đã hoàn tất!</h1>
          ${safeName ? `<p style="margin:0 0 8px;color:#25181e;font-size:15px;font-weight:600;">Xin chào ${safeName},</p>` : ''}
          <p style="margin:0;color:#725f68;font-size:15px;line-height:1.65;">Số tiền rút đã được chuyển khoản thành công tới tài khoản ngân hàng của bạn.</p>
        </td></tr>
        <tr><td align="center" style="padding:18px 32px 20px;">
          <div style="display:inline-block;padding:16px 28px;border:1px solid #efd1dd;border-radius:14px;background:#fff0f5;color:#a8245e;font-family:Arial,Helvetica,sans-serif;font-size:32px;font-weight:800;letter-spacing:1px;line-height:1;">${formattedAmount}</div>
        </td></tr>
        <tr><td style="padding:0 32px 24px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px dashed #f0dce4;padding-top:14px;font-size:14px;color:#25181e;line-height:1.8;">
            <tr>
              <td style="color:#725f68;width:150px;padding:4px 0;">Ngân hàng nhận:</td>
              <td style="font-weight:600;padding:4px 0;">${safeBankName}</td>
            </tr>
            <tr>
              <td style="color:#725f68;padding:4px 0;">Chủ tài khoản:</td>
              <td style="font-weight:600;padding:4px 0;">${safeAccountHolder}</td>
            </tr>
            <tr>
              <td style="color:#725f68;padding:4px 0;">Số tài khoản:</td>
              <td style="font-weight:600;padding:4px 0;">${safeAccountNumber}</td>
            </tr>
            <tr>
              <td style="color:#725f68;padding:4px 0;">Mã tham chiếu:</td>
              <td style="font-weight:600;padding:4px 0;">${safeReference}</td>
            </tr>
            <tr>
              <td style="color:#725f68;padding:4px 0;">Thời gian hoàn tất:</td>
              <td style="font-weight:600;padding:4px 0;">${timeStr}</td>
            </tr>
          </table>
          <div style="margin:22px 0 12px;text-align:center;">
            <a href="https://piggyback.vn/app/wallet" style="display:inline-block;padding:12px 28px;background:#a8245e;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">Kiểm tra lịch sử ví</a>
          </div>
          <p style="margin:16px 0 0;color:#725f68;font-size:13px;line-height:1.6;text-align:center;">Tiền đã được chuyển vào tài khoản ngân hàng của bạn. Tùy thuộc vào ngân hàng thụ hưởng, giao dịch có thể mất từ vài giây đến ít phút để hiển thị trong sao kê.</p>
        </td></tr>
      </table>
      <p style="margin:18px 0 0;color:#8a7680;font-size:12px;line-height:1.5;">Piggy Back · Mua sắm vui hơn, tiền về ví nhỏ.</p>
    </td></tr>
  </table>
</body>
</html>`,
  };
}
