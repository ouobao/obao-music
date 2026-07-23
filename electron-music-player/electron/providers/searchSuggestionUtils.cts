export function interleaveSearchSuggestionGroups<T>(groups: readonly (readonly T[])[]): T[] {
  const result: T[] = [];
  const maxGroupLength = Math.max(0, ...groups.map((group) => group.length));

  for (let index = 0; index < maxGroupLength; index += 1) {
    for (const group of groups) {
      const item = group[index];
      if (item !== undefined) {
        result.push(item);
      }
    }
  }

  return result;
}
