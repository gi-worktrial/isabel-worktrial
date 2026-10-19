// onFirst runs before the first subscriber is added, so a store can reload then
export function listeners<A extends unknown[] = []>(hooks: { onFirst?: () => void } = {}) {
  const set = new Set<(...args: A) => void>();
  return {
    subscribe: (listener: (...args: A) => void): (() => void) => {
      if (set.size === 0) {
        hooks.onFirst?.();
      }
      set.add(listener);
      return () => {
        set.delete(listener);
      };
    },
    emit: (...args: A): void => {
      for (const listener of set) {
        listener(...args);
      }
    },
  };
}
