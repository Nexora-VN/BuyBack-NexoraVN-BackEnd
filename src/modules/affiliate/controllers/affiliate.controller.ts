import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
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
import { CreateAffiliateLinkDto } from '../dto/create-affiliate-link.dto.js';
import { ListAffiliateLinksQueryDto } from '../dto/list-affiliate-query.dto.js';
import { UpdateAffiliateLinkDto } from '../dto/update-affiliate-link.dto.js';
import {
  AffiliateLinkListResponseDto,
  AffiliateResponseDto,
} from '../dto/affiliate-response.dto.js';
import { AffiliateService } from '../services/affiliate.service.js';

@ApiTags('affiliate')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@ApiForbiddenResponse({ description: 'ADMIN or SUPER_ADMIN role required' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('affiliate')
export class AffiliateController {
  constructor(private readonly affiliateService: AffiliateService) {}

  @Post()
  @ApiOperation({ summary: 'Create an affiliate link' })
  @ApiCreatedResponse({ type: AffiliateResponseDto })
  create(
    @Body() input: CreateAffiliateLinkDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<AffiliateResponseDto> {
    return this.affiliateService.create(input, actor.id);
  }

  @Get()
  @ApiOperation({ summary: 'List affiliate links with search filters and pagination' })
  @ApiOkResponse({ type: AffiliateLinkListResponseDto })
  findMany(@Query() query: ListAffiliateLinksQueryDto): Promise<AffiliateLinkListResponseDto> {
    return this.affiliateService.findMany(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an affiliate link by ID' })
  @ApiOkResponse({ type: AffiliateResponseDto })
  @ApiNotFoundResponse({ description: 'Affiliate link not found' })
  findById(@Param('id') id: string): Promise<AffiliateResponseDto> {
    return this.affiliateService.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an affiliate link' })
  @ApiOkResponse({ type: AffiliateResponseDto })
  @ApiNotFoundResponse({ description: 'Affiliate link not found' })
  update(
    @Param('id') id: string,
    @Body() input: UpdateAffiliateLinkDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<AffiliateResponseDto> {
    return this.affiliateService.update(id, input, actor.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an affiliate link' })
  @ApiNoContentResponse({ description: 'Affiliate link deleted' })
  @ApiNotFoundResponse({ description: 'Affiliate link not found' })
  delete(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser): Promise<void> {
    return this.affiliateService.delete(id, actor.id);
  }
}
