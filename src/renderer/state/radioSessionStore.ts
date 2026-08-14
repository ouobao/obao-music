import { create } from 'zustand';
import type {
  RadioSession,
  RadioSessionItem,
  RadioSessionPage,
  RemoteProviderId
} from '../../shared/musicTypes';

export type RadioSessionLoadingAction = 'start' | 'refill' | 'skip' | 'negative-feedback' | null;

interface RadioSessionState {
  session: RadioSession | null;
  items: RadioSessionItem[];
  seenItemIds: string[];
  seenSongIds: string[];
  hasMore: boolean;
  isLoading: boolean;
  loadingAction: RadioSessionLoadingAction;
  errorMessage: string | null;
  start: (providerId: RemoteProviderId) => Promise<RadioSessionPage | null>;
  refill: () => Promise<RadioSessionPage | null>;
  skip: (item: RadioSessionItem) => Promise<RadioSessionPage | null>;
  submitNegativeFeedback: (item: RadioSessionItem) => Promise<RadioSessionPage | null>;
  resetForTest: () => void;
}

type RadioSessionResult = RadioSessionPage | null;

const initialState = {
  session: null,
  items: [],
  seenItemIds: [],
  seenSongIds: [],
  hasMore: false,
  isLoading: false,
  loadingAction: null,
  errorMessage: null
} satisfies Pick<
  RadioSessionState,
  'session' | 'items' | 'seenItemIds' | 'seenSongIds' | 'hasMore' | 'isLoading' | 'loadingAction' | 'errorMessage'
>;

export const useRadioSessionStore = create<RadioSessionState>((set, get) => {
  let requestRevision = 0;
  const inFlightRequests = new Map<string, Promise<RadioSessionResult>>();

  const runDeduped = (
    requestKey: string,
    operation: () => Promise<RadioSessionResult>
  ): Promise<RadioSessionResult> => {
    const pending = inFlightRequests.get(requestKey);
    if (pending) {
      return pending;
    }

    const request = operation();
    inFlightRequests.set(requestKey, request);
    void request.finally(() => {
      if (inFlightRequests.get(requestKey) === request) {
        inFlightRequests.delete(requestKey);
      }
    });
    return request;
  };

  const beginRequest = (action: Exclude<RadioSessionLoadingAction, null>) => {
    const revision = ++requestRevision;
    set({
      isLoading: true,
      loadingAction: action,
      errorMessage: null
    });
    return revision;
  };

  const setFailure = (revision: number, message: string) => {
    if (requestRevision !== revision) {
      return;
    }

    set({
      isLoading: false,
      loadingAction: null,
      errorMessage: message
    });
  };

  const applyPage = (
    revision: number,
    session: RadioSession,
    page: RadioSessionPage,
    excludedItem?: RadioSessionItem
  ): RadioSessionResult => {
    const current = get();
    if (requestRevision !== revision || !isSameSession(current.session, session)) {
      return null;
    }
    if (!isSameSession(page.session, session)) {
      setFailure(revision, '电台会话响应与当前会话不一致');
      return null;
    }

    const merged = mergeRadioItems(current, page.items, excludedItem);
    set({
      session: page.session,
      items: merged.items,
      seenItemIds: merged.seenItemIds,
      seenSongIds: merged.seenSongIds,
      hasMore: page.hasMore,
      isLoading: false,
      loadingAction: null,
      errorMessage: null
    });
    return page;
  };

  return {
    ...initialState,

    start: (providerId) => runDeduped(`start:${providerId}`, async () => {
      const revision = beginRequest('start');
      const musicApi = getMusicApi();
      if (!musicApi) {
        setFailure(revision, '当前版本暂不支持电台会话');
        return null;
      }

      try {
        const result = await musicApi.startRadioSession(providerId);
        if (requestRevision !== revision) {
          return null;
        }
        if (!result.ok) {
          setFailure(revision, result.error.message);
          return null;
        }
        if (result.data.session.providerId !== providerId) {
          setFailure(revision, '电台会话来源不一致');
          return null;
        }

        const merged = mergeRadioItems(initialState, result.data.items);
        set({
          session: result.data.session,
          items: merged.items,
          seenItemIds: merged.seenItemIds,
          seenSongIds: merged.seenSongIds,
          hasMore: result.data.hasMore,
          isLoading: false,
          loadingAction: null,
          errorMessage: null
        });
        return result.data;
      } catch (error) {
        setFailure(revision, getErrorMessage(error, '电台会话创建失败'));
        return null;
      }
    }),

    refill: () => {
      const session = get().session;
      if (!session || !get().hasMore) {
        return Promise.resolve(null);
      }

      return runDeduped(`refill:${session.id}`, async () => {
        const revision = beginRequest('refill');
        const musicApi = getMusicApi();
        if (!musicApi) {
          setFailure(revision, '当前版本暂不支持电台会话');
          return null;
        }

        try {
          const result = await musicApi.refillRadioSession(session);
          if (requestRevision !== revision) {
            return null;
          }
          if (!result.ok) {
            setFailure(revision, result.error.message);
            return null;
          }
          return applyPage(revision, session, result.data);
        } catch (error) {
          setFailure(revision, getErrorMessage(error, '电台补流失败'));
          return null;
        }
      });
    },

    skip: (item) => runItemCommand('skip', item, (musicApi, session) => (
      musicApi.skipRadioSessionItem(session, item)
    )),

    submitNegativeFeedback: (item) => runItemCommand('negative-feedback', item, (musicApi, session) => (
      musicApi.submitRadioNegativeFeedback(session, item)
    )),

    resetForTest: () => {
      requestRevision += 1;
      inFlightRequests.clear();
      set(initialState);
    }
  };

  function runItemCommand(
    action: Exclude<RadioSessionLoadingAction, 'start' | 'refill' | null>,
    item: RadioSessionItem,
    request: (
      musicApi: NonNullable<ReturnType<typeof getMusicApi>>,
      session: RadioSession
    ) => ReturnType<NonNullable<ReturnType<typeof getMusicApi>>['skipRadioSessionItem']>
  ): Promise<RadioSessionResult> {
    const state = get();
    const session = state.session;
    if (!session || !containsRadioItem(state.items, session, item)) {
      return Promise.resolve(null);
    }

    return runDeduped(`${action}:${session.id}:${item.id}`, async () => {
      const revision = beginRequest(action);
      const musicApi = getMusicApi();
      if (!musicApi) {
        setFailure(revision, '当前版本暂不支持电台会话');
        return null;
      }

      try {
        const result = await request(musicApi, session);
        if (requestRevision !== revision) {
          return null;
        }
        if (!result.ok) {
          setFailure(revision, result.error.message);
          return null;
        }
        return applyPage(revision, session, result.data, item);
      } catch (error) {
        setFailure(revision, getErrorMessage(
          error,
          action === 'skip' ? '电台跳过失败' : '电台负反馈失败'
        ));
        return null;
      }
    });
  }
});

