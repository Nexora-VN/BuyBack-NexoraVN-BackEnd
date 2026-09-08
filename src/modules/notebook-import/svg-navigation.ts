import { XMLParser } from 'fast-xml-parser';
import type { ActivityBounds, PageInteraction } from './notebook.types.js';

type Node = { [key: string]: Node[] | Record<string, string> | string };
type Matrix = [number, number, number, number, number, number];
const identity: Matrix = [1, 0, 0, 1, 0, 0];
function multiply(a: Matrix, b: Matrix): Matrix {
  return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
}
function transform(value: string): Matrix {
  let result = identity;
  for (const match of value.matchAll(/(matrix|translate|scale|rotate)\s*\(([^)]*)\)/g)) {
    const n = match[2]!.trim().split(/[\s,]+/).map(Number); let next: Matrix = identity;
    if (match[1] === 'matrix' && n.length === 6) next = n as Matrix;
    if (match[1] === 'translate') next = [1,0,0,1,n[0] ?? 0,n[1] ?? 0];
    if (match[1] === 'scale') next = [n[0] ?? 1,0,0,n[1] ?? n[0] ?? 1,0,0];
    if (match[1] === 'rotate') {
      const theta = (n[0] ?? 0)*Math.PI/180; const c = Math.cos(theta); const s = Math.sin(theta); const x = n[1] ?? 0; const y = n[2] ?? 0;
      next = [c,s,-s,c,x-c*x+s*y,y-s*x-c*y];
    }
    result = multiply(result,next);
  }
  return result;
}
function union(boxes: ActivityBounds[]): ActivityBounds | null {
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map(b=>b.x)); const y = Math.min(...boxes.map(b=>b.y));
  return {x,y,width:Math.max(...boxes.map(b=>b.x+b.width))-x,height:Math.max(...boxes.map(b=>b.y+b.height))-y};
}
export function parseNavigation(svg: string): PageInteraction[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(svg)) throw new Error('SVG entity declarations are unsupported');
  const nodes = new XMLParser({ignoreAttributes:false,preserveOrder:true,attributeNamePrefix:'',processEntities:false}).parse(svg) as Node[];
  const links: PageInteraction[] = [];
  function visit(node: Node, parent: Matrix): {box: ActivityBounds | null; text: string} {
    const tag = Object.keys(node).find(k=>k !== ':@') ?? '';
    if (tag === '#text') return {box:null,text: typeof node[tag] === 'string' ? node[tag] : ''};
    const a = (node[':@'] ?? {}) as Record<string,string>;
    const matrix = multiply(parent,transform(a.transform ?? ''));
    const children = Array.isArray(node[tag]) ? node[tag] : [];
    const parts = children.map(child=>visit(child,matrix));
    const boxes = parts.flatMap(p=>p.box ? [p.box] : []);
    const num = (key: string) => Number.parseFloat(a[key] ?? '0') || 0;
    let points: [number,number][] = [];
    if (['image','rect','flash'].includes(tag)) points = [[num('x'),num('y')],[num('x')+num('width'),num('y')],[num('x'),num('y')+num('height')],[num('x')+num('width'),num('y')+num('height')]];
    // Linear absolute paths cover Notebook menu frames. Curved paths are left for manual review.
    if (tag === 'path' && a.d && !/[a-yA-Y]/.test(a.d.replace(/[MLZmlz]/g,'')) && !/[ml]/.test(a.d)) {
      const numbers = a.d.match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];
      points = numbers.reduce<[number,number][]>((all,_,i)=>i%2===0 && numbers[i+1] !== undefined ? [...all,[numbers[i]!,numbers[i+1]!]] : all,[]);
    }
    if (points.length) {
      const world = points.map(([x,y])=>({x:matrix[0]*x+matrix[2]*y+matrix[4],y:matrix[1]*x+matrix[3]*y+matrix[5],width:0,height:0}));
      const box = union(world); if (box) boxes.push(box);
    }
    const box = union(boxes); const text = parts.map(p=>p.text).filter(Boolean).join(' ').trim();
    if (a.shortcut?.startsWith('page://') && box && box.width>0 && box.height>0) links.push({id:`navigate-${links.length}`,type:'navigate',targetPageId:a.shortcut.slice(7).replace(/\.svg$/i,''),label:text || 'Chuyển trang',...box});
    return {box,text};
  }
  nodes.forEach(node=>visit(node,identity));
  return links;
}
