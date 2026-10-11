import { renderPasswordResetEmail } from './password-reset-email.template.js';

describe('password reset email', () => {
  it('shows the reset code and expiry in HTML and plain text', () => {
    const email = renderPasswordResetEmail('084275');
    expect(email.subject).toContain('Đặt lại mật khẩu');
    expect(email.text).toContain('Mã đặt lại mật khẩu: 084275');
    expect(email.html).toContain('084275');
    expect(email.html).toContain('10 phút');
    expect(email.html).toContain('#a8245e');
  });
});
