'use client';

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useGardenBeds } from '@/hooks/useGardenBeds';
import { usePlacements } from '@/hooks/usePlacements';
import {
  filterPlantingsInGround,
  getSeasonDateRange,
  calculateFootprint,
  getValidRectangleConfigs,
  getCropColor,
  autoLayout,
  checkCollisions,
  getPlacedQuantity,
  getRemainingQuantity,
} from '@/lib/gardenLayout';
import type { PlacementSuggestion, FrostWindow, Climate } from '@/lib/types';
import { BedEditor } from './BedEditor';
import { UnifiedGardenCanvas, ZOOM_LEVELS } from './UnifiedGardenCanvas';
import { LayoutCalendarView } from './LayoutCalendarView';
import { PlantTypeFilter, type PlantTypeFilterValue } from '@/components/plantings/PlantTypeFilter';
import type { Planting, Cultivar, GardenBed, PlantingPlacement } from '@/lib/types';
import { Lock, LockOpen } from 'lucide-react';
import { useToast, ToastContainer } from '@/components/ui/Toast';
import styles from './GardenView.module.css';

// Base scale: 2 pixels per cm at zoom level 1 (must match UnifiedGardenCanvas)
const BASE_SCALE = 2;

type GardenViewProps = {
  plantings: Planting[];
  cultivars: Cultivar[];
  frost: FrostWindow;
  climate?: Climate;
  loading?: boolean;
  onUpdatePlanting?: (id: string, updates: Partial<Planting>) => void;
};

type Units = 'metric' | 'imperial';

// Unit conversion helpers
function dimensionsToDisplay(widthCm: number, heightCm: number, units: Units): string {
  if (units === 'metric') {
    return `${Math.round(widthCm)}×${Math.round(heightCm)}cm`;
  }
  const widthIn = Math.round(widthCm / 2.54);
  const heightIn = Math.round(heightCm / 2.54);
  return `${widthIn}×${heightIn}in`;
}

function spacingToDisplay(cm: number, units: Units): string {
  if (units === 'metric') {
    return `${Math.round(cm)}cm spacing`;
  }
  return `${Math.round(cm / 2.54)}in spacing`;
}

// Default zoom index (index 5 = 1.0 = 100% = 2 pixels per cm)
const DEFAULT_ZOOM_INDEX = 5;

// localStorage keys for preferences
const UNITS_STORAGE_KEY = 'vegplanner-garden-units';
const ALLOW_OVERLAP_STORAGE_KEY = 'vegplanner-garden-allow-overlap';

function getStoredUnits(): Units {
  if (typeof window === 'undefined') return 'metric';
  const stored = localStorage.getItem(UNITS_STORAGE_KEY);
  if (stored === 'imperial') return 'imperial';
  return 'metric';
}

function getStoredAllowOverlap(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(ALLOW_OVERLAP_STORAGE_KEY) === 'true';
}

