import { Body, Controller, Get, Param, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { UserRole } from '../../common/domain/enums.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.js';
import { ReviewActivityDto } from './dto/review-activity.dto.js';
import { SubmitActivityAttemptDto } from './dto/submit-activity-attempt.dto.js';
import { UpdateActivityBoundsDto } from './dto/update-activity-bounds.dto.js';
import { RuntimeEventDto } from './dto/runtime-event.dto.js';
import { NotebookImportService } from './notebook-import.service.js';

@ApiTags('notebook-imports')
@Controller()
export class NotebookImportController {
  constructor(private readonly service: NotebookImportService) {}

  @Post('notebook-imports')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth('access-token')
  @ApiConsumes('multipart/form-data')
  async upload(@Req() request: FastifyRequest, @CurrentUser() actor: AuthenticatedUser) {
    const multipartRequest = request as FastifyRequest & { file: () => Promise<{ filename: string; toBuffer: () => Promise<Buffer> } | undefined> };
    const file = await multipartRequest.file();
    if (!file) throw new Error('Thiếu file notebook');
    return this.service.create(file.filename, await file.toBuffer(), actor);
  }

  @Get('notebook-imports')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth('access-token')
  list() { return this.service.list(); }

  @Get('notebook-imports/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth('access-token')
  find(@Param('id') id: string) { return this.service.find(id); }

  @Get('notebook-activities/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth('access-token')
  reviewList() { return this.service.reviewList(); }

  @Get('notebook-activities/catalog')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth('access-token')
  catalog() { return this.service.activityCatalog(); }

  @Patch('notebook-activities/:sourceHash/draft')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  draft(@Param('sourceHash') hash: string, @Body() input: ReviewActivityDto) { return this.service.approveActivity(hash, input.type, input.config, false, input.rendererMode); }

  @Patch('notebook-activities/:sourceHash')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth('access-token')
  approve(@Param('sourceHash') sourceHash: string, @Body() input: ReviewActivityDto) {
    return this.service.approveActivity(sourceHash, input.type, input.config, true, input.rendererMode);
  }

  @Patch('notebook-activities/instances/:activityId/bounds')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth('access-token')
  updateBounds(@Param('activityId') activityId: string, @Body() input: UpdateActivityBoundsDto) { return this.service.updateActivityBounds(activityId, input); }

  @Get('learn/courses/:slug')
  @UseGuards(OptionalJwtAuthGuard)
  learnerCourse(@Param('slug') slug: string, @CurrentUser() actor?: AuthenticatedUser) { return this.service.learnerCourse(slug, actor); }

  @Get('learn/activities/:activityId/flash-session')
  @UseGuards(OptionalJwtAuthGuard)
  flashSession(@Param('activityId') activityId: string, @CurrentUser() actor?: AuthenticatedUser) { return this.service.flashSession(activityId, actor); }

  @Get('learn/activities/:activityId/swf')
  async swf(@Param('activityId') activityId: string, @Res() res: FastifyReply) {
    const buffer = await this.service.getSwfBuffer(activityId);
    res.header('Content-Type', 'application/x-shockwave-flash');
    res.header('Cache-Control', 'public, max-age=86400');
    return res.send(buffer);
  }

  @Post('learn/activities/:activityId/runtime-events')
  @UseGuards(OptionalJwtAuthGuard)
  runtimeEvent(@Param('activityId') activityId: string, @Body() input: RuntimeEventDto, @CurrentUser() actor?: AuthenticatedUser) { return this.service.runtimeEvent(activityId, input.sessionId, input.event, actor, input.error); }

  @Post('learn/courses/:slug/pages/:pageId/view')
  @UseGuards(OptionalJwtAuthGuard)
  viewed(@Param('slug') slug: string, @Param('pageId') pageId: string, @CurrentUser() actor?: AuthenticatedUser) { return this.service.markPageViewed(slug, pageId, actor); }

  @Post('learn/activities/:activityId/attempts')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  attempt(@Param('activityId') activityId: string, @Body() input: SubmitActivityAttemptDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.submitAttempt(activityId, input.result, input.score, input.completed ?? false, actor);
  }
}
