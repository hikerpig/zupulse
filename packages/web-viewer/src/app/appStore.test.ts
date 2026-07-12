import { describe, expect, it } from 'vitest';
import { createAppStore } from './appStore';

describe('createAppStore', () => {
  it('keeps theme state isolated per application', () => {
    const first = createAppStore('dark');
    const second = createAppStore('dark');

    first.getState().setTheme('light');

    expect(first.getState().theme).toBe('light');
    expect(second.getState().theme).toBe('dark');
  });
});
