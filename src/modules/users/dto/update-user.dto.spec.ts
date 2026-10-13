import { validateSync } from 'class-validator';
import { UpdateUserDto } from './update-user.dto.js';

describe('UpdateUserDto', () => {
  it('accepts a missing phone and an explicit null phone', () => {
    const missing = new UpdateUserDto();
    missing.displayName = 'Tên mới';
    const cleared = new UpdateUserDto();
    cleared.phoneNumber = null;
    expect(validateSync(missing)).toHaveLength(0);
    expect(validateSync(cleared)).toHaveLength(0);
  });

  it('rejects an invalid phone number', () => {
    const dto = new UpdateUserDto();
    dto.phoneNumber = '123';
    expect(validateSync(dto).some((error) => error.property === 'phoneNumber')).toBe(true);
  });
});
