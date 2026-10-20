export interface CashbackCreditedEmailData {
  userName?: string | null;
  amount: bigint | number | string;
  orderCount?: number;
  note?: string;
  creditedAt?: Date;
}

export interface CashbackCreditedEmailTemplate {
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

export function renderCashbackCreditedEmail(
  data: CashbackCreditedEmailData,
): CashbackCreditedEmailTemplate {
  const formattedAmount = formatVnd(data.amount);
  const timeStr = formatDate(data.creditedAt);
  const safeName = data.userName ? escapeHtml(data.userName) : '';
  const safeNote = data.note ? escapeHtml(data.note) : '';

  const orderNote = data.orderCount && data.orderCount > 1 ? `từ ${data.orderCount} đơn hàng ` : '';

  const textLines = [
    'Piggy Back',
    '',
    ...(safeName ? [`Xin chào ${data.userName},`, ''] : []),
    'Hoàn tiền đã vào ví của bạn!',
    `Số tiền: +${formattedAmount}`,
    'Trạng thái: Đã cộng vào số dư khả dụng',
    `Thời gian: ${timeStr}`,
    ...(data.note ? [`Ghi chú: ${data.note}`] : []),
    '',
    `Khoản hoàn tiền ${orderNote}đã được đối soát thành công và cộng vào số dư khả dụng.`,
    'Xem chi tiết ví tại: https://piggyback.vn/app/wallet',
    '',
    'Piggy Back · Mua sắm vui hơn, tiền về ví nhỏ.',
  ];

  return {
    subject: `Piggy Back | +${formattedAmount} hoàn tiền đã vào ví`,
    text: textLines.join('\n'),
    html: `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Hoàn tiền đã vào ví Piggy Back</title>
</head>
<body style="margin:0;padding:0;background:#fff7f9;color:#25181e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">+${formattedAmount} hoàn tiền đã được cộng vào số dư khả dụng trên ví Piggy Back.</div>
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
        <tr><td align="center" style="padding:32px 32px 8px;background:#ffffff;">
          <img src="https://piggyback.vn/piggy-hero.png" alt="Piggy Cashback Mascot" width="110" style="display:block;margin:0 auto 16px;height:auto;" />
          <p style="margin:0 0 8px;color:#a8245e;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">TIỀN HOÀN VỀ VÍ</p>
          <h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;color:#25181e;font-weight:800;">Hoàn tiền đã vào ví của bạn!</h1>
          ${safeName ? `<p style="margin:0 0 8px;color:#25181e;font-size:15px;font-weight:600;">Xin chào ${safeName},</p>` : ''}
          <p style="margin:0;color:#725f68;font-size:15px;line-height:1.6;max-width:440px;">Khoản tiền hoàn ${orderNote}đã được đối soát thành công và cộng trực tiếp vào số dư khả dụng của bạn.</p>
        </td></tr>

        <!-- Amount Badge -->
        <tr><td align="center" style="padding:16px 32px 20px;background:#ffffff;">
          <div style="display:inline-block;padding:16px 32px;border:2px solid #efd1dd;border-radius:18px;background:#fff0f5;color:#a8245e;font-family:Arial,Helvetica,sans-serif;font-size:32px;font-weight:800;letter-spacing:1px;line-height:1;box-shadow:0 4px 14px rgba(168,36,94,0.06);">
            +${formattedAmount}
          </div>
        </td></tr>

        <!-- Detail Table -->
        <tr><td style="padding:0 32px 24px;background:#ffffff;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px dashed #f0dce4;padding-top:16px;font-size:14px;color:#25181e;line-height:1.8;">
            <tr>
              <td style="color:#725f68;width:140px;padding:6px 0;">Trạng thái:</td>
              <td style="font-weight:700;color:#059669;padding:6px 0;">● Đã cộng vào ví</td>
            </tr>
            <tr>
              <td style="color:#725f68;padding:6px 0;">Thời gian:</td>
              <td style="font-weight:600;padding:6px 0;">${timeStr}</td>
            </tr>
            ${
              data.orderCount && data.orderCount > 1
                ? `<tr>
              <td style="color:#725f68;padding:6px 0;">Số lượng đơn:</td>
              <td style="font-weight:600;padding:6px 0;">${data.orderCount} đơn hàng hợp lệ</td>
            </tr>`
                : ''
            }
            ${
              safeNote
                ? `<tr>
              <td style="color:#725f68;padding:6px 0;">Ghi chú:</td>
              <td style="color:#725f68;padding:6px 0;">${safeNote}</td>
            </tr>`
                : ''
            }
          </table>
        </td></tr>

        <!-- CTA Button -->
        <tr><td align="center" style="padding:0 32px 30px;background:#ffffff;">
          <a href="https://piggyback.vn/app/wallet" target="_blank" style="display:inline-block;padding:14px 32px;background:#a8245e;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;border-radius:12px;box-shadow:0 6px 18px rgba(168,36,94,0.25);">
            Vào ví kiểm tra số dư
          </a>
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
