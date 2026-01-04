'use client';

import { useState } from 'react';
import type { Cultivar, FrostWindow, Climate, Planting } from '@/lib/types';
import {
  calculateSuccessionWindows,
  calculateNextSuccession,
  calculateAvailableWindowsAfter,
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
  const [selectedPlantingId, setSelectedPlantingId] = useState<string | null>(null);

  const cultivarPlantings = plantings
    .filter((p) => p.cultivarId === cultivar.id)
    .sort((a, b) => a.sowDate.localeCompare(b.sowDate));

  const handleGenerateInitial = () => {
    const firstWindow = allWindows.windows[0];
    if (firstWindow) {
      const planting = createPlantingFromWindow(firstWindow, cultivar, quantity);
      onAddPlanting(planting);
    }
  };

  const handleAddSuccession = () => {
    // If a planting is selected, calculate windows after that planting's harvest end
    const selectedPlanting = selectedPlantingId
      ? cultivarPlantings.find((p) => p.id === selectedPlantingId)
      : null;

    let nextWindow;
    if (selectedPlanting) {
      const windowsAfter = calculateAvailableWindowsAfter(
        cultivar,
        frost,
        climate,
        selectedPlanting.harvestEnd,
        plantings
      );
      nextWindow = windowsAfter[0] ?? null;
    } else {
      nextWindow = calculateNextSuccession(
        cultivar,
        frost,
        climate,
        plantings
      );
    }

    if (nextWindow) {
      const planting = createPlantingFromWindow(nextWindow, cultivar, quantity);
      onAddPlanting(planting);
    }
  };

  const handleSelectPlanting = (id: string) => {
    setSelectedPlantingId((prev) => (prev === id ? null : id));
  };

  // Calculate available succession windows to show potential
  const allWindows = calculateSuccessionWindows(cultivar, frost, climate);

  // Check if a window overlaps with any existing planting's harvest period
  // This is more robust than comparing sowDate, since users can drag plantings
  const windowOverlapsPlanting = (window: (typeof allWindows.windows)[0]) => {
    return cultivarPlantings.some((p) => {
      // Windows overlap if one starts before the other ends
      // We check harvest periods since that's what matters for succession planning
      const windowStart = new Date(window.harvestStart).getTime();
      const windowEnd = new Date(window.harvestEnd).getTime();
      const plantingStart = new Date(p.harvestStart).getTime();
      const plantingEnd = new Date(p.harvestEnd).getTime();

      // For same-day windows/plantings (start == end), use special handling
      // This handles the case where a window is truncated to a single day at frost deadline
      const windowIsSameDay = windowStart === windowEnd;
      const plantingIsSameDay = plantingStart === plantingEnd;

      if (windowIsSameDay && plantingIsSameDay) {
        // Both are same-day: overlap if they're the same day
        return windowStart === plantingStart;
      } else if (windowIsSameDay) {
        // Window is same-day: overlaps if it falls within planting's range (inclusive)
        return windowStart >= plantingStart && windowStart <= plantingEnd;
      } else if (plantingIsSameDay) {
        // Planting is same-day: overlaps if it falls within window's range (inclusive)
        return plantingStart >= windowStart && plantingStart <= windowEnd;
      } else {
        // Normal case: overlap if windowStart < plantingEnd AND plantingStart < windowEnd
        return windowStart < plantingEnd && plantingStart < windowEnd;
      }
    });
  };

  // Get the selected planting for display and calculations
  const selectedPlanting = selectedPlantingId
    ? cultivarPlantings.find((p) => p.id === selectedPlantingId)
    : null;

  // Calculate remaining windows based on selection state
  const remainingWindows = selectedPlanting
    ? calculateAvailableWindowsAfter(
        cultivar,
        frost,
        climate,
        selectedPlanting.harvestEnd,
        plantings
      )
    : allWindows.windows.filter((w) => !windowOverlapsPlanting(w));

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
          <span className={styles.meta}>
            {cultivar.maturityDays} days from {cultivar.sowMethod === 'transplant' ? 'transplant' : 'direct sow'}
            {tempRange && <> · {tempRange}</>}
          </span>
          <div className={styles.badges}>
            <span className={cultivar.sowMethod === 'transplant' ? styles.badgeTransplant : styles.badge}>{methodLabel}</span>
            {cultivarPlantings.length > 0 && (
              <span className={styles.countBadge}>
                {cultivarPlantings.length} planting
                {cultivarPlantings.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        <span className={styles.chevron}>{expanded ? '▼' : '▶'}</span>
      </div>

      {expanded && (
        <div className={styles.content}>
          {/* Planting controls */}
          <div className={styles.controls}>
            <div className={styles.actionRow}>
              <label htmlFor={`qty-${cultivar.id}`}>
                {cultivarPlantings.length === 0 ? 'Plants per planting:' : 'Plants per succession:'}
              </label>
              <input
                id={`qty-${cultivar.id}`}
                type="number"
                min={1}
                max={1000}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className={styles.quantityInput}
              />
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
                <>
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
                  {/* Only show hint for continuous harvest crops that don't need successions */}
                  {remainingWindows.length === 0 &&
                    cultivar.harvestStyle === 'continuous' &&
                    cultivar.harvestDurationDays == null && (
                      <span className={styles.inlineHint}>
                        One planting provides continuous harvest until frost
                      </span>
                    )}
                </>
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
              selectedPlantingId={selectedPlantingId}
              onSelectPlanting={handleSelectPlanting}
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
