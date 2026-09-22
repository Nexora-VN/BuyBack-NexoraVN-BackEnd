import { AppError } from '../../../common/observability/app-error.js';
import { event } from '../../../common/observability/observability.js';
import {
  productProviderReferenceSchema,
  type ProductProviderReference,
} from '../contracts/product-provider.contract.js';

const PRODUCT_PROVIDER_URL = 'https://data.addlivetag.com/product-data/product-data.php';
const REQUEST_TIMEOUT_MS = 10_000;

export class ProductProviderError extends AppError {
  constructor(
    message: string,
    options?: ErrorOptions,
    code = 'PRODUCT_PROVIDER_INVALID_RESPONSE',
    status = 502,
  ) {
    super(code, status, message, 'fetch_product', options?.cause);
    this.name = 'ProductProviderError';
  }
}

export const getProductByItemId = async (
  productId: string | number | bigint,
): Promise<ProductProviderReference> => {
  const fullUrl = new URL(PRODUCT_PROVIDER_URL);
  fullUrl.searchParams.set('item_id', normalizeItemId(productId));

  return fetchProduct(fullUrl);
};

export const getProductByUrl = async (url: string): Promise<ProductProviderReference> => {
  const fullUrl = new URL(PRODUCT_PROVIDER_URL);
  fullUrl.searchParams.set('url', url);
  return fetchProduct(fullUrl);
};

async function fetchProduct(fullUrl: URL): Promise<ProductProviderReference> {
  const started = performance.now();
  let response: Response;
  try {
    response = await fetch(fullUrl, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const timeout = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
    throw new ProductProviderError(
      'Không thể kết nối API thông tin sản phẩm',
      { cause: error },
      timeout ? 'AFFILIATE_PROVIDER_TIMEOUT' : 'AFFILIATE_PROVIDER_ERROR',
      timeout ? 504 : 502,
    );
  }

  event('debug', 'provider.response', {
    provider: 'AddLiveTag',
    stage: 'fetch_product',
    statusCode: response.status,
    durationMs: Math.round(performance.now() - started),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new ProductProviderError('API thông tin sản phẩm tạm thời không khả dụng');
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new ProductProviderError('API thông tin sản phẩm trả JSON không hợp lệ', {
      cause: error,
    });
  }

  const result = productProviderReferenceSchema.safeParse(payload);
  if (!result.success) {
    throw new ProductProviderError('Payload API thông tin sản phẩm không đúng contract');
  }

  return result.data;
}

export const getProductByAffProductId = getProductByItemId;

function normalizeItemId(productId: string | number | bigint): string {
  if (typeof productId === 'number' && !Number.isSafeInteger(productId)) {
    throw new ProductProviderError('productId dạng number phải là số nguyên an toàn');
  }

  const itemId = String(productId);
  if (!/^\d+$/.test(itemId)) {
    throw new ProductProviderError('productId chỉ được chứa chữ số');
  }

  return itemId;
}
