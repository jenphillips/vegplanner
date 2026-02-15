'use client';

import { useState, useEffect, useRef } from 'react';
import type { Cultivar, FrostWindow, Climate, Planting } from '@/lib/types';
import {
  calculateSuccessionWindows,
  calculateNextSuccession,
  calculateAvailableWindowsAfter,
  createPlantingFromWindow,
  getOutdoorGrowingConstraints,
} from '@/lib/succession';
import { PlantingList } from '@/components/plantings/PlantingList';
import styles from './CultivarCard.module.css';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const formatDate = (iso: string) => {
  const d = new Date(iso + 'T00:00:00Z');
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}`;
};

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
  const [localExpanded, setLocalExpanded] = useState(forceExpanded ?? false);
  const [hasManualOverride, setHasManualOverride] = useState(false);
  const prevForceExpanded = useRef(forceExpanded);

  // When forceExpanded changes (user clicks Expand All / Collapse All),
  // reset the manual override so the global setting takes effect
  useEffect(() => {
    if (prevForceExpanded.current !== forceExpanded) {
      setHasManualOverride(false);
      if (forceExpanded !== undefined) {
        setLocalExpanded(forceExpanded);
      }
      prevForceExpanded.current = forceExpanded;
    }
  }, [forceExpanded]);

  // If the user has manually toggled this card, use local state;
  // otherwise, defer to forceExpanded (if set) or local state
  const expanded = hasManualOverride ? localExpanded : (forceExpanded ?? localExpanded);

  const handleToggleExpanded = () => {
    setLocalExpanded(!expanded);
    setHasManualOverride(true);
  };
  const [quantity, setQuantity] = useState<number | null>(4);
  const [selectedPlantingId, setSelectedPlantingId] = useState<string | null>(null);

  const cultivarPlantings = plantings
    .filter((p) => p.cultivarId === cultivar.id)
    .sort((a, b) => a.sowDate.localeCompare(b.sowDate));

  const handleGenerateInitial = () => {
    const firstWindow = allWindows.windows[0];
    if (firstWindow) {
      const planting = createPlantingFromWindow(firstWindow, cultivar, quantity ?? undefined);
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
      const planting = createPlantingFromWindow(nextWindow, cultivar, quantity ?? undefined);
      onAddPlanting(planting);
    }
  };

  const handleSelectPlanting = (id: string) => {
    setSelectedPlantingId((prev) => (prev === id ? null : id));
  };

  // Calculate available succession windows to show potential
  const allWindows = calculateSuccessionWindows(cultivar, frost, climate);

  // Day-level temperature constraints for display
  const year = new Date(frost.lastSpringFrost + 'T00:00:00Z').getUTCFullYear();
  const growingConstraints = getOutdoorGrowingConstraints(cultivar, climate, year);

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

  // For perennials, show harvest window info instead of maturity days
  const maturityInfo = cultivar.isPerennial
    ? `Harvest: ${cultivar.harvestDurationDays ?? 42} days, ${cultivar.perennialHarvestStartDaysAfterLSF ?? 14}d after last frost`
    : `${cultivar.maturityDays} days from ${cultivar.sowMethod === 'transplant' ? 'transplant' : 'direct sow'}`;

  return (
    <div className={styles.card}>
      <div
        className={styles.header}
        onClick={handleToggleExpanded}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && handleToggleExpanded()}
      >
        <div className={styles.titleRow}>
          <h3 className={styles.title}>
            {cultivar.crop} — {cultivar.variety}
          </h3>
          <span className={styles.meta}>
            {maturityInfo}
            {tempRange && <> · {tempRange}</>}
          </span>
          <div className={styles.badges}>
            {cultivar.isPerennial && (
              <span className={styles.badgePerennial}>Perennial</span>
            )}
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
                {cultivarPlantings.length === 0 ? 'Initial plants (optional):' : 'Plants per succession:'}
              </label>
              <input
                id={`qty-${cultivar.id}`}
                type="number"
                min={1}
                max={1000}
                value={quantity ?? ''}
                placeholder="Auto"
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setQuantity(isNaN(val) ? null : Math.max(1, val));
                }}
                className={styles.quantityInput}
                title="Leave empty to set quantity when placing in garden bed"
              />
              {cultivarPlantings.length === 0 ? (
                <button
                  onClick={handleGenerateInitial}
                  className={styles.primaryButton}
                  disabled={allWindows.windows.length === 0}
                  title={
                    allWindows.windows.length === 0
                      ? allWindows.diagnostic?.noWindowsReason ?? 'No viable planting windows'
                      : cultivar.isPerennial
                        ? 'Add perennial to your garden'
                        : 'Generate first planting'
                  }
                >
                  {cultivar.isPerennial ? 'Add Perennial' : 'Generate Initial Planting'}
                </button>
              ) : (
                <>
                  {/* Hide succession button for perennials - they don't have successions */}
                  {!cultivar.isPerennial && (
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
                  {/* Only show hint for continuous harvest crops that don't need successions */}
                  {!cultivar.isPerennial &&
                    remainingWindows.length === 0 &&
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

            {growingConstraints.length > 0 && (
              <div className={styles.skippedInfo}>
                <span className={styles.skippedLabel}>Can&apos;t grow outdoors:</span>
                {growingConstraints.map((constraint, i) => (
                  <span
                    key={i}
                    className={constraint.type === 'hot' ? styles.skippedPeriodHot : styles.skippedPeriodCold}
                    title={constraint.reason}
                  >
                    {formatDate(constraint.startDate)} – {formatDate(constraint.endDate)}
                    <span className={styles.gapReason}> ({constraint.type === 'hot' ? 'too hot' : 'too cold'})</span>
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
