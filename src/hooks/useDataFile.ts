import { useState, useEffect, useCallback } from 'react';

type Collection = 'plantings' | 'tasks' | 'garden-beds';

type UseDataFileResult<T> = {
  data: T[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  save: (newData: T[]) => Promise<void>;
  add: (item: T) => Promise<void>;
  update: (id: string, updates: Partial<T>) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

export function useDataFile<T extends { id: string }>(
  collection: Collection
): UseDataFileResult<T> {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/data/${collection}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${collection}`);
      }
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [collection]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const save = useCallback(
    async (newData: T[]) => {
      try {
        setError(null);
        const response = await fetch(`/api/data/${collection}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newData),
        });
        if (!response.ok) {
          throw new Error(`Failed to save ${collection}`);
        }
        setData(newData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        throw err;
      }
    },
    [collection]
  );

  const add = useCallback(
    async (item: T) => {
      const newData = [...data, item];
      await save(newData);
    },
    [data, save]
  );

  const update = useCallback(
    async (id: string, updates: Partial<T>) => {
      const newData = data.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      );
      await save(newData);
    },
    [data, save]
  );

  const remove = useCallback(
    async (id: string) => {
      const newData = data.filter((item) => item.id !== id);
      await save(newData);
    },
    [data, save]
  );

  return {
    data,
    loading,
    error,
    refetch: fetchData,
    save,
    add,
    update,
    remove,
  };
}
