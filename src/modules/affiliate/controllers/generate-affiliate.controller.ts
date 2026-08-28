import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '../../../common/domain/enums.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.js';
import { GenerateAffiliateService } from '../services/generate-affiiliate.service.js';
import { ErrorCode } from '../../../common/domain/error-code.js';

@ApiTags('generate-affiliate')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@ApiForbiddenResponse({ description: 'ADMIN or SUPER_ADMIN role required' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('generate-affiliate')
export class GenerateAffiliateController {
  constructor(private readonly generateAffiliateService: GenerateAffiliateService) {}

  @Post()
  @Roles(UserRole.USER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create an affiliate link' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          example: 'https://vn.shp.ee/NWRHsAhy',
        },
      },
      required: ['url'],
    },
  })
  @ApiCreatedResponse()
  create(
    @Body() input: { url: string },
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<{ link: string | null; code: ErrorCode | null }> {
    return this.generateAffiliateService.generateAffiliateLinkBySystem(input.url, actor.id);
  }
}
