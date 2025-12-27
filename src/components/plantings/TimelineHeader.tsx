'use client';

import { useMemo } from 'react';
import type { FrostWindow } from '@/lib/types';
import styles from './TimelineHeader.module.css';

type TimelineHeaderProps = {
  frost: FrostWindow;
};

export function TimelineHeader({ frost }: TimelineHeaderProps) {
  const monthTicks = useMemo(() => {
    const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
    const year = toDate(frost.lastSpringFrost).getUTCFullYear();
    const rangeStart = `${year}-03-01`;
    const rangeEnd = `${year}-10-31`;

    const startDate = toDate(rangeStart);
    const endDate = toDate(rangeEnd);
    const rangeDays =
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24) || 1;

    const clampPct = (iso: string) => {
      const raw =
        (toDate(iso).getTime() - startDate.getTime()) /
        (1000 * 60 * 60 * 24) /
        rangeDays;
      return Math.min(1, Math.max(0, raw)) * 100;
    };

    const monthLabel = (iso: string) =>
      new Date(`${iso}T00:00:00Z`).toLocaleString('en-US', {
        month: 'short',
        timeZone: 'UTC',
      });

    return Array.from({ length: 8 }, (_, i) => {
      const monthNum = i + 3;
      const month = String(monthNum).padStart(2, '0');
      const date = `${year}-${month}-01`;
      // Calculate next month start for centering
      const nextMonthNum = monthNum + 1;
      const nextMonth = String(nextMonthNum).padStart(2, '0');
      const nextDate = nextMonthNum <= 10
        ? `${year}-${nextMonth}-01`
        : `${year}-11-01`; // Cap at Nov 1 for October
      const monthStart = clampPct(date);
      const monthEnd = clampPct(nextDate);
      const center = (monthStart + monthEnd) / 2;
      return { date, label: monthLabel(date), left: center };
    });
  }, [frost]);

  return (
    <div className={styles.header}>
      <div className={styles.spacer} />
      <div className={styles.labels}>
        {monthTicks.map((t) => (
          <span
            key={t.date}
            className={styles.monthLabel}
            style={{ left: `${t.left}%` }}
          >
            {t.label}
          </span>
        ))}
      </div>
      <div className={styles.deletespacer} />
    </div>
  );
}
