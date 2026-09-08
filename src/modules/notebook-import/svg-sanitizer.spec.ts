import { sanitizeSvg } from './svg-sanitizer.js';

describe('static SVG sanitizer', () => {
  const sanitize = (source: string) => sanitizeSvg(source, 800, 600, path => `https://assets.test/${path}`);
  it('preserves geometry and rewrites only known local images', () => {
    const output = sanitize('<svg><g transform="translate(2,3)"><image href="images/a.png" width="4"/></g><text>A &amp; B</text></svg>');
    expect(output).toContain('viewBox="0 0 800 600"');
    expect(output).toContain('https://assets.test/images/a.png');
    expect(output).toContain('A &amp; B');
  });
  it('removes executable nodes, handlers, CSS and encoded external URLs', () => {
    const output = sanitize('<svg onload="alert(1)"><script>alert(1)</script><foreignObject/><animate/><image href="&#106;avascript:alert(1)"/><rect style="fill:url(https://evil.test)" fill="url(https://evil.test)"/></svg>');
    expect(output).not.toMatch(/alert|script|foreignObject|animate|onload|style|evil/);
  });
  it('rejects entities and malformed XML', () => {
    expect(() => sanitize('<!DOCTYPE svg><svg/>')).toThrow();
    expect(() => sanitize('<svg><g></svg>')).toThrow();
  });
});
