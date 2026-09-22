import { HttpException } from '@nestjs/common';

export class AppError extends HttpException {
  constructor(
    readonly code: string,
    status: number,
    message: string,
    readonly stage?: string,
    cause?: unknown,
  ) {
    super({ code, message }, status, { cause });
  }
}
export function databaseError(error: unknown, stage?: string): AppError {
  const value = error as { code?: string; message?: string } | null;
  if (
    ['P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'ECONNREFUSED', 'ETIMEDOUT'].includes(
      value?.code ?? '',
    )
  )
    return new AppError(
      'DATABASE_UNAVAILABLE',
      503,
      'Dịch vụ tạm thời không sẵn sàng.',
      stage,
      error,
    );
  if (value?.code === 'P2002')
    return new AppError('RESOURCE_CONFLICT', 409, 'Dữ liệu đã tồn tại.', stage, error);
  if (value?.code === 'P2025')
    return new AppError('NOT_FOUND', 404, 'Không tìm thấy dữ liệu.', stage, error);
  if (
    ['P2021', 'P2022', '42P10'].includes(value?.code ?? '') ||
    value?.message?.includes('no unique or exclusion constraint')
  )
    return new AppError(
      'DATABASE_SCHEMA_MISMATCH',
      500,
      'Hệ thống cần được cập nhật. Vui lòng liên hệ hỗ trợ.',
      stage,
      error,
    );
  return new AppError(
    'INTERNAL_SERVER_ERROR',
    500,
    'Không thể xử lý yêu cầu. Vui lòng thử lại sau.',
    stage,
    error,
  );
}
