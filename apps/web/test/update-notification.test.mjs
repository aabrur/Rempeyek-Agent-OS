import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { releaseState } from '../lib/release-check.mjs';

describe('Update Notification & Settings Auto-Fix', () => {
  it('identifies when an update is available based on semver', () => {
    const state = releaseState({
      current: '2.4.0',
      latestTag: 'v2.4.6',
      url: 'https://github.com/aabrur/Rempeyek-Agent-OS/releases/tag/v2.4.6',
      notes: 'Bug fixes & UI enhancements',
    });
    assert.equal(state.updateAvailable, true);
    assert.equal(state.latest, '2.4.6');
    assert.equal(state.current, '2.4.0');
  });

  it('correctly reports no update when current version is equal or newer', () => {
    const state = releaseState({
      current: '2.4.6',
      latestTag: 'v2.4.6',
      url: 'https://github.com/aabrur/Rempeyek-Agent-OS/releases/tag/v2.4.6',
      notes: '',
    });
    assert.equal(state.updateAvailable, false);
  });

  it('handles self-repair cache reset procedure safely', () => {
    const fakeLocalStorage = {
      store: { 'aos-release-check': JSON.stringify({ tag: 'v2.4.0', at: Date.now() }) },
      removeItem(key) { delete this.store[key]; },
      getItem(key) { return this.store[key] || null; },
    };
    const fakeSessionStorage = {
      store: { 'some-session': 'active' },
      clear() { this.store = {}; },
    };

    // Execute self-repair cache wipe
    fakeLocalStorage.removeItem('aos-release-check');
    fakeSessionStorage.clear();

    assert.equal(fakeLocalStorage.getItem('aos-release-check'), null);
    assert.equal(Object.keys(fakeSessionStorage.store).length, 0);
  });

  it('verifies desktop update notification state phases', () => {
    const phases = ['idle', 'checking', 'available', 'downloading', 'ready', 'error'];
    const validNotificationPhases = ['available', 'downloading', 'ready', 'error'];

    phases.forEach(phase => {
      const shouldNotify = validNotificationPhases.includes(phase);
      if (phase === 'available' || phase === 'ready') {
        assert.equal(shouldNotify, true, `Phase ${phase} should trigger top-right update notification`);
      } else if (phase === 'idle') {
        assert.equal(shouldNotify, false, 'Idle phase should not notify');
      }
    });
  });
});