export function GardenView({ plantings, cultivars, frost, climate, loading, onUpdatePlanting }: GardenViewProps) {
  const {
    beds,
    loading: bedsLoading,
    addBed,
    updateBed,
    deleteBed,
  } = useGardenBeds();
  const {
    placements,
    loading: placementsLoading,
    addPlacement,
    updatePlacement,
    deletePlacement,
  } = usePlacements();

  // Toast notifications
  const { toasts, showToast, removeToast } = useToast();

  // Editor state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingBed, setEditingBed] = useState<GardenBed | null>(null);

  // Auto-layout state
  const [autoLayoutSuggestions, setAutoLayoutSuggestions] = useState<PlacementSuggestion[] | null>(null);

  // Units state - initialize from localStorage
  const [units, setUnits] = useState<Units>(() => getStoredUnits());

  // Persist units preference to localStorage
  useEffect(() => {
    localStorage.setItem(UNITS_STORAGE_KEY, units);
  }, [units]);

  // Zoom state - scale is pixels per cm (continuous for smooth wheel zoom)
  const [scale, setScale] = useState(ZOOM_LEVELS[DEFAULT_ZOOM_INDEX] * BASE_SCALE);
  const zoomPercent = Math.round((scale / BASE_SCALE) * 100);

  // Lock beds state - prevents accidental dragging
  const [bedsLocked, setBedsLocked] = useState(true);

  // Allow overlapping placements (for companion planting) - persist preference
  const [allowOverlap, setAllowOverlap] = useState(() => getStoredAllowOverlap());

  // Persist allowOverlap preference to localStorage
  useEffect(() => {
    localStorage.setItem(ALLOW_OVERLAP_STORAGE_KEY, String(allowOverlap));
  }, [allowOverlap]);

  // Plant type filter
  const [plantTypeFilter, setPlantTypeFilter] = useState<PlantTypeFilterValue>('all');

  // Highlighted planting from canvas selection
  const [highlightedPlantingId, setHighlightedPlantingId] = useState<string | null>(null);
  const sidebarCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Get season date range for the scrubber
  const seasonRange = useMemo(
    () => getSeasonDateRange(plantings),
    [plantings]
  );

  // Default to today or middle of season
  const defaultDate = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    if (!seasonRange) return today;
    if (today >= seasonRange.start && today <= seasonRange.end) return today;
    // Return middle of season if today is outside range
    const startMs = new Date(seasonRange.start).getTime();
    const endMs = new Date(seasonRange.end).getTime();
    const midMs = startMs + (endMs - startMs) / 2;
    return new Date(midMs).toISOString().split('T')[0];
  }, [seasonRange]);

  const [selectedDate, setSelectedDate] = useState(defaultDate);

  // Create cultivar lookup map for filtering and footprint calculations
  const cultivarMap = useMemo(
    () => new Map(cultivars.map((c) => [c.id, c])),
    [cultivars]
  );

  // Filter all plantings by plant type (for the calendar view)
  const filteredPlantings = useMemo(() => {
    if (plantTypeFilter === 'all') return plantings;
    return plantings.filter((p) => {
      const cultivar = cultivarMap.get(p.cultivarId);
      return cultivar?.plantType === plantTypeFilter;
    });
  }, [plantings, plantTypeFilter, cultivarMap]);

  // Filter plantings to those in ground on selected date, then by plant type
  const inGroundPlantings = useMemo(() => {
    const inGround = filterPlantingsInGround(filteredPlantings, selectedDate);
    return inGround;
  }, [filteredPlantings, selectedDate]);

  // Get plantings with remaining plants to place (either no placements or partial placement)
  const plantingsWithRemaining = useMemo(
    () => inGroundPlantings.filter((p) => {
      // If no quantity set, nothing to place
      if (p.quantity == null || p.quantity === 0) return false;
      const remaining = getRemainingQuantity(p, placements);
      return remaining > 0;
    }),
    [inGroundPlantings, placements]
  );

  // Filter placements to only those for in-ground plantings
  const visiblePlacements = useMemo(
    () => placements.filter((p) => inGroundPlantings.some((pl) => pl.id === p.plantingId)),
    [placements, inGroundPlantings]
  );

  // Check which unplaced plantings are too large for any available bed space
  const tooLargePlantingIds = useMemo(() => {
    const tooLarge = new Set<string>();

    for (const planting of plantingsWithRemaining) {
      const cultivar = cultivarMap.get(planting.cultivarId);
      const spacing = cultivar?.spacingCm ?? 30;

      // Check if at least 1 plant can fit (partial placement is supported)
      const allConfigs = getValidRectangleConfigs(1, spacing);

      let canFitSomewhere = false;

      for (const bed of beds) {
        if (canFitSomewhere) break;

        // Get existing placements in this bed (for in-ground plantings only)
        const bedPlacements = placements.filter(
          (p) => p.bedId === bed.id && inGroundPlantings.some((pl) => pl.id === p.plantingId)
        );

        // Build footprints for existing placements
        const existingFootprints = bedPlacements.map((placement) => {
          const pl = inGroundPlantings.find((p) => p.id === placement.plantingId);
          const cv = pl ? cultivarMap.get(pl.cultivarId) : undefined;
          const qty = pl?.quantity ?? 1;
          const sp = cv?.spacingCm ?? 30;
          const fp = calculateFootprint(qty, sp);
          return {
            xCm: placement.xCm,
            yCm: placement.yCm,
            widthCm: fp.widthCm,
            heightCm: fp.heightCm,
          };
        });

        // Try all configurations and both orientations for each
        for (const config of allConfigs) {
          if (canFitSomewhere) break;

          // Try normal and rotated orientations
          const orientations = [
            { w: config.widthCm, h: config.heightCm },
            { w: config.heightCm, h: config.widthCm },
          ];

          for (const { w, h } of orientations) {
            if (canFitSomewhere) break;

            // Skip if this orientation doesn't fit in the bed at all
            if (w > bed.widthCm || h > bed.lengthCm) continue;

            // Scan for a valid position
            const step = 5;
            for (let y = 0; y <= bed.lengthCm - h && !canFitSomewhere; y += step) {
              for (let x = 0; x <= bed.widthCm - w && !canFitSomewhere; x += step) {
                const candidate = { xCm: x, yCm: y, widthCm: w, heightCm: h };
                const collision = checkCollisions(candidate, existingFootprints.map((f, i) => ({ id: String(i), ...f })));
                if (!collision.hasCollision) {
                  canFitSomewhere = true;
                }
              }
            }
          }
        }
      }

      if (!canFitSomewhere && beds.length > 0) {
        tooLarge.add(planting.id);
      }
    }

    return tooLarge;
  }, [plantingsWithRemaining, beds, placements, inGroundPlantings, cultivarMap]);

  const isLoading = loading || bedsLoading || placementsLoading;

  const handleAddBed = () => {
    setEditingBed(null);
    setIsEditorOpen(true);
  };

  const handleEditBed = (bed: GardenBed) => {
    setEditingBed(bed);
    setIsEditorOpen(true);
  };

  const handleDeleteBed = async (bed: GardenBed) => {
    const placementsInBed = placements.filter((p) => p.bedId === bed.id);
    if (placementsInBed.length > 0) {
      const confirmed = window.confirm(
        `This bed has ${placementsInBed.length} planting(s) placed in it. Delete anyway?`
      );
      if (!confirmed) return;
    }
    await deleteBed(bed.id);
  };

  const handleDuplicateBed = async (bed: GardenBed) => {
    const { id, ...bedData } = bed;
    await addBed({
      ...bedData,
      name: `${bed.name} (copy)`,
      positionX: (bed.positionX ?? 0) + 30,
      positionY: (bed.positionY ?? 0) + 30,
    });
  };

  const handleSaveBed = async (bedData: Omit<GardenBed, 'id'>) => {
    if (editingBed) {
      await updateBed(editingBed.id, bedData);
    } else {
      await addBed(bedData);
    }
    setIsEditorOpen(false);
    setEditingBed(null);
  };

  const handleCancelEditor = () => {
    setIsEditorOpen(false);
    setEditingBed(null);
  };

  const minScale = ZOOM_LEVELS[0] * BASE_SCALE;
  const maxScale = ZOOM_LEVELS[ZOOM_LEVELS.length - 1] * BASE_SCALE;

  const handleZoomIn = () => {
    // Find next zoom level up from current scale
    const currentZoomLevel = scale / BASE_SCALE;
    const nextLevel = ZOOM_LEVELS.find(z => z > currentZoomLevel + 0.01);
    if (nextLevel) {
      setScale(nextLevel * BASE_SCALE);
    }
  };

  const handleZoomOut = () => {
    // Find next zoom level down from current scale
    const currentZoomLevel = scale / BASE_SCALE;
    const prevLevel = [...ZOOM_LEVELS].reverse().find(z => z < currentZoomLevel - 0.01);
    if (prevLevel) {
      setScale(prevLevel * BASE_SCALE);
    }
  };

  // Handle zoom changes from canvas (wheel zoom)
  const handleZoomChange = (newScale: number) => {
    setScale(newScale);
  };

  // Zoom to fit all beds in the viewport
  const handleZoomToFit = () => {
    if (beds.length === 0) return;

    // Calculate bounds of all beds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    beds.forEach((bed) => {
      const x = bed.positionX ?? 0;
      const y = bed.positionY ?? 0;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + bed.widthCm);
      maxY = Math.max(maxY, y + bed.lengthCm);
    });

    // Add padding (50cm on each side)
    const padding = 100;
    const contentWidth = maxX - minX + padding;
    const contentHeight = maxY - minY + padding;

    // Get approximate canvas area size (rough estimate)
    const canvasAreaWidth = window.innerWidth - 400; // Account for sidebar
    const canvasAreaHeight = window.innerHeight - 300; // Account for toolbar, etc.

    // Calculate scale that fits content in viewport
    const scaleX = canvasAreaWidth / contentWidth;
    const scaleY = canvasAreaHeight / contentHeight;
    const fitScale = Math.max(minScale, Math.min(maxScale, Math.min(scaleX, scaleY)));

    setScale(fitScale);
  };

  const handleToggleUnits = () => {
    setUnits(units === 'metric' ? 'imperial' : 'metric');
  };

  // Auto-layout handlers
  const handleAutoLayout = () => {
    // Build quantity map for ALL in-ground plantings (both placed and unplaced)
    // The algorithm needs quantities for existing placements to calculate their footprints
    const plantingQuantities = new Map(
      inGroundPlantings.map((p) => [p.id, p.quantity ?? 1])
    );

    const suggestions = autoLayout(
      plantingsWithRemaining,
      beds,
      visiblePlacements, // Only consider placements for plantings in-ground on selected date
      cultivars,
      plantingQuantities
    );

    if (suggestions.length === 0) {
      alert('Could not find space for any plantings. Try adding more beds or removing existing placements.');
      return;
    }

    setAutoLayoutSuggestions(suggestions);
  };

  const handleApplyAutoLayout = async () => {
    if (!autoLayoutSuggestions) return;

    // Create all placements
    for (const suggestion of autoLayoutSuggestions) {
      await addPlacement({
        plantingId: suggestion.plantingId,
        bedId: suggestion.bedId,
        xCm: suggestion.xCm,
        yCm: suggestion.yCm,
        spacingCm: suggestion.spacingCm,
        quantity: suggestion.quantity,
      });
    }

    setAutoLayoutSuggestions(null);
  };

  const handleCancelAutoLayout = () => {
    setAutoLayoutSuggestions(null);
  };

  // Placement handlers
  const handlePlacementCreate = async (placement: Omit<PlantingPlacement, 'id'>) => {
    await addPlacement(placement);
  };

  const handlePlacementUpdate = async (id: string, updates: Partial<PlantingPlacement>) => {
    await updatePlacement(id, updates);
  };

  const handlePlacementDelete = async (id: string) => {
    await deletePlacement(id);
  };

  // Handler for quantity updates from canvas resize
  const handlePlantingQuantityUpdate = (plantingId: string, quantity: number) => {
    onUpdatePlanting?.(plantingId, { quantity });
  };

  // Handle selection changes from canvas
  const handleSelectionChange = useCallback((_placementId: string | null, plantingId: string | null) => {
    setHighlightedPlantingId(plantingId);

    // Scroll to the highlighted card if it exists in the sidebar
    if (plantingId) {
      const cardEl = sidebarCardRefs.current.get(plantingId);
      if (cardEl) {
        cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, []);

  // Drag handlers for sidebar cards
  const handleDragStart = (e: React.DragEvent, planting: Planting) => {
    const cultivar = cultivarMap.get(planting.cultivarId);
    // Pass remaining quantity (what's left to place), not total quantity
    const remaining = getRemainingQuantity(planting, placements);
    const dragData = {
      plantingId: planting.id,
      quantity: remaining,
      spacingCm: cultivar?.spacingCm ?? 30,
      cropName: cultivar?.crop ?? 'Unknown',
      family: cultivar?.family,
    };
    e.dataTransfer.setData('application/json', JSON.stringify(dragData));
    e.dataTransfer.effectAllowed = 'move';

    // Create a custom drag image
    const dragEl = e.currentTarget as HTMLElement;
    if (dragEl) {
      e.dataTransfer.setDragImage(dragEl, dragEl.offsetWidth / 2, dragEl.offsetHeight / 2);
    }
  };

  // Handler for discarding remaining unplaced plants
  const handleDiscardRemaining = (plantingId: string) => {
    const placed = getPlacedQuantity(plantingId, placements);
    if (placed > 0) {
      onUpdatePlanting?.(plantingId, { quantity: placed });
    }
  };

  // Handler for partial placement notifications
  const handlePartialPlacement = useCallback((info: { cropName: string; placedQuantity: number; requestedQuantity: number }) => {
    const remaining = info.requestedQuantity - info.placedQuantity;
    showToast(
      `Placed ${info.placedQuantity} of ${info.requestedQuantity} ${info.cropName}. ${remaining} remaining.`,
      'warning'
    );
  }, [showToast]);

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading garden layout...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Plant List Toolbar */}
      <div className={styles.toolbar}>
        <span className={styles.toolbarLabel}>Filter Plant List:</span>
        <PlantTypeFilter value={plantTypeFilter} onChange={setPlantTypeFilter} />
      </div>

      {/* Calendar Timeline */}
      <LayoutCalendarView
        plantings={filteredPlantings}
        cultivars={cultivars}
        frost={frost}
        climate={climate}
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
      />

      {/* Auto-Layout Confirmation Bar */}
      {autoLayoutSuggestions && (
        <div className={styles.autoLayoutBar}>
          <span className={styles.autoLayoutInfo}>
            Auto-layout found positions for {autoLayoutSuggestions.length} planting(s).
            Preview shown below.
          </span>
          <div className={styles.autoLayoutActions}>
            <button
              className={styles.cancelAutoLayoutButton}
              onClick={handleCancelAutoLayout}
            >
              Cancel
            </button>
            <button
              className={styles.applyAutoLayoutButton}
              onClick={handleApplyAutoLayout}
            >
              Apply Layout
            </button>
          </div>
        </div>
      )}

      <div className={styles.mainArea}>
        {/* Canvas Toolbar */}
        <div className={styles.canvasToolbar}>
          <button className={styles.toolbarButton} onClick={handleAddBed}>
            + Add Bed
          </button>
          <button
            className={styles.toolbarButton}
            disabled={plantingsWithRemaining.length === 0 || beds.length === 0}
            onClick={handleAutoLayout}
          >
            Auto-Layout
          </button>
          <div className={styles.toolbarSpacer} />
          <button
            className={`${styles.lockToggle} ${bedsLocked ? styles.locked : ''}`}
            onClick={() => setBedsLocked(!bedsLocked)}
            title={bedsLocked ? 'Unlock beds to allow dragging' : 'Lock beds to prevent accidental moves'}
          >
            {bedsLocked ? <Lock size={16} /> : <LockOpen size={16} />}
            <span>{bedsLocked ? 'Unlock Beds' : 'Lock Beds'}</span>
          </button>
          <button
            className={`${styles.toolbarButton} ${allowOverlap ? styles.active : ''}`}
            onClick={() => setAllowOverlap(!allowOverlap)}
            title={allowOverlap ? 'Overlapping allowed (companion planting mode)' : 'Click to allow overlapping placements'}
          >
            {allowOverlap ? 'Overlap' : 'No Overlap'}
          </button>
          <button
            className={styles.toolbarButton}
            onClick={handleToggleUnits}
            title="Toggle units"
          >
            {units === 'metric' ? 'cm/m' : 'in/ft'}
          </button>
          <div className={styles.zoomControls}>
            <button
              className={styles.zoomButton}
              onClick={handleZoomOut}
              disabled={scale <= minScale}
              title="Zoom out"
            >
              −
            </button>
            <span className={styles.zoomLabel} title="Ctrl+scroll to zoom">{zoomPercent}%</span>
            <button
              className={styles.zoomButton}
              onClick={handleZoomIn}
              disabled={scale >= maxScale}
              title="Zoom in"
            >
              +
            </button>
            <button
              className={styles.zoomButton}
              onClick={handleZoomToFit}
              disabled={beds.length === 0}
              title="Zoom to fit (Ctrl+0)"
            >
              ⊡
            </button>
          </div>
        </div>

        {/* Canvas Area */}
        <div className={styles.canvasArea}>
          {beds.length === 0 ? (
            <div className={styles.emptyState}>
              <h3>No garden beds yet</h3>
              <p>Create your first garden bed to start placing plantings.</p>
              <button className={styles.primaryButton} onClick={handleAddBed}>
                + Create First Bed
              </button>
            </div>
          ) : (
            <UnifiedGardenCanvas
              beds={beds}
              placements={visiblePlacements}
              plantings={inGroundPlantings}
              cultivars={cultivars}
              scale={scale}
              units={units}
              bedsLocked={bedsLocked}
              allowOverlap={allowOverlap}
              suggestions={autoLayoutSuggestions ?? []}
              selectedDate={selectedDate}
              onEditBed={handleEditBed}
              onDeleteBed={handleDeleteBed}
              onDuplicateBed={handleDuplicateBed}
              onUpdateBed={updateBed}
              onPlacementCreate={handlePlacementCreate}
              onPlacementUpdate={handlePlacementUpdate}
              onPlacementDelete={handlePlacementDelete}
              onPlantingQuantityUpdate={handlePlantingQuantityUpdate}
              onZoomChange={handleZoomChange}
              onSelectionChange={handleSelectionChange}
              onPartialPlacement={handlePartialPlacement}
            />
          )}
        </div>

        {/* Sidebar - Plantings to Place */}
        <div className={styles.sidebar}>
          <h3 className={styles.sidebarTitle}>Plants to Place</h3>
          {plantingsWithRemaining.length === 0 ? (
            <p className={styles.sidebarEmpty}>
              {inGroundPlantings.length === 0
                ? 'No plantings in ground on this date.'
                : 'All in-ground plantings are placed in beds.'}
            </p>
          ) : (
            <div className={styles.unplacedList}>
              {plantingsWithRemaining.map((planting) => {
                const cultivar = cultivarMap.get(planting.cultivarId);
                const spacing = cultivar?.spacingCm ?? 30;
                const totalQuantity = planting.quantity ?? 1;
                const placedQuantity = getPlacedQuantity(planting.id, placements);
                const remainingQuantity = totalQuantity - placedQuantity;
                const footprint = calculateFootprint(remainingQuantity, spacing);
                const color = getCropColor(cultivar?.family, cultivar?.crop ?? '');
                const isTooLarge = tooLargePlantingIds.has(planting.id);
                const isPartiallyPlaced = placedQuantity > 0;
                const progressPercent = (placedQuantity / totalQuantity) * 100;

                const isHighlighted = highlightedPlantingId === planting.id;

                return (
                  <div
                    key={planting.id}
                    ref={(el) => {
                      if (el) sidebarCardRefs.current.set(planting.id, el);
                      else sidebarCardRefs.current.delete(planting.id);
                    }}
                    className={`${styles.unplacedCard} ${isTooLarge ? styles.tooLarge : ''} ${isHighlighted ? styles.highlighted : ''}`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, planting)}
                  >
                    <div
                      className={styles.unplacedColorBar}
                      style={{ backgroundColor: color }}
                    />
                    <div className={styles.unplacedContent}>
                      <div className={styles.unplacedMain}>
                        <span className={styles.unplacedLabel}>
                          {planting.label}
                        </span>
                        <span className={styles.unplacedQuantity}>
                          {remainingQuantity} remaining
                        </span>
                      </div>
                      {/* Progress bar */}
                      <div className={styles.placementProgress}>
                        <div className={styles.progressBar}>
                          <div
                            className={styles.progressFill}
                            style={{ width: `${progressPercent}%`, backgroundColor: color }}
                          />
                        </div>
                        <span className={styles.progressText}>
                          {placedQuantity}/{totalQuantity} placed
                        </span>
                      </div>
                      <div className={styles.unplacedMeta}>
                        <span className={styles.unplacedFootprint}>
                          {dimensionsToDisplay(footprint.widthCm, footprint.heightCm, units)}
                        </span>
                        {cultivar?.spacingCm && (
                          <span className={styles.unplacedSpacing}>
                            {spacingToDisplay(cultivar.spacingCm, units)}
                          </span>
                        )}
                      </div>
                      {isTooLarge && (
                        <div className={styles.unplacedWarning}>
                          <span>Too large for available bed space</span>
                          <button
                            className={styles.resetQuantityButton}
                            onClick={(e) => {
                              e.stopPropagation();
                              onUpdatePlanting?.(planting.id, { quantity: undefined });
                            }}
                            title="Reset quantity so you can place and resize on canvas"
                          >
                            Reset size
                          </button>
                        </div>
                      )}
                      {/* Discard remaining button - only show when partially placed */}
                      {isPartiallyPlaced && !isTooLarge && (
                        <button
                          className={styles.discardRemainingButton}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDiscardRemaining(planting.id);
                          }}
                          title="Update quantity to match what's placed"
                        >
                          Discard remaining
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Bed Editor Modal */}
      {isEditorOpen && (
        <BedEditor
          bed={editingBed}
          units={units}
          onSave={handleSaveBed}
          onCancel={handleCancelEditor}
        />
      )}

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
