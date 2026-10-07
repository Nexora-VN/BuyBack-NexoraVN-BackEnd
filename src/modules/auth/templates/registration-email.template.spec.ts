import { renderRegistrationEmail } from './registration-email.template.js';

describe('registration email template', () => {
  it('includes the code and expiry in HTML and plain text', () => {
    const email = renderRegistrationEmail('084275');
    expect(email.subject).toContain('Piggy Back');
    expect(email.text).toContain('Mã xác thực: 084275');
    expect(email.text).toContain('10 phút');
    expect(email.html).toContain('084275');
    expect(email.html).toContain('10 phút');
    expect(email.html).toContain('#a8245e');
  });

  it('escapes dynamic HTML content', () => {
    const email = renderRegistrationEmail('<script>');
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
  });
});
