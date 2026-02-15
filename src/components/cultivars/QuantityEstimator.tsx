'use client';

import { useState, useMemo } from 'react';
import type { Cultivar, Climate, FrostWindow } from '@/lib/types';
import type { PlantingWindow } from '@/lib/succession';
import {
  EstimatorInputs,
  ConsumptionFrequency,
  PreservationPlan,
  WeightUnit,
  ViablePeriod,
  estimatePlantQuantity,
  calculateViablePeriods,
  getFrequencyLabel,
  getPreservationLabel,
  formatWeight,
  formatWeightShort,
  formatScaledServing,
  YIELD_DEFAULTS,
  getYieldCategory,
} from '@/lib/quantityEstimator';
import styles from './QuantityEstimator.module.css';

type QuantityEstimatorProps = {
  cultivar: Cultivar;
  climate: Climate;
  frostWindow: FrostWindow;
  onApplyEstimate: (quantity: number) => void;
  onClose: () => void;
  onGenerateSuccessions?: (windows: PlantingWindow[], plantsEach: number) => void;
};

const FREQUENCY_OPTIONS: ConsumptionFrequency[] = ['rarely', 'occasionally', 'regular', 'daily'];
const PRESERVATION_OPTIONS: PreservationPlan[] = ['none', 'some', 'moderate', 'heavy'];

// Load unit preference from localStorage (lazy initializer), default to lbs
function getStoredUnit(): WeightUnit {
  if (typeof window === 'undefined') return 'lbs';
  return (localStorage.getItem('quantityEstimatorUnit') as WeightUnit) || 'lbs';
}

// A merged period that can have options for both methods
type MergedPeriod = {
  id: string;  // Unique identifier based on approximate timing
  label: string;
  directOption?: {
    period: ViablePeriod;
    startDate: string;
    endDate: string;
    harvestWeeks: number;
  };
  transplantOption?: {
    period: ViablePeriod;
    startDate: string;
    endDate: string;
    harvestWeeks: number;
  };
};

// Determine which season a period belongs to based on SOW dates
// This groups periods by when you're actually planting, not when you harvest
function getSeasonId(period: ViablePeriod): string {
  // Use the first sow date to determine the season
  if (period.windows.length === 0) {
    // Fallback to label if no windows
    const label = period.label.toLowerCase();
    if (label.includes('spring') || label.includes('early')) return 'spring';
    if (label.includes('fall') || label.includes('late')) return 'fall';
    return 'other';
  }

  const firstSowDate = new Date(period.windows[0].sowDate);
  const month = firstSowDate.getUTCMonth();

  // Spring planting: Feb-May (months 1-4)
  // Summer planting: Jun-Jul (months 5-6)
  // Fall planting: Aug-Oct (months 7-9)
  if (month >= 1 && month <= 4) return 'spring';
  if (month >= 5 && month <= 6) return 'summer';
  if (month >= 7 && month <= 9) return 'fall';
  return 'other';
}

// Merge periods from both methods, matching by season
function mergePeriods(
  directPeriods: ViablePeriod[],
  transplantPeriods: ViablePeriod[]
): MergedPeriod[] {
  const merged: Map<string, MergedPeriod> = new Map();

  // Add direct sow periods
  for (const period of directPeriods) {
    const seasonId = getSeasonId(period);
    const existing = merged.get(seasonId);
    if (existing) {
      existing.directOption = {
        period,
        startDate: period.startDate,
        endDate: period.endDate,
        harvestWeeks: period.harvestWeeks,
      };
    } else {
      merged.set(seasonId, {
        id: seasonId,
        label: period.label,
        directOption: {
          period,
          startDate: period.startDate,
          endDate: period.endDate,
          harvestWeeks: period.harvestWeeks,
        },
      });
    }
  }

  // Add transplant periods
  for (const period of transplantPeriods) {
    const seasonId = getSeasonId(period);
    const existing = merged.get(seasonId);
    if (existing) {
      existing.transplantOption = {
        period,
        startDate: period.startDate,
        endDate: period.endDate,
        harvestWeeks: period.harvestWeeks,
      };
      // Use transplant label if it seems more specific
      if (!existing.directOption) {
        existing.label = period.label;
      }
    } else {
      merged.set(seasonId, {
        id: seasonId,
        label: period.label,
        transplantOption: {
          period,
          startDate: period.startDate,
          endDate: period.endDate,
          harvestWeeks: period.harvestWeeks,
        },
      });
    }
  }

  // Sort by season order
  const seasonOrder = ['spring', 'summer', 'fall', 'other', 'winter'];
  return Array.from(merged.values()).sort(
    (a, b) => seasonOrder.indexOf(a.id) - seasonOrder.indexOf(b.id)
  );
}

