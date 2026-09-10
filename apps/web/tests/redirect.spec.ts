import { describe, expect, it } from 'vitest';
import { safeRedirectPath } from '../app/utils/redirect';

describe('safeRedirectPath', () => {
  it('keeps a path, query and hash included', () => {
    expect(safeRedirectPath('/admin/cases?page=2#row-3', '/app')).toBe('/admin/cases?page=2#row-3');
  });

  it('refuses anything that leaves the site', () => {
    for (const hostile of [
      'https://evil.example/steal',
      '//evil.example',
      '/\\evil.example',
      'javascript:alert(1)',
      'app/cases',
      '',
    ]) {
      expect(safeRedirectPath(hostile, '/app')).toBe('/app');
    }
  });

  it('refuses a control character and a repeated parameter', () => {
    expect(safeRedirectPath('/app\nSet-Cookie: x', '/app/cases')).toBe('/app/cases');
    expect(safeRedirectPath(['/a', '/b'], '/app/cases')).toBe('/app/cases');
    expect(safeRedirectPath(undefined, '/app/cases')).toBe('/app/cases');
  });
});
