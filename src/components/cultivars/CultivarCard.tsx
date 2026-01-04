'use client';

import { useState } from 'react';
import type { Cultivar, FrostWindow, Climate, Planting } from '@/lib/types';
import {
  calculateSuccessionWindows,
  calculateNextSuccession,
  createPlantingFromWindow,
} from '@/lib/succession';
import { PlantingList } from '@/components/plantings/PlantingList';
import styles from './CultivarCard.module.css';

type CultivarCardProps = {
  cultivar: Cultivar;
  frost: FrostWindow;
  climate: Climate;
  plantings: Planting[];
  onAddPlanting: (planting: Omit<Planting, 'id' | 'createdAt'>) => void;
  onUpdatePlanting: (id: string, updates: Partial<Planting>) => void;
  onDeletePlanting: (id: string) => void;
  forceExpanded?: boolean;
};

export function CultivarCard({
  cultivar,
  frost,
  climate,
  plantings,
  onAddPlanting,
  onUpdatePlanting,
  onDeletePlanting,
  forceExpanded,
}: CultivarCardProps) {
  const [localExpanded, setLocalExpanded] = useState(false);
  const expanded = forceExpanded ?? localExpanded;
  const [quantity, setQuantity] = useState(10);

  const cultivarPlantings = plantings
    .filter((p) => p.cultivarId === cultivar.id)
    .sort((a, b) => a.successionNumber - b.successionNumber);

  const handleGenerateInitial = () => {
    const firstWindow = allWindows.windows[0];
    if (firstWindow) {
      const planting = createPlantingFromWindow(firstWindow, cultivar, quantity);
      onAddPlanting(planting);
    }
  };

  const handleAddSuccession = () => {
    const nextWindow = calculateNextSuccession(
      cultivar,
      frost,
      climate,
      plantings
    );
    if (nextWindow) {
      const planting = createPlantingFromWindow(nextWindow, cultivar, quantity);
      onAddPlanting(planting);
    }
  };

  // Calculate available succession windows to show potential
  const allWindows = calculateSuccessionWindows(cultivar, frost, climate);
  const remainingWindows = allWindows.windows.filter(
    (w) => !cultivarPlantings.some((p) => p.sowDate === w.sowDate)
  );

  const methodLabel =
    cultivar.sowMethod === 'transplant'
      ? 'Transplant'
      : cultivar.sowMethod === 'direct'
        ? 'Direct sow'
        : 'Either';

  const tempRange =
    cultivar.minGrowingTempC != null && cultivar.maxGrowingTempC != null
      ? `${cultivar.minGrowingTempC}–${cultivar.maxGrowingTempC}°C`
      : null;

  return (
    <div className={styles.card}>
      <div
        className={styles.header}
        onClick={() => setLocalExpanded(!localExpanded)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setLocalExpanded(!localExpanded)}
      >
        <div className={styles.titleRow}>
          <h3 className={styles.title}>
            {cultivar.crop} — {cultivar.variety}
          </h3>
          <span className={styles.badge}>{methodLabel}</span>
          {cultivarPlantings.length > 0 && (
            <span className={styles.countBadge}>
              {cultivarPlantings.length} planting
              {cultivarPlantings.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className={styles.meta}>
          <span>{cultivar.maturityDays} days to maturity</span>
          {tempRange && <span>Temp: {tempRange}</span>}
          {cultivar.harvestStyle === 'continuous' && (
            <span className={styles.harvestBadge}>Continuous harvest</span>
          )}
        </div>
        <span className={styles.chevron}>{expanded ? '▼' : '▶'}</span>
      </div>

      {expanded && (
        <div className={styles.content}>
          {/* Planting controls */}
          <div className={styles.controls}>
            <div className={styles.quantityRow}>
              <label htmlFor={`qty-${cultivar.id}`}>Plants per succession:</label>
              <input
                id={`qty-${cultivar.id}`}
                type="number"
                min={1}
                max={1000}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className={styles.quantityInput}
              />
            </div>

            <div className={styles.buttonRow}>
              {cultivarPlantings.length === 0 ? (
                <button
                  onClick={handleGenerateInitial}
                  className={styles.primaryButton}
                  disabled={allWindows.windows.length === 0}
                  title={
                    allWindows.windows.length === 0
                      ? allWindows.diagnostic?.noWindowsReason ?? 'No viable planting windows'
                      : 'Generate first planting'
                  }
                >
                  Generate Initial Planting
                </button>
              ) : (
                <button
                  onClick={handleAddSuccession}
                  className={styles.secondaryButton}
                  disabled={remainingWindows.length === 0}
                  title={
                    remainingWindows.length === 0
                      ? 'No more viable planting windows this season'
                      : `Add succession #${cultivarPlantings.length + 1}`
                  }
                >
                  + Add Succession
                </button>
              )}
            </div>

            {/* Show diagnostic when no windows available */}
            {allWindows.windows.length === 0 && allWindows.diagnostic && (
              <div className={styles.diagnosticWarning}>
                <strong>No planting windows available:</strong>{' '}
                {allWindows.diagnostic.noWindowsReason}
                <div className={styles.diagnosticDetails}>
                  Sow range: {allWindows.diagnostic.earliestSowDate} – {allWindows.diagnostic.latestSowDate}
                </div>
              </div>
            )}

            {allWindows.skippedPeriods.length > 0 && (
              <div className={styles.skippedInfo}>
                <span className={styles.skippedLabel}>Sowing gaps:</span>
                {allWindows.skippedPeriods.map((period, i) => (
                  <span key={i} className={styles.skippedPeriod}>
                    {period.startDate} – {period.endDate}
                  </span>
                ))}
              </div>
            )}

            {remainingWindows.length > 0 && cultivarPlantings.length > 0 && (
              <p className={styles.hint}>
                {remainingWindows.length} more succession window
                {remainingWindows.length !== 1 ? 's' : ''} available
              </p>
            )}

            {remainingWindows.length === 0 &&
              cultivarPlantings.length > 0 &&
              cultivar.harvestStyle === 'continuous' &&
              cultivar.harvestDurationDays == null && (
                <p className={styles.hint}>
                  One planting provides continuous harvest until frost
                </p>
              )}
          </div>

          {/* Existing plantings */}
          {cultivarPlantings.length > 0 && (
            <PlantingList
              plantings={cultivarPlantings}
              cultivar={cultivar}
              frost={frost}
              climate={climate}
              onUpdate={onUpdatePlanting}
              onDelete={onDeletePlanting}
            />
          )}

          {/* Cultivar details */}
          {cultivar.notes && (
            <p className={styles.notes}>{cultivar.notes}</p>
          )}
        </div>
      )}
    </div>
  );
}