function getMusicApi() {
  return typeof window === 'undefined' ? undefined : window.musicPlayer?.music;
}

function isSameSession(first: RadioSession | null, second: RadioSession): boolean {
  if (!first) {
    return false;
  }

  return first.id === second.id && first.providerId === second.providerId;
}

function containsRadioItem(
  items: readonly RadioSessionItem[],
  session: RadioSession,
  item: RadioSessionItem
): boolean {
  if (
    item.sourceContext.type !== 'radio'
    || item.sourceContext.providerId !== session.providerId
    || item.sourceContext.radioSessionId !== session.id
    || item.sourceContext.radioItemId !== item.id
  ) {
    return false;
  }

  return items.some((candidate) => (
    candidate.id === item.id
    && candidate.song.id === item.song.id
    && candidate.sourceContext.type === 'radio'
    && candidate.sourceContext.providerId === session.providerId
    && candidate.sourceContext.radioSessionId === session.id
    && candidate.sourceContext.radioItemId === candidate.id
  ));
}

function mergeRadioItems(
  state: Pick<RadioSessionState, 'items' | 'seenItemIds' | 'seenSongIds'>,
  incomingItems: readonly RadioSessionItem[],
  excludedItem?: RadioSessionItem
) {
  const excludedItemId = excludedItem?.id;
  const excludedSongId = excludedItem?.song.id;
  const seenItemIds = new Set(state.seenItemIds);
  const seenSongIds = new Set(state.seenSongIds);
  const items = state.items.filter((item) => (
    item.id !== excludedItemId && item.song.id !== excludedSongId
  ));

  for (const item of incomingItems) {
    if (seenItemIds.has(item.id) || seenSongIds.has(item.song.id)) {
      continue;
    }

    seenItemIds.add(item.id);
    seenSongIds.add(item.song.id);
    items.push(item);
  }

  return {
    items,
    seenItemIds: [...seenItemIds],
    seenSongIds: [...seenSongIds]
  };
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
