import { beforeEach, describe, expect, it } from 'vitest';
import { useSearchHistoryStore } from './searchHistoryStore';

describe('search history store', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useSearchHistoryStore.getState().resetForTest();
  });

  it('records normalized queries once and keeps the newest first', () => {
    useSearchHistoryStore.getState().record('  夜曲  ');
    useSearchHistoryStore.getState().record('晴天');
    useSearchHistoryStore.getState().record('夜曲');

    expect(useSearchHistoryStore.getState().entries).toEqual(['夜曲', '晴天']);
  });

  it('persists entries and restores them into a fresh in-memory state', () => {
    useSearchHistoryStore.getState().record('稻香');
    useSearchHistoryStore.getState().resetForTest();

    useSearchHistoryStore.getState().hydrate();

    expect(useSearchHistoryStore.getState().entries).toEqual(['稻香']);
  });

  it('removes individual entries and clears the persisted history', () => {
    useSearchHistoryStore.getState().record('七里香');
    useSearchHistoryStore.getState().record('青花瓷');
    useSearchHistoryStore.getState().remove('七里香');

    expect(useSearchHistoryStore.getState().entries).toEqual(['青花瓷']);

    useSearchHistoryStore.getState().clear();
    useSearchHistoryStore.getState().resetForTest();
    useSearchHistoryStore.getState().hydrate();

    expect(useSearchHistoryStore.getState().entries).toEqual([]);
  });
});
