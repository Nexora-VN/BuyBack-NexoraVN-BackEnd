import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import * as unzipper from 'unzipper';
import type { ActivityBounds, AudioHotspot, CourseOutline, PageInteraction, ParsedActivity, ParsedPage } from './notebook.types.js';
import { NotebookStorageService } from './notebook-storage.service.js';
import { parseNavigation } from './svg-navigation.js';
import { sanitizeSvg } from './svg-sanitizer.js';

type ZipEntry = { path: string; type: string; uncompressedSize: number; buffer: () => Promise<Buffer> };

const MAX_ENTRIES = 10_000;
const MAX_EXPANDED_BYTES = 1024 * 1024 * 1024;

function attr(tag: string, name: string): string | undefined {
  return new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1];
}

function numberAttr(tag: string, name: string): number {
  return Number.parseFloat(attr(tag, name) ?? '0') || 0;
}

function mime(path: string): string {
  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.jpeg') || path.endsWith('.jpg')) return 'image/jpeg';
  if (path.endsWith('.mp3')) return 'audio/mpeg';
  return 'application/octet-stream';
}

function normalizedPath(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\.\//, '');
}

function pageId(path: string): string {
  return normalizedPath(path).replace(/^.*\//, '').replace(/\.svg$/i, '');
}

function bounds(tag: string): ActivityBounds {
  return {
    x: numberAttr(tag, 'x'),
    y: numberAttr(tag, 'y'),
    width: numberAttr(tag, 'width'),
    height: numberAttr(tag, 'height'),
  };
}

function textContent(value: string): string[] {
  return [...value.matchAll(/<tspan[^>]*>([^<]+)/g)]
    .map((match) => match[1]?.trim() ?? '')
    .filter(Boolean);
}

function candidateFor(svg: string): { type: string | null; confidence: number } {
  const text = textContent(svg).join(' ').toLowerCase();
  if (text.includes('matching game')) return { type: 'matching-select', confidence: 0.85 };
  if (text.includes('fill in the blocks')) return { type: 'fill-blank', confidence: 0.85 };
  return { type: null, confidence: 0 };
}

@Injectable()
export class NotebookAnalyzerService {
  constructor(private readonly storage: NotebookStorageService) {}

  async analyze(importId: string, source: Buffer): Promise<{
    title: string;
    pages: ParsedPage[];
    outline: CourseOutline;
    report: Record<string, number>;
  }> {
    if (source.subarray(0, 4).toString('hex') !== '504b0304') {
      throw new BadRequestException('Tệp .notebook phải là ZIP hợp lệ');
    }
    const directory = await unzipper.Open.buffer(source);
    const entries = directory.files as unknown as ZipEntry[];
    const totalBytes = entries.reduce((total, entry) => total + entry.uncompressedSize, 0);
    if (entries.length > MAX_ENTRIES || totalBytes > MAX_EXPANDED_BYTES) {
      throw new BadRequestException('Notebook vượt giới hạn an toàn khi giải nén');
    }
    for (const entry of entries) {
      const path = normalizedPath(entry.path);
      if (path.startsWith('/') || path.split('/').includes('..')) {
        throw new BadRequestException('Notebook chứa đường dẫn không an toàn');
      }
    }

    const byPath = new Map(entries.filter((entry) => entry.type === 'File').map((entry) => [normalizedPath(entry.path), entry]));
    const manifest = byPath.get('imsmanifest.xml');
    if (!manifest) throw new BadRequestException('Notebook thiếu imsmanifest.xml');
    const manifestXml = (await manifest.buffer()).toString('utf8');
    const orderedPaths = [...manifestXml.matchAll(/<file\s+href="([^"]+)"/g)]
      .map((match) => normalizedPath(match[1] ?? ''))
      .filter((path, index, array) => path.endsWith('.svg') && array.indexOf(path) === index && byPath.has(path));
    const pagePaths = orderedPaths.length
      ? orderedPaths
      : [...byPath.keys()].filter((path) => /^page\d+\.svg$/i.test(path)).sort();

    const uploaded = new Set<string>();
    const putPublished = async (path: string): Promise<string> => {
      const sourceEntry = byPath.get(normalizedPath(path));
      if (!sourceEntry) return '';
      const key = `published/${importId}/${normalizedPath(path)}`;
      if (!uploaded.has(key)) {
        uploaded.add(key);
        await this.storage.put(key, await sourceEntry.buffer(), mime(path));
      }
      return this.storage.publicUrl(key);
    };

    const sourceKeyByPath = new Map<string, string>();
    for (const [path, entry] of byPath) {
      const key = `extracted/${importId}/${path}`;
      await this.storage.put(key, await entry.buffer(), mime(path));
      sourceKeyByPath.set(path, key);
    }

    const pages: ParsedPage[] = [];
    const hashes = new Set<string>();
    const imageAssetCount = [...byPath.keys()].filter((path) => /^images\/.*\.(png|jpe?g|gif|webp)$/i.test(path)).length;
    const audioAssetCount = [...byPath.keys()].filter((path) => /^sounds\/.*\.mp3$/i.test(path)).length;
    let flashReferences = 0;
    for (const [sortOrder, path] of pagePaths.entries()) {
      const entry = byPath.get(path);
      if (!entry) continue;
      const original = (await entry.buffer()).toString('utf8');
      const rootTag = /<svg\b[^>]*>/.exec(original)?.[0] ?? '<svg>';
      const width = numberAttr(rootTag, 'width') || 800;
      const height = numberAttr(rootTag, 'height') || 600;
      const parsedNavigation = parseNavigation(original);
      const navigation = parsedNavigation.map(link => ({targetPageId: link.targetPageId!, label: link.label}));
      const audioHotspots: AudioHotspot[] = [];
      const interactions: PageInteraction[] = [...parsedNavigation];
      for (const image of original.matchAll(/<image\b[^>]*>/g)) {
        const tag = image[0];
        const sourceAudio = attr(tag, 'soundtoken');
        if (!sourceAudio) continue;
        const audioUrl = await putPublished(sourceAudio);
        if (!audioUrl) continue;
        const hotspot = { ...bounds(tag), audioUrl, label: sourceAudio.replace(/^sounds\//, '').replace(/\.mp3$/i, '') };
        audioHotspots.push(hotspot);
        interactions.push({ id: `audio-${audioHotspots.length - 1}`, type: 'play-audio', ...hotspot });
      }
      const activities: ParsedActivity[] = [];
      for (const flash of original.matchAll(/<flash\b[^>]*>/g)) {
        const tag = flash[0];
        const sourcePath = normalizedPath(attr(tag, 'xlink:href') ?? '');
        const sourceEntry = byPath.get(sourcePath);
        if (!sourceEntry) continue;
        const sourceBuffer = await sourceEntry.buffer();
        const sourceHash = createHash('sha256').update(sourceBuffer).digest('hex');
        // SWF header byte 3 is the Flash version for both FWS and CWS files.
        const swfVersion = sourceBuffer.length >= 4 && ['FWS', 'CWS', 'ZWS'].includes(sourceBuffer.subarray(0, 3).toString('ascii')) ? sourceBuffer[3]! : 0;
        await this.storage.put(`runtime/swf/${sourceHash}.swf`, sourceBuffer, 'application/x-shockwave-flash');
        hashes.add(sourceHash);
        flashReferences += 1;
        const candidate = candidateFor(original);
        activities.push({ sourcePath, sourceHash, candidateType: candidate.type, confidence: candidate.confidence, bounds: bounds(tag), swfVersion });
      }
      const sanitized = sanitizeSvg(original, width, height, (asset) => this.storage.publicUrl(`published/${importId}/${asset}`));
      for (const imagePath of [...original.matchAll(/(?:xlink:href|href)="(images\/[^"\s]+)"/g)].map((match) => match[1] ?? '')) {
        await putPublished(imagePath);
      }
      for (const audioPath of [...original.matchAll(/soundtoken="([^"]+)"/g)].map((match) => match[1] ?? '')) {
        await putPublished(audioPath);
      }
      const contentKey = `published/${importId}/${path}`;
      await this.storage.put(contentKey, sanitized, 'image/svg+xml');
      pages.push({
        sourcePageId: pageId(path), sortOrder, width, height, contentUrl: this.storage.publicUrl(contentKey), navigation, audioHotspots, interactions, activities,
      });
    }
    const root = pages.length
      ? pages.reduce((best, current) => current.navigation.length > best.navigation.length ? current : best)
      : undefined;
    const lessons = (root?.navigation ?? []).map((link) => {
      const lesson = pages.find((page) => page.sourcePageId === link.targetPageId);
      return { pageId: link.targetPageId, label: link.label, children: lesson?.navigation.map((child) => child.targetPageId) ?? [] };
    });
    return {
      title: textContent((await (byPath.get('metadata.xml')?.buffer() ?? Promise.resolve(Buffer.from('')))).toString('utf8'))[0] ?? 'SMART Notebook course',
      pages,
      outline: { rootPageId: root?.sourcePageId ?? pages[0]?.sourcePageId ?? '', lessons },
      report: { pages: pages.length, images: imageAssetCount, audio: audioAssetCount, flashReferences, uniqueFlash: hashes.size },
    };
  }
}
