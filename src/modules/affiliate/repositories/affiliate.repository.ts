import type { AffiliateLinkStatus, ConvertOrigin } from '../../../common/domain/enums.js';

export interface AffiliateLinkRecord {
  id: string;
  subId1: string | null;
  subId2: string | null;
  subId3: string | null;
  subId4: string | null;
  subId5: string | null;
  originLink: string;
  cleanLink: string;
  convertOrigin: ConvertOrigin;
  fullLinkSystem: string | null;
  shortLink: string | null;
  longLink: string | null;
  failCode: number | null;
  affiliateLinkStatus: AffiliateLinkStatus | null;
  deleteAt: Date | null;
  deleteBy: string | null;
  createdAt: Date;
  createdBy: string | null;
  updatedAt: Date;
  updatedBy: string | null;
  userId: string;
  productId: string;
}

export interface CreateAffiliateLinkData {
  id?: string;
  userId: string;
  productId: string;
  originLink: string;
  cleanLink: string;
  subId1?: string;
  subId2?: string;
  subId3?: string;
  subId4?: string;
  subId5?: string;
  convertOrigin?: ConvertOrigin;
  fullLinkSystem?: string;
  shortLink?: string;
  longLink?: string;
  failCode?: number;
  affiliateLinkStatus?: AffiliateLinkStatus;
  createdBy?: string;
  updatedBy?: string;
}

export interface UpdateAffiliateLinkData {
  userId?: string;
  productId?: string;
  originLink?: string;
  cleanLink?: string;
  subId1?: string | null;
  subId2?: string | null;
  subId3?: string | null;
  subId4?: string | null;
  subId5?: string | null;
  convertOrigin?: ConvertOrigin;
  fullLinkSystem?: string | null;
  shortLink?: string | null;
  longLink?: string | null;
  failCode?: number | null;
  affiliateLinkStatus?: AffiliateLinkStatus | null;
  updatedBy?: string;
}

export interface FindAffiliateLinksOptions {
  skip: number;
  take: number;
  search?: string;
  id?: string;
  userId?: string;
  productId?: string;
  fullLinkSystem?: string;
  shortLink?: string;
  longLink?: string;
  convertOrigin?: ConvertOrigin;
  affiliateLinkStatus?: AffiliateLinkStatus;
  createdAtFrom?: Date;
  createdAtTo?: Date;
  updatedAtFrom?: Date;
  updatedAtTo?: Date;
}

export interface FindAffiliateLinksResult {
  items: AffiliateLinkRecord[];
  total: number;
}

export abstract class AffiliateRepository {
  abstract create(data: CreateAffiliateLinkData): Promise<AffiliateLinkRecord>;
  abstract findMany(options: FindAffiliateLinksOptions): Promise<FindAffiliateLinksResult>;
  abstract findById(id: string): Promise<AffiliateLinkRecord | null>;
  abstract update(id: string, data: UpdateAffiliateLinkData): Promise<AffiliateLinkRecord>;
  abstract softDelete(id: string, actorId: string): Promise<void>;
}
