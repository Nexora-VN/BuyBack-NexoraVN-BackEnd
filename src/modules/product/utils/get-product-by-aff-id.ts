import { z } from 'zod';
import {
  productProviderReferenceSchema,
  type ProductProviderReference,
} from '../contracts/product-provider.contract.js';

const PRODUCT_PROVIDER_URL = 'https://data.addlivetag.com/product-data/product-data.php';
const REQUEST_TIMEOUT_MS = 10_000;

export class ProductProviderError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ProductProviderError';
  }
}

export const getProductByItemId = async (
  productId: string | number | bigint,
): Promise<ProductProviderReference> => {
  const fullUrl = new URL(PRODUCT_PROVIDER_URL);
  fullUrl.searchParams.set('item_id', normalizeItemId(productId));

  let response: Response;
  try {
    response = await fetch(fullUrl, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new ProductProviderError('Không thể kết nối API thông tin sản phẩm', { cause: error });
  }

  if (!response.ok) {
    throw new ProductProviderError(
      `API thông tin sản phẩm trả HTTP ${response.status} ${response.statusText}`,
    );
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
    throw new ProductProviderError(
      `Payload API thông tin sản phẩm không đúng contract: ${z.prettifyError(result.error)}`,
    );
  }

  return result.data;
};

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
