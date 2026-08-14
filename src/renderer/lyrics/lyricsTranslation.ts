import type { LyricLine } from '../../shared/musicTypes';

const translationToleranceMs = 1500;

interface TimedTranslation {
  index: number;
  startMs: number;
}

interface TranslationTimeGroup {
  active: boolean;
  indexes: number[];
  nextUnusedOffset: number;
  startMs: number;
}

export function createTranslationMap(
  lines: LyricLine[],
  translatedLines: LyricLine[],
  plainTranslatedLines: string[] = []
): Map<number, string> {
  const translationIndex = new TranslationIndex(translatedLines);
  const translationsByStartMs = new Map<number, string>();

  lines.forEach((line, lineIndex) => {
    let translationLineIndex = translationIndex.takeClosest(line.startMs);
    const indexedTranslation = translatedLines[lineIndex];

    if (translationLineIndex < 0 && indexedTranslation && !translationIndex.isUsed(lineIndex)) {
      translationLineIndex = lineIndex;
      translationIndex.take(lineIndex);
    }

    if (translationLineIndex >= 0) {
      const translation = translatedLines[translationLineIndex];
      if (translation) {
        translationsByStartMs.set(line.startMs, translation.text);
      }
      return;
    }

    const plainTranslation = plainTranslatedLines[lineIndex];
    if (plainTranslation) {
      translationsByStartMs.set(line.startMs, plainTranslation);
    }
  });

  return translationsByStartMs;
}

class TranslationIndex {
  private readonly groupByTranslationIndex: Int32Array;
  private readonly groups: TranslationTimeGroup[];
  private readonly nextParents: number[];
  private readonly previousParents: number[];
  private readonly used: Uint8Array;

  constructor(lines: LyricLine[]) {
    this.used = new Uint8Array(lines.length);
    this.groupByTranslationIndex = new Int32Array(lines.length);
    this.groupByTranslationIndex.fill(-1);
    this.groups = createTimeGroups(lines, this.groupByTranslationIndex);
    this.nextParents = Array.from({ length: this.groups.length + 1 }, (_, index) => index);
    this.previousParents = Array.from({ length: this.groups.length + 1 }, (_, index) => index);
  }

  isUsed(index: number): boolean {
    return this.used[index] === 1;
  }

  take(index: number): void {
    if (this.isUsed(index)) {
      return;
    }

    this.used[index] = 1;
    const groupIndex = this.groupByTranslationIndex[index];
    if (groupIndex >= 0) {
      this.refreshGroup(groupIndex);
    }
  }

  takeClosest(startMs: number): number {
    if (!Number.isFinite(startMs) || this.groups.length === 0) {
      return -1;
    }

    const insertionIndex = lowerBoundTimeGroup(this.groups, startMs);
    const nextGroupIndex = findSetRoot(this.nextParents, insertionIndex);
    const previousGroupIndex = findSetRoot(this.previousParents, insertionIndex) - 1;
    let closestIndex = -1;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const groupIndex of [previousGroupIndex, nextGroupIndex]) {
      const group = this.groups[groupIndex];
      if (!group?.active) {
        continue;
      }

      const candidateIndex = group.indexes[group.nextUnusedOffset];
      const distance = Math.abs(group.startMs - startMs);
      if (
        distance <= translationToleranceMs &&
        (distance < closestDistance || (distance === closestDistance && candidateIndex < closestIndex))
      ) {
        closestIndex = candidateIndex;
        closestDistance = distance;
      }
    }

    if (closestIndex >= 0) {
      this.take(closestIndex);
    }

    return closestIndex;
  }

  private refreshGroup(groupIndex: number): void {
    const group = this.groups[groupIndex];
    while (
      group.nextUnusedOffset < group.indexes.length &&
      this.isUsed(group.indexes[group.nextUnusedOffset])
    ) {
      group.nextUnusedOffset += 1;
    }

    if (group.nextUnusedOffset < group.indexes.length || !group.active) {
      return;
    }

    group.active = false;
    this.nextParents[groupIndex] = findSetRoot(this.nextParents, groupIndex + 1);
    const previousNodeIndex = groupIndex + 1;
    this.previousParents[previousNodeIndex] = findSetRoot(this.previousParents, previousNodeIndex - 1);
  }
}

function createTimeGroups(lines: LyricLine[], groupByTranslationIndex: Int32Array): TranslationTimeGroup[] {
  const timedTranslations: TimedTranslation[] = [];

  lines.forEach((line, index) => {
    if (Number.isFinite(line.startMs)) {
      timedTranslations.push({ index, startMs: line.startMs });
    }
  });

  timedTranslations.sort((left, right) => left.startMs - right.startMs || left.index - right.index);

  const groups: TranslationTimeGroup[] = [];
  timedTranslations.forEach((translation) => {
    let group = groups[groups.length - 1];
    if (!group || group.startMs !== translation.startMs) {
      group = {
        active: true,
        indexes: [],
        nextUnusedOffset: 0,
        startMs: translation.startMs
      };
      groups.push(group);
    }

    group.indexes.push(translation.index);
    groupByTranslationIndex[translation.index] = groups.length - 1;
  });

  return groups;
}

function lowerBoundTimeGroup(groups: TranslationTimeGroup[], startMs: number): number {
  let low = 0;
  let high = groups.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (groups[middle].startMs < startMs) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

function findSetRoot(parents: number[], index: number): number {
  let root = index;
  while (parents[root] !== root) {
    root = parents[root];
  }

  while (parents[index] !== index) {
    const parent = parents[index];
    parents[index] = root;
    index = parent;
  }

  return root;
}
