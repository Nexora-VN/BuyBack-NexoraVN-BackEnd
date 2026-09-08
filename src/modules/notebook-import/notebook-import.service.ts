import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { Queue, Worker, type Job } from 'bullmq';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma/prisma.service.js';
import { UserRole } from '../../common/domain/enums.js';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.js';
import { NotebookAnalyzerService } from './notebook-analyzer.service.js';
import { NotebookStorageService } from './notebook-storage.service.js';
import { gradeActivity, validateActivity } from './activity-grading.js';

type ImportJob = { importId: string };

function slugify(value: string): string {
  const normalized = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  return normalized.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'notebook-course';
}

@Injectable()
export class NotebookImportService implements OnModuleInit, OnModuleDestroy {
  private readonly queue: Queue<ImportJob>;
  private worker?: Worker<ImportJob>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: NotebookStorageService,
    private readonly analyzer: NotebookAnalyzerService,
    config: ConfigService,
  ) {
    const connection = { host: config.getOrThrow<string>('REDIS_HOST'), port: config.getOrThrow<number>('REDIS_PORT') };
    this.queue = new Queue<ImportJob>('notebook-imports', { connection });
    this.worker = new Worker<ImportJob>('notebook-imports', (job) => this.process(job), { connection });
  }

  async onModuleInit(): Promise<void> {
    await this.queue.waitUntilReady();
    await this.worker?.waitUntilReady();
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
  }

  async create(fileName: string, buffer: Buffer, actor: AuthenticatedUser) {
    if (!fileName.toLowerCase().endsWith('.notebook')) throw new BadRequestException('Chỉ chấp nhận tệp .notebook');
    if (buffer.byteLength === 0 || buffer.byteLength > 100 * 1024 * 1024) throw new BadRequestException('Dung lượng notebook phải nằm trong khoảng 1 B đến 100 MB');
    if (buffer.subarray(0, 4).toString('hex') !== '504b0304') throw new BadRequestException('Tệp .notebook không phải ZIP hợp lệ');
    const importRecord = await this.prisma.notebookImport.create({
      data: { sourceFileName: fileName, sourceKey: 'pending', createdById: actor.id, currentStep: 'Đang xếp hàng' },
    });
    const sourceKey = `source/${importRecord.id}/original.notebook`;
    await this.storage.put(sourceKey, buffer, 'application/zip');
    await this.prisma.notebookImport.update({ where: { id: importRecord.id }, data: { sourceKey } });
    await this.queue.add('analyze-notebook', { importId: importRecord.id }, { attempts: 2, removeOnComplete: 100, removeOnFail: 100 });
    return { id: importRecord.id, status: 'QUEUED', progress: 0 };
  }

  async list() {
    return this.prisma.notebookImport.findMany({ include: { course: true }, orderBy: { createdAt: 'desc' } });
  }

  async find(id: string) {
    const item = await this.prisma.notebookImport.findUnique({ where: { id }, include: { course: true } });
    if (!item) throw new NotFoundException('Không tìm thấy notebook import');
    return item;
  }

  async reviewList() {
    return this.prisma.activity.findMany({
      where: { status: { not: 'READY' } },
      distinct: ['sourceHash'],
      include: { page: { include: { course: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async activityCatalog() {
    const activities = await this.prisma.activity.findMany({
      distinct: ['sourceHash'],
      include: { definition: true, page: { include: { course: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const profiles = await this.prisma.flashRuntimeProfile.findMany({ where: { sourceHash: { in: activities.map(item => item.sourceHash) } } });
    const byHash = new Map(profiles.map(profile => [profile.sourceHash, profile]));
    return activities.map(activity => ({ ...activity, runtimeProfile: byHash.get(activity.sourceHash) ?? null }));
  }

  async approveActivity(sourceHash: string, type: string, config: Record<string, unknown>, publish = true, rendererMode: 'AUTO' | 'RUFFLE' | 'HTML' | 'DISABLED' = 'AUTO') {
    if (rendererMode === 'HTML') validateActivity(type, config);
    const definition = await this.prisma.activityDefinition.upsert({
      where: { sourceHash },
      create: { sourceHash, type, config: config as Prisma.InputJsonValue, rendererMode, status: publish ? 'PUBLISHED' : 'DRAFT', publishedAt: publish ? new Date() : null },
      update: { type, config: config as Prisma.InputJsonValue, rendererMode, status: publish ? 'PUBLISHED' : 'DRAFT', publishedAt: publish ? new Date() : null, version: { increment: 1 }, reviewedAt: new Date() },
    });
    await this.prisma.activity.updateMany({ where: { sourceHash }, data: { definitionId: definition.id, status: publish ? 'READY' : 'REQUIRES_REVIEW' } });
    return definition;
  }

  async flashSession(activityId: string, actor?: AuthenticatedUser) {
    const activity = await this.prisma.activity.findUnique({ where: { id: activityId }, include: { definition: true } });
    if (!activity) throw new NotFoundException('Không tìm thấy Flash activity');
    if (activity.definition?.rendererMode === 'DISABLED') throw new BadRequestException('Activity đã bị tắt');
    let profile = await this.prisma.flashRuntimeProfile.findUnique({ where: { sourceHash: activity.sourceHash } });
    if (!profile) {
      profile = await this.prisma.flashRuntimeProfile.upsert({
        where: { sourceHash: activity.sourceHash },
        create: { sourceHash: activity.sourceHash, storageKey: `runtime/swf/${activity.sourceHash}.swf`, swfVersion: 0 },
        update: {},
      });
    }
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const nonce = randomUUID().replaceAll('-', '');
    let sessionId: string = randomUUID();
    if (actor?.id) {
      const session = await this.prisma.flashRuntimeSession.create({ data: { activityId, userId: actor.id, nonce, expiresAt } });
      sessionId = session.id;
    }
    return {
      sessionId,
      nonce,
      expiresAt: expiresAt.toISOString(),
      swfUrl: `/api/backend/learn/activities/${activityId}/swf`,
      profile: { status: profile.status, swfVersion: profile.swfVersion, ruffleVersion: profile.ruffleVersion },
    };
  }

  async getSwfBuffer(activityId: string): Promise<Buffer> {
    const activity = await this.prisma.activity.findUnique({ where: { id: activityId } });
    if (!activity) throw new NotFoundException('Không tìm thấy activity');
    const profile = await this.prisma.flashRuntimeProfile.findUnique({ where: { sourceHash: activity.sourceHash } });
    if (!profile) throw new NotFoundException('Không tìm thấy file Flash');
    return this.storage.get(profile.storageKey);
  }

  async runtimeEvent(activityId: string, sessionId: string, event: 'OPENED' | 'LOADED' | 'ERROR' | 'HEARTBEAT', actor?: AuthenticatedUser, error?: string) {
    const now = new Date();
    let activeSeconds = 0;
    if (actor?.id) {
      const session = await this.prisma.flashRuntimeSession.findFirst({ where: { id: sessionId, activityId, userId: actor.id } });
      if (session && session.expiresAt >= now) {
        const data: Prisma.FlashRuntimeSessionUpdateInput = {};
        if (event === 'OPENED') data.openedAt = session.openedAt ?? now;
        if (event === 'LOADED') data.loadedAt = session.loadedAt ?? now;
        if (event === 'ERROR') data.lastError = (error ?? 'Ruffle runtime error').slice(0, 2000);
        if (event === 'HEARTBEAT' && session.loadedAt) {
          const previous = session.lastHeartbeatAt ?? session.loadedAt;
          const seconds = Math.max(0, Math.min(20, Math.floor((now.getTime() - previous.getTime()) / 1000)));
          data.lastHeartbeatAt = now;
          data.activeSeconds = { increment: seconds };
        }
        const updated = await this.prisma.flashRuntimeSession.update({ where: { id: session.id }, data });
        activeSeconds = updated.activeSeconds;
        if (activeSeconds >= 60 && !updated.completedAt) {
          await this.prisma.flashRuntimeSession.update({ where: { id: updated.id }, data: { completedAt: now } });
          await this.prisma.activityAttempt.create({ data: { userId: actor.id, activityId, definitionVersion: 0, result: { runtime: 'ruffle', activeSeconds }, score: 0, completedAt: now } });
        }
      }
    }
    if (event === 'LOADED') {
      const act = await this.prisma.activity.findUnique({ where: { id: activityId } });
      if (act) await this.prisma.flashRuntimeProfile.update({ where: { sourceHash: act.sourceHash }, data: { status: 'LOADED', error: null, testedAt: now } }).catch(() => {});
    }
    if (event === 'ERROR') {
      const act = await this.prisma.activity.findUnique({ where: { id: activityId } });
      if (act) await this.prisma.flashRuntimeProfile.update({ where: { sourceHash: act.sourceHash }, data: { status: 'FAILED', error: (error ?? 'Ruffle runtime error').slice(0, 2000), errorCount: { increment: 1 }, testedAt: now } }).catch(() => {});
    }
    return { activeSeconds, completed: activeSeconds >= 60 };
  }

  async updateActivityBounds(activityId: string, bounds: { x: number; y: number; width: number; height: number }) {
    return this.prisma.activity.update({ where: { id: activityId }, data: { bounds } });
  }

  async publicCourse(slug: string) {
    const course = await this.prisma.course.findUnique({
      where: { slug },
      include: { pages: { orderBy: { sortOrder: 'asc' }, include: { activities: { include: { definition: true } } } } },
    });
    if (!course) throw new NotFoundException('Không tìm thấy course');
    return course;
  }

  async publicPage(slug: string, pageId: string) {
    const course = await this.publicCourse(slug);
    const page = course.pages.find((candidate) => candidate.sourcePageId === pageId);
    if (!page) throw new NotFoundException('Không tìm thấy trang bài học');
    return page;
  }

  async learnerCourse(slug: string, actor?: AuthenticatedUser) {
    const course = await this.prisma.course.findUnique({
      where: { slug },
      include: {
        pages: {
          orderBy: { sortOrder: 'asc' },
          include: {
            activities: {
              include: {
                definition: true,
                attempts: actor?.id ? { where: { userId: actor.id }, orderBy: { createdAt: 'desc' }, take: 1 } : false,
              },
            },
          },
        },
        learnerProgresses: actor?.id ? { where: { userId: actor.id } } : false,
      },
    });
    if (!course) throw new NotFoundException('Không tìm thấy course');
    const profiles = await this.prisma.flashRuntimeProfile.findMany({ where: { sourceHash: { in: course.pages.flatMap(page => page.activities.map(activity => activity.sourceHash)) } } });
    const profilesByHash = new Map(profiles.map(profile => [profile.sourceHash, profile]));
    return {
      ...course,
      pages: course.pages.map((page) => ({
        ...page,
        activities: page.activities.map((activity) => ({
          ...activity,
          definition: activity.definition?.status === 'PUBLISHED' ? activity.definition : null,
          rendererMode: activity.definition?.rendererMode ?? 'AUTO',
          runtimeProfile: profilesByHash.get(activity.sourceHash) ?? {
            sourceHash: activity.sourceHash,
            storageKey: `runtime/swf/${activity.sourceHash}.swf`,
            swfVersion: 0,
            status: 'UNTESTED',
            ruffleVersion: '0.6.0',
          },
          latestAttempt: activity.attempts && activity.attempts[0]?.definitionVersion === activity.definition?.version ? activity.attempts[0] : null,
        })),
      })),
      learnerProgress: (course.learnerProgresses && course.learnerProgresses[0]) ?? { viewedPageIds: [], lastPageId: null },
    };
  }

  async markPageViewed(slug: string, pageId: string, actor?: AuthenticatedUser) {
    if (!actor?.id) return { viewedPageIds: [pageId], lastPageId: pageId };
    const course = await this.prisma.course.findUnique({ where: { slug }, include: { pages: true } });
    if (!course) throw new NotFoundException('Không tìm thấy course');
    const page = course.pages.find((item) => item.sourcePageId === pageId);
    if (!page) throw new NotFoundException('Không tìm thấy trang bài học');
    await this.prisma.learnerPageProgress.upsert({
      where: { userId_pageId: { userId: actor.id, pageId: page.id } },
      create: { userId: actor.id, pageId: page.id },
      update: { viewedAt: new Date() },
    });
    const previous = await this.prisma.learnerCourseProgress.findUnique({ where: { userId_courseId: { userId: actor.id, courseId: course.id } } });
    const seen = Array.isArray(previous?.viewedPageIds) ? previous.viewedPageIds.filter((id): id is string => typeof id === 'string') : [];
    const viewedPageIds = seen.includes(pageId) ? seen : [...seen, pageId];
    return this.prisma.learnerCourseProgress.upsert({
      where: { userId_courseId: { userId: actor.id, courseId: course.id } },
      create: { userId: actor.id, courseId: course.id, lastPageId: pageId, viewedPageIds },
      update: { lastPageId: pageId, viewedPageIds },
    });
  }

  async submitAttempt(activityId: string, result: Record<string, unknown>, score: number, completed: boolean, actor: AuthenticatedUser) {
    const activity = await this.prisma.activity.findUnique({ where: { id: activityId }, include: { definition: true } });
    if (!activity?.definition || activity.definition.status !== 'PUBLISHED') throw new BadRequestException('Hoạt động chưa được publish');
    const gradedScore = gradeActivity(activity.definition.type, activity.definition.config as Record<string, unknown>, result);
    return this.prisma.activityAttempt.create({
      data: {
        userId: actor.id,
        activityId,
        definitionVersion: activity.definition.version,
        result: result as Prisma.InputJsonValue,
        score: gradedScore,
        completedAt: completed && gradedScore === 100 ? new Date() : null,
      },
    });
  }

  private async process(job: Job<ImportJob>): Promise<void> {
    const item = await this.prisma.notebookImport.findUnique({ where: { id: job.data.importId } });
    if (!item) return;
    try {
      await this.prisma.notebookImport.update({ where: { id: item.id }, data: { status: 'EXTRACTING', progress: 10, currentStep: 'Đang giải nén notebook' } });
      const source = await this.storage.get(item.sourceKey);
      await this.prisma.notebookImport.update({ where: { id: item.id }, data: { status: 'ANALYZING', progress: 35, currentStep: 'Đang phân tích SVG, audio và activity' } });
      const analyzed = await this.analyzer.analyze(item.id, source);
      await this.prisma.notebookImport.update({ where: { id: item.id }, data: { status: 'PUBLISHING', progress: 75, currentStep: 'Đang publish nội dung web' } });
      const baseSlug = slugify(item.sourceFileName.replace(/\.notebook$/i, ''));
      const existing = await this.prisma.course.findUnique({ where: { slug: baseSlug } });
      const slug = existing && existing.importId !== item.id ? `${baseSlug}-${item.id.slice(0, 8)}` : baseSlug;
      const course = await this.prisma.course.upsert({
        where: { importId: item.id },
        create: { importId: item.id, title: item.sourceFileName.replace(/\.notebook$/i, ''), slug, outline: analyzed.outline },
        update: { title: item.sourceFileName.replace(/\.notebook$/i, ''), slug, outline: analyzed.outline },
      });
      await this.prisma.page.deleteMany({ where: { courseId: course.id } });
      let needsReview = false;
      for (const page of analyzed.pages) {
        const created = await this.prisma.page.create({
          data: {
            courseId: course.id,
            sourcePageId: page.sourcePageId,
            sortOrder: page.sortOrder,
            width: page.width,
            height: page.height,
            contentUrl: page.contentUrl,
            navigation: page.navigation,
            audioHotspots: page.audioHotspots,
            interactions: page.interactions,
          },
        });
        for (const activity of page.activities) {
          const definition = await this.prisma.activityDefinition.findUnique({ where: { sourceHash: activity.sourceHash } });
          await this.prisma.flashRuntimeProfile.upsert({
            where: { sourceHash: activity.sourceHash },
            create: { sourceHash: activity.sourceHash, storageKey: `runtime/swf/${activity.sourceHash}.swf`, swfVersion: activity.swfVersion },
            update: {},
          });
          needsReview ||= definition?.rendererMode === 'HTML' && definition.status !== 'PUBLISHED';
          await this.prisma.activity.create({
            data: {
              pageId: created.id,
              sourceHash: activity.sourceHash,
              sourcePath: activity.sourcePath,
              candidateType: activity.candidateType,
              confidence: activity.confidence,
              bounds: activity.bounds,
              status: definition?.rendererMode === 'HTML' && definition.status !== 'PUBLISHED' ? 'REQUIRES_REVIEW' : 'READY',
              definitionId: definition?.id,
            },
          });
        }
      }
      await this.prisma.notebookImport.update({
        where: { id: item.id },
        data: {
          status: needsReview ? 'REQUIRES_REVIEW' : 'COMPLETED', progress: 100,
          currentStep: needsReview ? 'Đã publish, cần duyệt activity' : 'Hoàn tất', report: analyzed.report, completedAt: new Date(),
        },
      });
    } catch (error) {
      await this.prisma.notebookImport.update({
        where: { id: item.id },
        data: { status: 'FAILED', currentStep: 'Import thất bại', error: error instanceof Error ? error.message : 'Unknown error' },
      });
      throw error;
    }
  }
}
