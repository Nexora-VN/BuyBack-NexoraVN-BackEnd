import { XMLParser, XMLBuilder, XMLValidator } from 'fast-xml-parser';

// Static SVG only: no script, animation, HTML, CSS, links or remote resources.
const tags = new Set('svg g defs title desc rect circle ellipse line polyline polygon path text tspan image use clipPath mask linearGradient radialGradient stop pattern'.split(' '));
const attributes = new Set('id x y x1 y1 x2 y2 cx cy r rx ry width height viewBox preserveAspectRatio d points transform fill fill-rule fill-opacity stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-dasharray stroke-dashoffset opacity font-family font-size font-weight font-style text-anchor dominant-baseline textLength lengthAdjust dx dy rotate clip-path clip-rule mask gradientUnits gradientTransform offset stop-color stop-opacity patternUnits patternTransform locked data-locked'.split(' '));
type Node = Record<string, unknown>;
export function sanitizeSvg(source: string, width: number, height: number, assetUrl: (path: string) => string): string {
  if (/<!DOCTYPE|<!ENTITY/i.test(source) || XMLValidator.validate(source) !== true) throw new Error('Invalid or unsafe SVG');
  const options = { preserveOrder: true, ignoreAttributes: false, attributeNamePrefix: '', processEntities: true };
  const tree = new XMLParser(options).parse(source) as Node[];
  function clean(nodes: Node[]): Node[] {
    return nodes.flatMap((node): Node[] => {
      const tag = Object.keys(node).find(key => key !== ':@') ?? '';
      if (tag === '#text') return [{ '#text': String(node[tag]) }];
      if (!tags.has(tag)) return [];
      const attrs: Record<string, string> = {};
      for (const [key, raw] of Object.entries((node[':@'] ?? {}) as Record<string, unknown>)) {
        const value = String(raw);
        if (key === 'href' || key === 'xlink:href') {
          if (/^#[\w.-]+$/.test(value)) attrs['xlink:href'] = value;
          else if (tag === 'image' && /^images\/[\w .()-]+\.(png|jpg|jpeg|gif|webp)$/i.test(value)) attrs['xlink:href'] = assetUrl(value);
        } else if (attributes.has(key) && !/[<>]/.test(value) && !/(?:url\s*\(\s*(?!#[\w.-]+\s*\))|javascript:|data:|https?:|\\)/i.test(value)) attrs[key] = value;
      }
      if (tag === 'svg') Object.assign(attrs, { xmlns: 'http://www.w3.org/2000/svg', 'xmlns:xlink': 'http://www.w3.org/1999/xlink', width: '100%', height: '100%', viewBox: `0 0 ${width} ${height}` });
      return [{ [tag]: clean(Array.isArray(node[tag]) ? node[tag] as Node[] : []), ':@': attrs }];
    });
  }
  return new XMLBuilder(options).build(clean(tree)) as string;
}
