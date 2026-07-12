import { describe, expect, it } from 'vitest';
import { DEMO_APP_NAME } from './main';

describe('demo entry', () => {
  it('exposes a stable demo app name', () => {
    expect(DEMO_APP_NAME).toBe('Tab Viewer Demo');
  });
});