export function QuantityEstimator({
  cultivar,
  climate,
  frostWindow,
  onApplyEstimate,
  onClose,
  onGenerateSuccessions,
}: QuantityEstimatorProps) {
  const [householdSize, setHouseholdSize] = useState(2);
  const [frequency, setFrequency] = useState<ConsumptionFrequency>('regular');
  const [preservation, setPreservation] = useState<PreservationPlan>('none');
  const [servingSize, setServingSize] = useState(1.0); // 0.5 to 2.0 multiplier
  const [unit, setUnit] = useState<WeightUnit>(getStoredUnit);
  const [showDetails, setShowDetails] = useState(false);

  // For cultivars that support both methods, track selected method per period
  const supportsMultipleMethods = cultivar.sowMethod === 'either';
  const defaultMethod = cultivar.preferredMethod ?? 'direct';

  // Track: which periods are selected, and which method for each period
  const [selectedPeriodIds, setSelectedPeriodIds] = useState<Set<string>>(new Set());
  const [periodMethods, setPeriodMethods] = useState<Record<string, 'direct' | 'transplant'>>({});

  // Save unit preference when changed
  const handleUnitChange = (newUnit: WeightUnit) => {
    setUnit(newUnit);
    localStorage.setItem('quantityEstimatorUnit', newUnit);
  };

  // Calculate viable growing periods for both methods (if supported)
  const directPeriodsResult = useMemo(() => {
    if (!supportsMultipleMethods) {
      return calculateViablePeriods(cultivar, frostWindow, climate);
    }
    return calculateViablePeriods(cultivar, frostWindow, climate, 'direct');
  }, [cultivar, frostWindow, climate, supportsMultipleMethods]);

  const transplantPeriodsResult = useMemo(() => {
    if (!supportsMultipleMethods) return null;
    return calculateViablePeriods(cultivar, frostWindow, climate, 'transplant');
  }, [cultivar, frostWindow, climate, supportsMultipleMethods]);

  // Merge periods from both methods for unified display
  const mergedPeriods: MergedPeriod[] = useMemo(() => {
    if (!supportsMultipleMethods || !transplantPeriodsResult) {
      // Single method - just convert to merged format
      return directPeriodsResult.periods.map((p, i): MergedPeriod => ({
        id: getSeasonId(p) + '-' + i,
        label: p.label,
        directOption: {
          period: p,
          startDate: p.startDate,
          endDate: p.endDate,
          harvestWeeks: p.harvestWeeks,
        },
        transplantOption: undefined,
      }));
    }
    return mergePeriods(directPeriodsResult.periods, transplantPeriodsResult.periods);
  }, [directPeriodsResult, transplantPeriodsResult, supportsMultipleMethods]);

  // Initialize selections when merged periods change
  useMemo(() => {
    if (mergedPeriods.length > 0 && selectedPeriodIds.size === 0) {
      // Select all periods by default
      setSelectedPeriodIds(new Set(mergedPeriods.map(p => p.id)));
      // Set optimal method for each period
      const methods: Record<string, 'direct' | 'transplant'> = {};
      for (const mp of mergedPeriods) {
        if (mp.directOption && mp.transplantOption) {
          // Pick the method that gives more weeks
          methods[mp.id] = mp.directOption.harvestWeeks >= mp.transplantOption.harvestWeeks
            ? 'direct'
            : 'transplant';
        } else if (mp.directOption) {
          methods[mp.id] = 'direct';
        } else {
          methods[mp.id] = 'transplant';
        }
      }
      setPeriodMethods(methods);
    }
  }, [mergedPeriods, selectedPeriodIds.size]);

  // Calculate selected weeks based on user's period selection and method choices
  const selectedWeeks = useMemo(() => {
    if (mergedPeriods.length === 0) {
      // Fallback to generic season if no viable periods found
      return Math.floor(climate.growingSeasonDays / 7);
    }
    return mergedPeriods
      .filter(mp => selectedPeriodIds.has(mp.id))
      .reduce((sum, mp) => {
        const method = periodMethods[mp.id] ?? 'direct';
        const option = method === 'transplant' ? mp.transplantOption : mp.directOption;
        return sum + (option?.harvestWeeks ?? 0);
      }, 0);
  }, [mergedPeriods, selectedPeriodIds, periodMethods, climate.growingSeasonDays]);

  const togglePeriod = (periodId: string) => {
    setSelectedPeriodIds(prev => {
      const next = new Set(prev);
      if (next.has(periodId)) {
        // Don't allow deselecting all periods
        if (next.size > 1) {
          next.delete(periodId);
        }
      } else {
        next.add(periodId);
      }
      return next;
    });
  };

  const togglePeriodMethod = (periodId: string) => {
    setPeriodMethods(prev => ({
      ...prev,
      [periodId]: prev[periodId] === 'transplant' ? 'direct' : 'transplant',
    }));
  };

  const estimate = useMemo(() => {
    const inputs: EstimatorInputs = {
      householdSize,
      consumptionFrequency: frequency,
      preservationPlan: preservation,
      growingSeasonWeeks: selectedWeeks,
      servingSizeMultiplier: servingSize,
    };
    return estimatePlantQuantity(cultivar, inputs);
  }, [cultivar, householdSize, frequency, preservation, selectedWeeks, servingSize]);

  // Get the base serving description from yield data
  const yieldCategory = getYieldCategory(cultivar);
  const yieldData = YIELD_DEFAULTS[yieldCategory];

  // Get serving size label with actual quantity
  const getServingSizeLabel = (value: number): string => {
    if (value <= 0.6) return 'Small';
    if (value <= 0.9) return 'Light';
    if (value <= 1.1) return 'Normal';
    if (value <= 1.5) return 'Generous';
    return 'Large';
  };

  // Get the scaled serving description with dynamic count
  const getScaledServingDescription = (): string => {
    const baseServing = yieldData.servingSizeKg;
    const scaledServing = baseServing * servingSize;
    const label = getServingSizeLabel(servingSize);
    const scaledDescription = formatScaledServing(yieldData, servingSize);
    return `${label}: ${scaledDescription} (${formatWeightShort(scaledServing, unit)})`;
  };

  const handleApply = () => {
    onApplyEstimate(estimate.recommended);
  };

  // Get windows from selected periods, using the chosen method for each
  const selectedWindows = useMemo(() => {
    return mergedPeriods
      .filter(mp => selectedPeriodIds.has(mp.id))
      .flatMap(mp => {
        const method = periodMethods[mp.id] ?? 'direct';
        const option = method === 'transplant' ? mp.transplantOption : mp.directOption;
        return option?.period.windows ?? [];
      });
  }, [mergedPeriods, selectedPeriodIds, periodMethods]);

  const handleGenerateSuccessions = () => {
    if (onGenerateSuccessions && selectedWindows.length > 0) {
      onGenerateSuccessions(selectedWindows, estimate.plantsPerSuccession);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h4 className={styles.title}>Estimate plants needed for the season</h4>
        <div className={styles.headerControls}>
          <div className={styles.unitToggle}>
            <button
              type="button"
              className={unit === 'kg' ? styles.unitActive : styles.unitInactive}
              onClick={() => handleUnitChange('kg')}
            >
              kg
            </button>
            <button
              type="button"
              className={unit === 'lbs' ? styles.unitActive : styles.unitInactive}
              onClick={() => handleUnitChange('lbs')}
            >
              lbs
            </button>
          </div>
          <button onClick={onClose} className={styles.closeButton} aria-label="Close">
            &times;
          </button>
        </div>
      </div>

      <div className={styles.form}>
        {/* Household size */}
        <div className={styles.field}>
          <label>How many people in your household eat {cultivar.crop.toLowerCase()}?</label>
          <div className={styles.inputRow}>
            <button
              type="button"
              onClick={() => setHouseholdSize(Math.max(1, householdSize - 1))}
              disabled={householdSize <= 1}
              aria-label="Decrease"
            >
              -
            </button>
            <span className={styles.value}>{householdSize}</span>
            <button
              type="button"
              onClick={() => setHouseholdSize(householdSize + 1)}
              aria-label="Increase"
            >
              +
            </button>
          </div>
        </div>

        {/* Consumption frequency */}
        <div className={styles.field}>
          <label>How often will you eat it during the growing season?</label>
          <div className={styles.radioGroup}>
            {FREQUENCY_OPTIONS.map((opt) => (
              <label key={opt} className={styles.radioOption}>
                <input
                  type="radio"
                  name="frequency"
                  value={opt}
                  checked={frequency === opt}
                  onChange={() => setFrequency(opt)}
                />
                <span>{getFrequencyLabel(opt)}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Preservation plans */}
        <div className={styles.field}>
          <label>Do you plan to can, freeze, or preserve any?</label>
          <div className={styles.radioGroup}>
            {PRESERVATION_OPTIONS.map((opt) => (
              <label key={opt} className={styles.radioOption}>
                <input
                  type="radio"
                  name="preservation"
                  value={opt}
                  checked={preservation === opt}
                  onChange={() => setPreservation(opt)}
                />
                <span>{getPreservationLabel(opt)}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Serving size adjustment */}
        <div className={styles.field}>
          <label>How big are your typical portions?</label>
          <div className={styles.sliderRow}>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={servingSize}
              onChange={(e) => setServingSize(parseFloat(e.target.value))}
              className={styles.slider}
            />
            <span className={styles.sliderValue}>{getServingSizeLabel(servingSize)}</span>
          </div>
          <span className={styles.servingHint}>{getScaledServingDescription()}</span>
        </div>

        {/* Growing periods selector */}
        {mergedPeriods.length > 0 && (
          <div className={styles.field}>
            <label>When do you want to grow {cultivar.crop.toLowerCase()}?</label>
            <div className={styles.periodsContainer}>
              {mergedPeriods.map((mp) => {
                const isSelected = selectedPeriodIds.has(mp.id);
                const selectedMethod = periodMethods[mp.id] ?? 'direct';
                const activeOption = selectedMethod === 'transplant' ? mp.transplantOption : mp.directOption;
                const hasBothMethods = mp.directOption && mp.transplantOption;

                if (!activeOption) return null;

                const startMonth = new Date(activeOption.startDate).toLocaleDateString('en-US', { month: 'short' });
                const endMonth = new Date(activeOption.endDate).toLocaleDateString('en-US', { month: 'short' });

                // Determine which method is better for this period and why
                let methodAdvice: string | null = null;
                if (hasBothMethods) {
                  const directWeeks = mp.directOption!.harvestWeeks;
                  const transplantWeeks = mp.transplantOption!.harvestWeeks;
                  const isSpring = mp.id === 'spring' || mp.label.toLowerCase().includes('spring');
                  const isFall = mp.id === 'fall' || mp.label.toLowerCase().includes('fall');

                  if (directWeeks > transplantWeeks && selectedMethod === 'transplant') {
                    // Direct sow is better - explain why based on season
                    if (isSpring && !cultivar.frostSensitive) {
                      // Frost-tolerant crops can be direct sown before last spring frost
                      methodAdvice = `Direct sow adds ${directWeeks - transplantWeeks} weeks (frost-tolerant, can sow before last frost)`;
                    } else if (isSpring) {
                      methodAdvice = `Direct sow adds ${directWeeks - transplantWeeks} weeks`;
                    } else {
                      methodAdvice = `Direct sow adds ${directWeeks - transplantWeeks} weeks`;
                    }
                  } else if (transplantWeeks > directWeeks && selectedMethod === 'direct') {
                    // Transplant is better - explain why based on season
                    if (isFall) {
                      methodAdvice = `Transplant adds ${transplantWeeks - directWeeks} weeks (start indoors while it's still too hot outside)`;
                    } else {
                      methodAdvice = `Transplant adds ${transplantWeeks - directWeeks} weeks`;
                    }
                  }
                }

                return (
                  <div
                    key={mp.id}
                    className={`${styles.periodOption} ${isSelected ? styles.periodSelected : ''}`}
                  >
                    <div className={styles.periodMain}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => togglePeriod(mp.id)}
                      />
                      <span className={styles.periodLabel}>{mp.label}</span>
                      <span className={styles.periodDates}>{startMonth}–{endMonth}</span>
                      <span className={styles.periodWeeks}>{activeOption.harvestWeeks} weeks</span>
                    </div>
                    {hasBothMethods && isSelected && (
                      <div className={styles.periodMethodRow}>
                        <div className={styles.periodMethodToggle}>
                          <button
                            type="button"
                            className={selectedMethod === 'direct' ? styles.methodActive : styles.methodInactive}
                            onClick={(e) => { e.stopPropagation(); setPeriodMethods(prev => ({ ...prev, [mp.id]: 'direct' })); }}
                          >
                            Direct
                          </button>
                          <button
                            type="button"
                            className={selectedMethod === 'transplant' ? styles.methodActive : styles.methodInactive}
                            onClick={(e) => { e.stopPropagation(); setPeriodMethods(prev => ({ ...prev, [mp.id]: 'transplant' })); }}
                          >
                            Transplant
                          </button>
                        </div>
                        {methodAdvice && (
                          <span className={styles.methodAdvice}>{methodAdvice}</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {mergedPeriods.length > 1 && (
              <span className={styles.periodsHint}>
                {cultivar.crop} can grow in multiple seasons. Select the periods you plan to grow.
              </span>
            )}
            {mergedPeriods.length === 1 && (
              <span className={styles.periodsHint}>
                {cultivar.crop} grows best during {mergedPeriods[0].label.toLowerCase()} ({selectedWeeks} weeks).
              </span>
            )}
          </div>
        )}

        {mergedPeriods.length === 0 && (
          <div className={styles.field}>
            <span className={styles.periodsWarning}>
              Could not calculate viable growing periods for {cultivar.crop}. Using full season ({Math.floor(climate.growingSeasonDays / 7)} weeks).
            </span>
          </div>
        )}
      </div>

      {/* Results */}
      <div className={styles.results}>
        <div className={styles.recommendation}>
          <span className={styles.label}>Recommended:</span>
          <span className={styles.recommendedValue}>{estimate.recommended} plants</span>
          <span className={styles.range}>({estimate.min}-{estimate.max} range)</span>
        </div>

        {/* Succession breakdown */}
        {estimate.successionsRecommended > 1 && (
          <div className={styles.successionInfo}>
            <span className={styles.successionText}>
              {estimate.successionsRecommended} plantings of {estimate.plantsPerSuccession} plants each
            </span>
            <span className={styles.successionHint}>
              ({Math.round(estimate.harvestDurationDays / 7)}-week harvest window per planting)
            </span>
          </div>
        )}

        {estimate.successionsRecommended === 1 && cultivar.harvestStyle === 'continuous' && (
          <div className={styles.successionInfo}>
            <span className={styles.successionHint}>
              Continuous harvest until frost — single planting sufficient
            </span>
          </div>
        )}

        <p className={styles.breakdown}>{estimate.breakdown}</p>

        {/* Details toggle */}
        <button
          type="button"
          className={styles.detailsToggle}
          onClick={() => setShowDetails(!showDetails)}
        >
          {showDetails ? '▼ Hide details' : '▶ Show calculation details'}
        </button>

        {showDetails && (
          <div className={styles.details}>
            <div className={styles.detailRow}>
              <span>Yield per plant:</span>
              <span>{formatWeight(estimate.yieldPerPlantKg, unit)} ({estimate.yieldDescription})</span>
            </div>
            <div className={styles.detailRow}>
              <span>Serving size:</span>
              <span>{formatWeight(estimate.servingSizeKg, unit)} ({formatScaledServing(yieldData, servingSize)})</span>
            </div>
            <div className={styles.detailRow}>
              <span>Total needed:</span>
              <span>{formatWeight(estimate.totalNeededKg, unit)} for {selectedWeeks} weeks</span>
            </div>
            <div className={styles.detailRow}>
              <span>Category:</span>
              <span>{estimate.yieldCategory.replace(/_/g, ' ')}</span>
            </div>
          </div>
        )}
      </div>

      <div className={styles.actions}>
        <button type="button" onClick={onClose} className={styles.cancelButton}>
          Cancel
        </button>
        {selectedWindows.length > 1 && onGenerateSuccessions && (
          <button
            type="button"
            onClick={handleGenerateSuccessions}
            className={styles.generateButton}
          >
            Generate {selectedWindows.length} plantings
          </button>
        )}
        <button type="button" onClick={handleApply} className={styles.applyButton}>
          Use {estimate.plantsPerSuccession} plants
        </button>
      </div>
    </div>
  );
}
