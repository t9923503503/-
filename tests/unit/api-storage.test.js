import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { safeSetItem } from '../../shared/api.js';

describe('safeSetItem', () => {
  beforeEach(() => {
    globalThis.showToast = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows warning toast and returns false on quota errors', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      const err = new Error('Storage full');
      err.name = 'QuotaExceededError';
      throw err;
    });

    expect(safeSetItem('kotc3_demo', '{"x":1}')).toBe(false);
    expect(globalThis.showToast).toHaveBeenCalledWith(
      '⚠️ Память устройства переполнена. Удалите старые данные.',
      'warn',
      5000
    );
  });
});
