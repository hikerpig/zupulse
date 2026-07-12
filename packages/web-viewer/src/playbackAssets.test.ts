// Migrated with the shared asset configuration.
import { describe, expect, it } from 'vitest';
import { ALPHATAB_ASSETS } from './playbackAssets';

describe('alphaTab playback assets', () => {
  it('uses app-relative offline asset URLs', () => {
    expect(ALPHATAB_ASSETS).toEqual({
      scriptFile: '/alphatab/alphaTab.mjs',
      fontDirectory: '/alphatab/font/',
      soundFont: '/alphatab/soundfont/sonivox.sf3',
    });
  });
});
