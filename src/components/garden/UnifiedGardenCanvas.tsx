'use client';

import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { Scissors, Copy, Pencil, Trash2 } from 'lucide-react';
import {
  calculateFootprint,
  calculateFootprintWithLayout,
  calculateQuantityFromDimensions,
  getValidRectangleConfigs,
  getCropColor,
  checkCollisionsWithTiming,
  findOverlappingPlacements,
  findNearestValidPosition,
  fitsInBed,
  isPlantingInHarvest,
  calculateGrowthFactor,
  calculatePlantDotRadius,
  getInGroundDateRange,
  calculateMaxPlantsInContainer,
  getContainerPlantPositions,
  getPlacedQuantity,
} from '@/lib/gardenLayout';
import type {
  GardenBed,
  PlantingPlacement,
  Planting,
  Cultivar,
  PlacementSuggestion,
} from '@/lib/types';
import styles from './UnifiedGardenCanvas.module.css';

type DragData = {
  plantingId: string;
  quantity: number;
  spacingCm: number;
  cropName: string;
  family?: string;
};

type Units = 'metric' | 'imperial';

type UnifiedGardenCanvasProps = {
  beds: GardenBed[];
  placements: PlantingPlacement[];
  plantings: Planting[];
  cultivars: Cultivar[];
  scale: number; // pixels per cm
  units?: Units;
  bedsLocked?: boolean; // Prevent bed dragging when true
  allowOverlap?: boolean; // Allow overlapping placements (disable collision detection)
  suggestions?: PlacementSuggestion[]; // Auto-layout preview
  selectedDate?: string; // ISO date for harvest indicator
  onEditBed: (bed: GardenBed) => void;
  onDeleteBed: (bed: GardenBed) => void;
  onDuplicateBed: (bed: GardenBed) => void;
  onUpdateBed: (id: string, updates: Partial<GardenBed>) => void;
  onPlacementCreate: (placement: Omit<PlantingPlacement, 'id'>) => void;
  onPlacementUpdate: (id: string, updates: Partial<PlantingPlacement>) => void;
  onPlacementDelete: (id: string) => void;
  onPlantingQuantityUpdate?: (plantingId: string, quantity: number) => void;
  onZoomChange?: (scale: number) => void;
  onSelectionChange?: (placementId: string | null, plantingId: string | null) => void;
  onPartialPlacement?: (info: { cropName: string; placedQuantity: number; requestedQuantity: number }) => void;
};

// Grid line spacing in cm
const GRID_SPACING_CM_METRIC = 10;
const GRID_MAJOR_CM_METRIC = 50;
const INCH_CM = 2.54;
const GRID_SPACING_CM_IMPERIAL = 6 * INCH_CM;
const GRID_MAJOR_CM_IMPERIAL = 12 * INCH_CM;

// Snap to grid size in cm
const SNAP_CM = 5;

// Canvas padding
const CANVAS_PADDING = 50; // cm padding around all beds

function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

// Zoom configuration - exported for use in GardenView
// Finer increments for smoother wheel zoom
export const ZOOM_LEVELS = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.5, 1.75, 2];

// Base scale: 2 pixels per cm at zoom level 1
const BASE_SCALE = 2;

export function UnifiedGardenCanvas({
  beds,
  placements,
  plantings,
  cultivars,
  scale,
  units = 'metric',
  bedsLocked = false,
  allowOverlap = false,
  suggestions = [],
  selectedDate,
  onEditBed,
  onDeleteBed,
  onDuplicateBed,
  onUpdateBed,
  onPlacementCreate,
  onPlacementUpdate,
  onPlacementDelete,
  onPlantingQuantityUpdate,
  onZoomChange,
  onSelectionChange,
  onPartialPlacement,
}: UnifiedGardenCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Selection state
  const [selectedPlacement, setSelectedPlacement] = useState<string | null>(null);
  const [selectedBed, setSelectedBed] = useState<string | null>(null);
  const [hoveredPlacement, setHoveredPlacement] = useState<string | null>(null);

  // Drag preview for new placements
  const [dragOver, setDragOver] = useState(false);
  const [dragPreview, setDragPreview] = useState<{
    bedId: string;
    xCm: number;
    yCm: number;
    widthCm: number;
    heightCm: number;
    color: string;
    valid: boolean;
    isContainer?: boolean; // True if dropping onto a container
    containerQuantity?: number; // Number of plants that will be placed in container
    isPartial?: boolean; // True when fewer than requested will fit
    partialQuantity?: number; // How many plants will actually be placed
    requestedQuantity?: number; // How many were originally requested
  } | null>(null);

  // State for moving existing placements
  const [movingPlacement, setMovingPlacement] = useState<{
    id: string;
    bedId: string;
    startXCm: number;
    startYCm: number;
    offsetXCm: number;
    offsetYCm: number;
    widthCm: number;
    heightCm: number;
    color: string;
    startMouseX: number;
    startMouseY: number;
    dateRange: { start: string; end: string } | null;
    wasAlreadySelected: boolean;
  } | null>(null);
  const [movePreview, setMovePreview] = useState<{
    xCm: number;
    yCm: number;
    valid: boolean;
  } | null>(null);
  // Track the last committed move to prevent flash-back during async update
  const [committedMove, setCommittedMove] = useState<{
    placementId: string;
    xCm: number;
    yCm: number;
  } | null>(null);

  // Clear committedMove once the placement data has been updated.
  // Uses the "adjust state during render" pattern instead of useEffect.
  if (committedMove) {
    const placement = placements.find((p) => p.id === committedMove.placementId);
    if (placement && placement.xCm === committedMove.xCm && placement.yCm === committedMove.yCm) {
      setCommittedMove(null);
    }
  }

  // Memoize selected plantingId to avoid effect re-running on unrelated placement changes
  const selectedPlantingId = useMemo(() => {
    if (!selectedPlacement) return null;
    const placement = placements.find((p) => p.id === selectedPlacement);
    return placement?.plantingId ?? null;
  }, [selectedPlacement, placements]);

  // Notify parent when selection changes
  useEffect(() => {
    onSelectionChange?.(selectedPlacement, selectedPlantingId);
  }, [selectedPlacement, selectedPlantingId, onSelectionChange]);

  // State for moving beds
  const [movingBed, setMovingBed] = useState<{
    id: string;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    startMouseX: number;
    startMouseY: number;
  } | null>(null);
  const [bedMovePreview, setBedMovePreview] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // State for resizing placements
  const [resizing, setResizing] = useState<{
    placementId: string;
    bedId: string;
    corner: 'nw' | 'ne' | 'sw' | 'se';
    startMouseX: number;
    startMouseY: number;
    originalXCm: number;
    originalYCm: number;
    originalWidthCm: number;
    originalHeightCm: number;
    quantity: number;
    spacingCm: number;
    color: string;
    dateRange: { start: string; end: string } | null;
  } | null>(null);
  const [resizePreview, setResizePreview] = useState<{
    xCm: number;
    yCm: number;
    widthCm: number;
    heightCm: number;
    cols: number;
    rows: number;
    quantity: number;
    valid: boolean;
  } | null>(null);

  // Drag threshold
  const [hasDragged, setHasDragged] = useState(false);
  const DRAG_THRESHOLD = 3;
  const justFinishedInteraction = useRef(false);

  // Mouse wheel zoom handler - must be native event for passive: false to work
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !onZoomChange) return;

    const handleWheel = (e: WheelEvent) => {
      // Only zoom if Ctrl/Cmd is held (trackpad pinch sets ctrlKey automatically)
      if (!e.ctrlKey && !e.metaKey) return;

      e.preventDefault();
      e.stopPropagation();

      const rect = wrapper.getBoundingClientRect();

      // Get mouse position relative to wrapper viewport
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Calculate the point in content coordinates before zoom
      const contentX = (wrapper.scrollLeft + mouseX) / scale;
      const contentY = (wrapper.scrollTop + mouseY) / scale;

      // Calculate smooth continuous zoom (no snapping)
      const zoomMultiplier = 1 - (e.deltaY * 0.002);
      const minScale = ZOOM_LEVELS[0] * BASE_SCALE;
      const maxScale = ZOOM_LEVELS[ZOOM_LEVELS.length - 1] * BASE_SCALE;
      const newScale = Math.max(minScale, Math.min(maxScale, scale * zoomMultiplier));

      // Only update if scale changed meaningfully
      if (Math.abs(newScale - scale) < 0.001) return;

      // Calculate new scroll position to keep mouse point stable
      const newScrollLeft = contentX * newScale - mouseX;
      const newScrollTop = contentY * newScale - mouseY;

      // Update zoom
      onZoomChange(newScale);

      // After React re-renders, adjust scroll position
      requestAnimationFrame(() => {
        wrapper.scrollLeft = Math.max(0, newScrollLeft);
        wrapper.scrollTop = Math.max(0, newScrollTop);
      });
    };

    // Must use passive: false to allow preventDefault() on wheel events
    wrapper.addEventListener('wheel', handleWheel, { passive: false });
    return () => wrapper.removeEventListener('wheel', handleWheel);
  }, [scale, onZoomChange]);

  // Build lookup maps
  const plantingMap = useMemo(
    () => new Map(plantings.map((p) => [p.id, p])),
    [plantings]
  );
  const cultivarMap = useMemo(
    () => new Map(cultivars.map((c) => [c.id, c])),
    [cultivars]
  );

  // Calculate canvas dimensions based on bed positions
  const canvasBounds = useMemo(() => {
    if (beds.length === 0) {
      return { width: 400, height: 300, minX: 0, minY: 0 };
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    beds.forEach((bed) => {
      const x = bed.positionX ?? 0;
      const y = bed.positionY ?? 0;
      // For containers, use diameter for both dimensions
      const bedWidth = bed.widthCm;
      const bedHeight = bed.shape === 'container' ? bed.widthCm : bed.lengthCm;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + bedWidth);
      maxY = Math.max(maxY, y + bedHeight);
    });

    // Add padding
    return {
      width: maxX - minX + CANVAS_PADDING * 2,
      height: maxY - minY + CANVAS_PADDING * 2,
      minX: minX - CANVAS_PADDING,
      minY: minY - CANVAS_PADDING,
    };
  }, [beds]);

  // Track wrapper size for minimum SVG dimensions
  const [wrapperSize, setWrapperSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const updateSize = () => {
      setWrapperSize({
        width: wrapper.clientWidth,
        height: wrapper.clientHeight,
      });
    };

    updateSize();
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(wrapper);
    return () => resizeObserver.disconnect();
  }, []);

  // Content size at current zoom
  const contentWidth = canvasBounds.width * scale;
  const contentHeight = canvasBounds.height * scale;

  // SVG should fill wrapper or fit content, whichever is larger
  const svgWidth = Math.max(contentWidth, wrapperSize.width);
  const svgHeight = Math.max(contentHeight, wrapperSize.height);

  // Offset to center content when smaller than wrapper
  const offsetX = Math.max(0, (wrapperSize.width - contentWidth) / 2);
  const offsetY = Math.max(0, (wrapperSize.height - contentHeight) / 2);

  // Convert canvas coordinates to SVG coordinates
  const toSvgX = useCallback((cmX: number) => offsetX + (cmX - canvasBounds.minX) * scale, [canvasBounds.minX, scale, offsetX]);
  const toSvgY = useCallback((cmY: number) => offsetY + (cmY - canvasBounds.minY) * scale, [canvasBounds.minY, scale, offsetY]);

  // Convert mouse position to cm coordinates
  const getPositionCm = useCallback((e: React.MouseEvent | React.DragEvent): { xCm: number; yCm: number } => {
    if (!wrapperRef.current) return { xCm: 0, yCm: 0 };
    const rect = wrapperRef.current.getBoundingClientRect();
    // Position in SVG coordinates (accounting for scroll)
    const svgX = e.clientX - rect.left + wrapperRef.current.scrollLeft;
    const svgY = e.clientY - rect.top + wrapperRef.current.scrollTop;
    // Convert to cm (subtract offset, then divide by scale)
    return {
      xCm: (svgX - offsetX) / scale + canvasBounds.minX,
      yCm: (svgY - offsetY) / scale + canvasBounds.minY,
    };
  }, [scale, canvasBounds.minX, canvasBounds.minY, offsetX, offsetY]);

  // Find which bed a point is in
  const findBedAtPoint = useCallback((xCm: number, yCm: number): GardenBed | null => {
    for (const bed of beds) {
      const bedX = bed.positionX ?? 0;
      const bedY = bed.positionY ?? 0;

      if (bed.shape === 'container') {
        // Circle hit detection: check if distance from center is within radius
        const radius = bed.widthCm / 2;
        const centerX = bedX + radius;
        const centerY = bedY + radius;
        const distSq = (xCm - centerX) ** 2 + (yCm - centerY) ** 2;
        if (distSq <= radius ** 2) {
          return bed;
        }
      } else {
        // Rectangle hit detection
        if (xCm >= bedX && xCm <= bedX + bed.widthCm &&
            yCm >= bedY && yCm <= bedY + bed.lengthCm) {
          return bed;
        }
      }
    }
    return null;
  }, [beds]);

  // Calculate footprints for all placements
  const footprints = useMemo(() => {
    return placements.map((placement) => {
      const planting = plantingMap.get(placement.plantingId);
      const cultivar = planting ? cultivarMap.get(planting.cultivarId) : undefined;
      const quantity = placement.quantity;
      const { widthCm, heightCm, rows, cols } = placement.cols
        ? calculateFootprintWithLayout(quantity, placement.spacingCm, placement.cols)
        : calculateFootprint(quantity, placement.spacingCm);

      const bed = beds.find((b) => b.id === placement.bedId);
      const bedX = bed?.positionX ?? 0;
      const bedY = bed?.positionY ?? 0;

      // Check if planting is currently in harvest window
      const isHarvesting = planting && selectedDate
        ? isPlantingInHarvest(planting, selectedDate)
        : false;

      // Calculate growth factor for dynamic dot sizing
      const growthFactor = planting && selectedDate
        ? calculateGrowthFactor(planting, cultivar, selectedDate)
        : 1.0; // Default to mature size if no date context

      // Get date range for time-aware collision detection
      const dateRange = planting ? getInGroundDateRange(planting) : null;

      return {
        placement,
        planting,
        cultivar,
        bed,
        widthCm,
        heightCm,
        rows,
        cols,
        color: getCropColor(cultivar?.family, cultivar?.crop ?? ''),
        isHarvesting,
        growthFactor,
        dateRange,
        // Absolute position on canvas
        absoluteX: bedX + placement.xCm,
        absoluteY: bedY + placement.yCm,
      };
    });
  }, [placements, plantingMap, cultivarMap, beds, selectedDate]);

  // Calculate footprints for suggestion previews
  const suggestionFootprints = useMemo(() => {
    return suggestions.map((suggestion) => {
      const planting = plantingMap.get(suggestion.plantingId);
      const cultivar = planting ? cultivarMap.get(planting.cultivarId) : undefined;
      // Use the suggestion's quantity (remaining to place), not the planting's total
      const { widthCm, heightCm, rows, cols } = calculateFootprint(suggestion.quantity, suggestion.spacingCm);

      const bed = beds.find((b) => b.id === suggestion.bedId);
      const bedX = bed?.positionX ?? 0;
      const bedY = bed?.positionY ?? 0;

      return {
        suggestion,
        planting,
        cultivar,
        widthCm,
        heightCm,
        rows,
        cols,
        color: getCropColor(cultivar?.family, cultivar?.crop ?? ''),
        absoluteX: bedX + suggestion.xCm,
        absoluteY: bedY + suggestion.yCm,
      };
    });
  }, [suggestions, plantingMap, cultivarMap, beds]);

  // Check if a placement is valid within a specific bed
  // Supports time-aware collision detection when plantingId and date ranges are available
  const isPlacementValid = useCallback((
    bedId: string,
    xCm: number,
    yCm: number,
    widthCm: number,
    heightCm: number,
    excludeId?: string,
    newPlantingDateRange?: { start: string; end: string } | null,
    ignoreCollisions?: boolean
  ): boolean => {
    const bed = beds.find((b) => b.id === bedId);
    if (!bed) return false;

    const candidate = { xCm, yCm, widthCm, heightCm };

    // Check bed bounds
    if (!fitsInBed(candidate, { widthCm: bed.widthCm, lengthCm: bed.lengthCm })) {
      return false;
    }

    // Skip collision check if requested (e.g., during resize operations)
    if (ignoreCollisions) {
      return true;
    }

    // Check collisions with existing placements in the same bed
    const bedPlacements = footprints
      .filter((f) => f.placement.bedId === bedId)
      .map((f) => ({
        id: f.placement.id,
        xCm: f.placement.xCm,
        yCm: f.placement.yCm,
        widthCm: f.widthCm,
        heightCm: f.heightCm,
      }));

    // Build date ranges map for time-aware collision detection
    const existingDateRanges = new Map<string, { start: string; end: string }>();
    for (const f of footprints) {
      if (f.placement.bedId === bedId && f.dateRange) {
        existingDateRanges.set(f.placement.id, f.dateRange);
      }
    }

    // Use time-aware collision detection
    const collision = checkCollisionsWithTiming(
      candidate,
      newPlantingDateRange ?? null,
      bedPlacements,
      existingDateRanges,
      excludeId,
      { ignoreCollisions: allowOverlap }
    );
    return !collision.hasCollision;
  }, [beds, footprints, allowOverlap]);

  // Find best fitting config for a placement
  const findBestFittingConfig = useCallback((
    bedId: string,
    quantity: number,
    spacingCm: number,
    cursorXCm: number,
    cursorYCm: number,
    excludeId?: string,
    plantingDateRange?: { start: string; end: string } | null,
    trailingHabit?: boolean
  ) => {
    const bed = beds.find((b) => b.id === bedId);
    if (!bed) return null;

    const bedX = bed.positionX ?? 0;
    const bedY = bed.positionY ?? 0;

    // Special handling for containers - plants are packed using circle packing
    if (bed.shape === 'container') {
      const containerDiameter = bed.widthCm;
      const plantDiameter = spacingCm; // Plant's mature diameter
      // Trailing plants (petunias, etc.) can spill more over edges
      const tolerance = trailingHabit ? 2.0 : 1.2;

      // Calculate how many plants of this size can fit
      const maxPlants = calculateMaxPlantsInContainer(containerDiameter, plantDiameter, tolerance);
      const requestedQuantity = Math.min(quantity, maxPlants);

      // Count existing plants in this container (excluding self when moving)
      const existingPlacements = footprints.filter(
        f => f.placement.bedId === bedId && f.placement.id !== excludeId
      );

      // Check temporal overlap with existing placements
      let occupiedSlots = 0;
      for (const existing of existingPlacements) {
        if (plantingDateRange && existing.dateRange) {
          const overlaps = plantingDateRange.start <= existing.dateRange.end &&
                          existing.dateRange.start <= plantingDateRange.end;
          if (overlaps) {
            // Count how many plants are in this overlapping placement
            occupiedSlots += existing.placement.quantity;
          }
        } else {
          // No date info, assume always present
          occupiedSlots += existing.placement.quantity;
        }
      }

      const availableSlots = maxPlants - occupiedSlots;
      const fitsQuantity = Math.min(requestedQuantity, availableSlots);
      const fits = fitsQuantity > 0;

      return {
        widthCm: spacingCm,
        heightCm: spacingCm,
        cols: 1,
        xCm: 0, // Will be centered in container
        yCm: 0,
        valid: fits,
        isContainer: true,
        containerQuantity: fitsQuantity, // How many plants to place
        maxContainerPlants: maxPlants, // Total capacity
      };
    }

    // Standard rectangular bed logic
    // Convert to bed-relative coordinates
    const relX = cursorXCm - bedX;
    const relY = cursorYCm - bedY;

    const allConfigs = getValidRectangleConfigs(quantity, spacingCm);

    for (const config of allConfigs) {
      const orientations = [
        { w: config.widthCm, h: config.heightCm, cols: config.cols },
        { w: config.heightCm, h: config.widthCm, cols: config.rows },
      ];

      for (const { w, h, cols } of orientations) {
        const centeredX = Math.max(0, snapToGrid(relX - w / 2, SNAP_CM));
        const centeredY = Math.max(0, snapToGrid(relY - h / 2, SNAP_CM));

        if (isPlacementValid(bedId, centeredX, centeredY, w, h, excludeId, plantingDateRange)) {
          return { widthCm: w, heightCm: h, cols, xCm: centeredX, yCm: centeredY, valid: true };
        }
      }
    }

    // Full quantity doesn't fit — binary search for the largest partial quantity that does
    if (quantity > 1) {
      let low = 1;
      let high = quantity - 1;
      let bestPartial: { widthCm: number; heightCm: number; cols: number; xCm: number; yCm: number; partialQuantity: number } | null = null;

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const partialConfigs = getValidRectangleConfigs(mid, spacingCm);
        let found = false;

        for (const config of partialConfigs) {
          if (found) break;
          const orientations = [
            { w: config.widthCm, h: config.heightCm, cols: config.cols },
            { w: config.heightCm, h: config.widthCm, cols: config.rows },
          ];

          for (const { w, h, cols } of orientations) {
            const centeredX = Math.max(0, snapToGrid(relX - w / 2, SNAP_CM));
            const centeredY = Math.max(0, snapToGrid(relY - h / 2, SNAP_CM));

            if (isPlacementValid(bedId, centeredX, centeredY, w, h, excludeId, plantingDateRange)) {
              bestPartial = { widthCm: w, heightCm: h, cols, xCm: centeredX, yCm: centeredY, partialQuantity: mid };
              found = true;
              break;
            }
          }
        }

        if (found) {
          low = mid + 1; // Try to fit more
        } else {
          high = mid - 1; // Need to fit fewer
        }
      }

      if (bestPartial) {
        return {
          widthCm: bestPartial.widthCm,
          heightCm: bestPartial.heightCm,
          cols: bestPartial.cols,
          xCm: bestPartial.xCm,
          yCm: bestPartial.yCm,
          valid: true,
          isPartial: true,
          partialQuantity: bestPartial.partialQuantity,
        };
      }
    }

    const defaultFootprint = calculateFootprint(quantity, spacingCm);
    const centeredX = Math.max(0, snapToGrid(relX - defaultFootprint.widthCm / 2, SNAP_CM));
    const centeredY = Math.max(0, snapToGrid(relY - defaultFootprint.heightCm / 2, SNAP_CM));
    return {
      widthCm: defaultFootprint.widthCm,
      heightCm: defaultFootprint.heightCm,
      cols: defaultFootprint.cols,
      xCm: centeredX,
      yCm: centeredY,
      valid: false,
    };
  }, [beds, footprints, isPlacementValid]);

  // --- DRAG HANDLERS FOR NEW PLACEMENTS ---

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);

    try {
      const dataStr = e.dataTransfer.getData('application/json');
      if (!dataStr) return;

      const data: DragData = JSON.parse(dataStr);
      const { xCm, yCm } = getPositionCm(e);

      const bed = findBedAtPoint(xCm, yCm);
      if (!bed) {
        setDragPreview(null);
        return;
      }

      // Get planting's date range for time-aware collision detection
      const planting = plantingMap.get(data.plantingId);
      const plantingDateRange = planting ? getInGroundDateRange(planting) : null;
      const cultivar = planting ? cultivarMap.get(planting.cultivarId) : undefined;
      const trailingHabit = cultivar?.trailingHabit ?? false;

      const bestFit = findBestFittingConfig(bed.id, data.quantity, data.spacingCm, xCm, yCm, undefined, plantingDateRange, trailingHabit);
      if (!bestFit) {
        setDragPreview(null);
        return;
      }

      const bedX = bed.positionX ?? 0;
      const bedY = bed.positionY ?? 0;

      const isContainer = bed.shape === 'container';
      const isPartialContainer = isContainer && bestFit.valid && (bestFit.containerQuantity ?? 0) < data.quantity;
      const isPartialRect = !isContainer && bestFit.isPartial === true;
      setDragPreview({
        bedId: bed.id,
        xCm: bedX + bestFit.xCm,
        yCm: bedY + bestFit.yCm,
        widthCm: bestFit.widthCm,
        heightCm: bestFit.heightCm,
        color: getCropColor(data.family, data.cropName),
        valid: bestFit.valid,
        isContainer,
        containerQuantity: bestFit.containerQuantity,
        isPartial: isPartialContainer || isPartialRect,
        partialQuantity: isPartialRect ? bestFit.partialQuantity : bestFit.containerQuantity,
        requestedQuantity: data.quantity,
      });
    } catch {
      // Data not available during dragover in some browsers
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (rect) {
      const { clientX, clientY } = e;
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
        setDragOver(false);
        setDragPreview(null);
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    setDragPreview(null);

    try {
      const dataStr = e.dataTransfer.getData('application/json');
      if (!dataStr) return;

      const data: DragData = JSON.parse(dataStr);
      const { xCm, yCm } = getPositionCm(e);

      const bed = findBedAtPoint(xCm, yCm);
      if (!bed) return;

      // Get planting's date range for time-aware collision detection
      const planting = plantingMap.get(data.plantingId);
      const plantingDateRange = planting ? getInGroundDateRange(planting) : null;
      const cultivar = planting ? cultivarMap.get(planting.cultivarId) : undefined;
      const trailingHabit = cultivar?.trailingHabit ?? false;

      const bestFit = findBestFittingConfig(bed.id, data.quantity, data.spacingCm, xCm, yCm, undefined, plantingDateRange, trailingHabit);
      if (bestFit && bestFit.valid) {
        // Calculate quantity based on placement type
        let placementQuantity: number;
        if (bestFit.isContainer && bestFit.containerQuantity != null) {
          // Container: use the calculated packed quantity
          placementQuantity = bestFit.containerQuantity;
        } else if (bestFit.isPartial && bestFit.partialQuantity != null) {
          // Rectangular bed partial fit: use the binary-searched quantity
          placementQuantity = bestFit.partialQuantity;
        } else {
          // Rectangular bed full fit: calculate from dimensions
          const { quantity: calcQuantity } = calculateQuantityFromDimensions(
            bestFit.widthCm,
            bestFit.heightCm,
            data.spacingCm
          );
          placementQuantity = calcQuantity;
        }

        onPlacementCreate({
          plantingId: data.plantingId,
          bedId: bed.id,
          xCm: bestFit.xCm,
          yCm: bestFit.yCm,
          spacingCm: data.spacingCm,
          cols: bestFit.cols,
          quantity: placementQuantity, // Always store explicit quantity
        });

        // Notify parent if fewer than requested were placed
        if (placementQuantity < data.quantity) {
          onPartialPlacement?.({
            cropName: data.cropName,
            placedQuantity: placementQuantity,
            requestedQuantity: data.quantity,
          });
        }
      }
    } catch (err) {
      console.error('Failed to parse drop data:', err);
    }
  };

  // --- PLACEMENT MOVE HANDLERS ---

  const handlePlacementMoveStart = (e: React.MouseEvent, footprint: typeof footprints[0]) => {
    e.stopPropagation();
    e.preventDefault();

    const { xCm, yCm } = getPositionCm(e);
    const offsetXCm = xCm - footprint.absoluteX;
    const offsetYCm = yCm - footprint.absoluteY;

    setHasDragged(false);
    setMovingPlacement({
      id: footprint.placement.id,
      bedId: footprint.placement.bedId,
      startXCm: footprint.placement.xCm,
      startYCm: footprint.placement.yCm,
      offsetXCm,
      offsetYCm,
      widthCm: footprint.widthCm,
      heightCm: footprint.heightCm,
      color: footprint.color,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      dateRange: footprint.dateRange,
      wasAlreadySelected: selectedPlacement === footprint.placement.id,
    });
    setMovePreview({
      xCm: footprint.placement.xCm,
      yCm: footprint.placement.yCm,
      valid: true,
    });
    setSelectedPlacement(footprint.placement.id);
    setSelectedBed(null);
  };

  // --- BED MOVE HANDLERS ---

  const handleBedMoveStart = (e: React.MouseEvent, bed: GardenBed) => {
    // Don't allow dragging if beds are locked
    if (bedsLocked) return;

    e.stopPropagation();
    e.preventDefault();

    const { xCm, yCm } = getPositionCm(e);
    const bedX = bed.positionX ?? 0;
    const bedY = bed.positionY ?? 0;

    setHasDragged(false);
    setMovingBed({
      id: bed.id,
      startX: bedX,
      startY: bedY,
      offsetX: xCm - bedX,
      offsetY: yCm - bedY,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
    });
    setBedMovePreview({ x: bedX, y: bedY });
    setSelectedBed(bed.id);
    setSelectedPlacement(null);
  };

  // --- RESIZE HANDLERS ---

  const handleResizeStart = (
    e: React.MouseEvent,
    footprint: typeof footprints[0],
    corner: 'nw' | 'ne' | 'sw' | 'se'
  ) => {
    e.stopPropagation();
    e.preventDefault();

    const quantity = footprint.planting?.quantity ?? 1;

    setResizing({
      placementId: footprint.placement.id,
      bedId: footprint.placement.bedId,
      corner,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      originalXCm: footprint.placement.xCm,
      originalYCm: footprint.placement.yCm,
      originalWidthCm: footprint.widthCm,
      originalHeightCm: footprint.heightCm,
      quantity,
      spacingCm: footprint.placement.spacingCm,
      color: footprint.color,
      dateRange: footprint.dateRange,
    });
    setSelectedPlacement(footprint.placement.id);
  };

  // --- MOUSE MOVE/UP HANDLERS ---

  const handleMouseMove = (e: React.MouseEvent) => {
    // Handle placement move
    if (movingPlacement) {
      const deltaX = Math.abs(e.clientX - movingPlacement.startMouseX);
      const deltaY = Math.abs(e.clientY - movingPlacement.startMouseY);
      const isDragging = deltaX > DRAG_THRESHOLD || deltaY > DRAG_THRESHOLD;

      if (isDragging && !hasDragged) {
        setHasDragged(true);
      }

      if (isDragging || hasDragged) {
        const { xCm, yCm } = getPositionCm(e);
        const bed = beds.find((b) => b.id === movingPlacement.bedId);
        if (!bed) return;

        const bedX = bed.positionX ?? 0;
        const bedY = bed.positionY ?? 0;

        // Calculate new position relative to bed
        const newAbsX = xCm - movingPlacement.offsetXCm;
        const newAbsY = yCm - movingPlacement.offsetYCm;
        const newRelX = snapToGrid(newAbsX - bedX, SNAP_CM);
        const newRelY = snapToGrid(newAbsY - bedY, SNAP_CM);

        // Clamp to bed bounds
        const clampedX = Math.max(0, Math.min(newRelX, bed.widthCm - movingPlacement.widthCm));
        const clampedY = Math.max(0, Math.min(newRelY, bed.lengthCm - movingPlacement.heightCm));

        const valid = isPlacementValid(
          movingPlacement.bedId,
          clampedX,
          clampedY,
          movingPlacement.widthCm,
          movingPlacement.heightCm,
          movingPlacement.id,
          movingPlacement.dateRange
        );

        setMovePreview({ xCm: clampedX, yCm: clampedY, valid });
      }
    }

    // Handle bed move
    if (movingBed) {
      const deltaX = Math.abs(e.clientX - movingBed.startMouseX);
      const deltaY = Math.abs(e.clientY - movingBed.startMouseY);
      const isDragging = deltaX > DRAG_THRESHOLD || deltaY > DRAG_THRESHOLD;

      if (isDragging && !hasDragged) {
        setHasDragged(true);
      }

      if (isDragging || hasDragged) {
        const { xCm, yCm } = getPositionCm(e);
        const newX = snapToGrid(xCm - movingBed.offsetX, SNAP_CM);
        const newY = snapToGrid(yCm - movingBed.offsetY, SNAP_CM);
        setBedMovePreview({ x: newX, y: newY });
      }
    }

    // Handle resize
    if (resizing) {
      const bed = beds.find((b) => b.id === resizing.bedId);
      if (!bed) return;

      const deltaXCm = (e.clientX - resizing.startMouseX) / scale;
      const deltaYCm = (e.clientY - resizing.startMouseY) / scale;

      let targetWidthCm = resizing.originalWidthCm;
      let targetHeightCm = resizing.originalHeightCm;

      if (resizing.corner === 'se') {
        targetWidthCm = Math.max(resizing.spacingCm, resizing.originalWidthCm + deltaXCm);
        targetHeightCm = Math.max(resizing.spacingCm, resizing.originalHeightCm + deltaYCm);
      } else if (resizing.corner === 'sw') {
        targetWidthCm = Math.max(resizing.spacingCm, resizing.originalWidthCm - deltaXCm);
        targetHeightCm = Math.max(resizing.spacingCm, resizing.originalHeightCm + deltaYCm);
      } else if (resizing.corner === 'ne') {
        targetWidthCm = Math.max(resizing.spacingCm, resizing.originalWidthCm + deltaXCm);
        targetHeightCm = Math.max(resizing.spacingCm, resizing.originalHeightCm - deltaYCm);
      } else if (resizing.corner === 'nw') {
        targetWidthCm = Math.max(resizing.spacingCm, resizing.originalWidthCm - deltaXCm);
        targetHeightCm = Math.max(resizing.spacingCm, resizing.originalHeightCm - deltaYCm);
      }

      const { quantity: newQuantity, rows: newRows, cols: newCols } = calculateQuantityFromDimensions(
        targetWidthCm,
        targetHeightCm,
        resizing.spacingCm
      );

      const actualWidthCm = newCols * resizing.spacingCm;
      const actualHeightCm = newRows * resizing.spacingCm;

      let newXCm = resizing.originalXCm;
      let newYCm = resizing.originalYCm;

      if (resizing.corner === 'sw' || resizing.corner === 'nw') {
        newXCm = resizing.originalXCm + resizing.originalWidthCm - actualWidthCm;
      }
      if (resizing.corner === 'ne' || resizing.corner === 'nw') {
        newYCm = resizing.originalYCm + resizing.originalHeightCm - actualHeightCm;
      }

      newXCm = snapToGrid(Math.max(0, newXCm), SNAP_CM);
      newYCm = snapToGrid(Math.max(0, newYCm), SNAP_CM);

      // For resize: only validate bed bounds, skip collision check
      // This allows resizing plantings that already overlap
      const valid = isPlacementValid(
        resizing.bedId,
        newXCm,
        newYCm,
        actualWidthCm,
        actualHeightCm,
        resizing.placementId,
        resizing.dateRange,
        true // ignoreCollisions - allow resize even when overlapping
      );

      setResizePreview({
        xCm: newXCm,
        yCm: newYCm,
        widthCm: actualWidthCm,
        heightCm: actualHeightCm,
        cols: newCols,
        rows: newRows,
        quantity: newQuantity,
        valid,
      });
    }
  };

  const handleMouseUp = () => {
    if (movingPlacement || movingBed || resizing) {
      justFinishedInteraction.current = true;
    }

    // Handle click on placement (no drag) - cycle through overlapping plantings
    if (movingPlacement && !hasDragged && movingPlacement.wasAlreadySelected) {
      const overlapping = getOverlappingPlacements(movingPlacement.id);
      if (overlapping.length > 0) {
        setSelectedPlacement(overlapping[0]);
      }
      // If no overlapping, keep current selection (don't deselect on click)
    }

    // Apply placement move
    if (movingPlacement && movePreview && hasDragged) {
      let finalX = movePreview.xCm;
      let finalY = movePreview.yCm;

      // If the position is invalid (collision), find the nearest valid position
      if (!movePreview.valid && !allowOverlap) {
        const bed = beds.find((b) => b.id === movingPlacement.bedId);
        if (bed) {
          // Get existing placements in this bed for collision check
          const bedPlacements = footprints
            .filter((f) => f.placement.bedId === movingPlacement.bedId)
            .map((f) => ({
              id: f.placement.id,
              xCm: f.placement.xCm,
              yCm: f.placement.yCm,
              widthCm: f.widthCm,
              heightCm: f.heightCm,
            }));

          // Build date ranges map
          const existingDateRanges = new Map<string, { start: string; end: string }>();
          for (const f of footprints) {
            if (f.placement.bedId === movingPlacement.bedId && f.dateRange) {
              existingDateRanges.set(f.placement.id, f.dateRange);
            }
          }

          const nearestValid = findNearestValidPosition(
            movePreview.xCm,
            movePreview.yCm,
            { widthCm: movingPlacement.widthCm, heightCm: movingPlacement.heightCm },
            { widthCm: bed.widthCm, lengthCm: bed.lengthCm },
            bedPlacements,
            existingDateRanges,
            movingPlacement.dateRange,
            movingPlacement.id
          );

          if (nearestValid) {
            finalX = nearestValid.xCm;
            finalY = nearestValid.yCm;
          } else {
            // No valid position found - don't move at all
            setMovingPlacement(null);
            setMovePreview(null);
            setMovingBed(null);
            setBedMovePreview(null);
            setResizing(null);
            setResizePreview(null);
            setHasDragged(false);
            return;
          }
        }
      }

      // Store the committed position to prevent flash-back during async update
      setCommittedMove({
        placementId: movingPlacement.id,
        xCm: finalX,
        yCm: finalY,
      });
      onPlacementUpdate(movingPlacement.id, {
        xCm: finalX,
        yCm: finalY,
      });
    }

    // Apply bed move
    if (movingBed && bedMovePreview && hasDragged) {
      onUpdateBed(movingBed.id, {
        positionX: bedMovePreview.x,
        positionY: bedMovePreview.y,
      });
    }

    // Apply resize - update placement with new position, cols, and quantity
    if (resizing && resizePreview && resizePreview.valid) {
      // Find the planting and calculate if we need to increase its total quantity
      const placement = placements.find((p) => p.id === resizing.placementId);
      const planting = placement ? plantingMap.get(placement.plantingId) : undefined;

      if (planting && onPlantingQuantityUpdate) {
        // Calculate total placed quantity (excluding this placement, then adding the new quantity)
        const currentPlacedTotal = getPlacedQuantity(planting.id, placements);
        const thisPlacementCurrentQty = placement?.quantity ?? 0;
        const otherPlacementsQty = currentPlacedTotal - thisPlacementCurrentQty;
        const newTotalPlaced = otherPlacementsQty + resizePreview.quantity;

        // If the new total exceeds planting.quantity, update it
        if (newTotalPlaced > (planting.quantity ?? 0)) {
          onPlantingQuantityUpdate(planting.id, newTotalPlaced);
        }
      }

      onPlacementUpdate(resizing.placementId, {
        xCm: resizePreview.xCm,
        yCm: resizePreview.yCm,
        cols: resizePreview.cols,
        quantity: resizePreview.quantity,
      });
    }

    setMovingPlacement(null);
    setMovePreview(null);
    setMovingBed(null);
    setBedMovePreview(null);
    setResizing(null);
    setResizePreview(null);
    setHasDragged(false);
  };

  const handleMouseLeave = () => {
    if (movingPlacement || movingBed || resizing) {
      setMovingPlacement(null);
      setMovePreview(null);
      setMovingBed(null);
      setBedMovePreview(null);
      setResizing(null);
      setResizePreview(null);
      setHasDragged(false);
    }
  };

  // --- CLICK HANDLERS ---

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (movingPlacement || movingBed || resizing || justFinishedInteraction.current) {
      justFinishedInteraction.current = false;
      return;
    }
    // Deselect when clicking on canvas background, SVG, or elements marked as deselect triggers
    const target = e.target as Element;
    if (e.target === e.currentTarget ||
        target.tagName === 'svg' ||
        target.getAttribute('data-deselect') === 'true') {
      setSelectedPlacement(null);
      setSelectedBed(null);
    }
  };

  // Prepare placement data for overlap detection
  const placementsWithDimensions = useMemo(() =>
    footprints.map(fp => ({
      id: fp.placement.id,
      bedId: fp.placement.bedId,
      xCm: fp.placement.xCm,
      yCm: fp.placement.yCm,
      widthCm: fp.widthCm,
      heightCm: fp.heightCm,
    })),
    [footprints]
  );

  // Find all plantings that overlap with the given placement
  const getOverlappingPlacements = useCallback((placementId: string) => {
    return findOverlappingPlacements(placementId, placementsWithDimensions);
  }, [placementsWithDimensions]);

  const handleFootprintClick = (e: React.MouseEvent, placementId: string) => {
    e.stopPropagation();
    if (movingPlacement || resizing) return;
    if (justFinishedInteraction.current) {
      justFinishedInteraction.current = false;
      return;
    }
    setSelectedPlacement(selectedPlacement === placementId ? null : placementId);
    setSelectedBed(null);
  };

  const handleBedClick = (e: React.MouseEvent, bedId: string) => {
    e.stopPropagation();
    if (movingBed) return;
    if (justFinishedInteraction.current) {
      justFinishedInteraction.current = false;
      return;
    }
    setSelectedBed(selectedBed === bedId ? null : bedId);
    setSelectedPlacement(null);
  };

  // --- KEYBOARD HANDLERS ---

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedPlacement) {
      e.preventDefault();
      onPlacementDelete(selectedPlacement);
      setSelectedPlacement(null);
      return;
    }

    if (e.key === 'Escape') {
      setSelectedPlacement(null);
      setSelectedBed(null);
      return;
    }
  };

  // Resize handle size
  const handleSize = 10;

  return (
    <div
      className={styles.container}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      role="application"
      aria-label="Unified garden canvas"
    >
      <div
        ref={wrapperRef}
        className={`${styles.canvasWrapper} ${dragOver ? styles.dragOver : ''} ${(movingPlacement && hasDragged) || movingBed || resizing ? styles.interacting : ''}`}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleCanvasClick}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        <svg
          width={svgWidth}
          height={svgHeight}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className={styles.canvas}
        >
          {/* Canvas background */}
          <rect
            x={0}
            y={0}
            width={svgWidth}
            height={svgHeight}
            fill="#e8e4dc"
            data-deselect="true"
          />

          {/* Render each bed */}
          {beds.map((bed) => {
            const bedX = movingBed?.id === bed.id && bedMovePreview ? bedMovePreview.x : (bed.positionX ?? 0);
            const bedY = movingBed?.id === bed.id && bedMovePreview ? bedMovePreview.y : (bed.positionY ?? 0);
            const isSelected = selectedBed === bed.id;
            const isBeingMoved = movingBed?.id === bed.id && hasDragged;
            const isContainer = bed.shape === 'container';

            const svgX = toSvgX(bedX);
            const svgY = toSvgY(bedY);
            const width = bed.widthCm * scale;
            // For containers, height = width (it's a circle)
            const height = isContainer ? width : bed.lengthCm * scale;

            // Container-specific values
            const radius = width / 2;
            const centerX = svgX + radius;
            const centerY = svgY + radius;

            // Grid lines for this bed (skip for containers)
            const gridSpacing = units === 'metric' ? GRID_SPACING_CM_METRIC : GRID_SPACING_CM_IMPERIAL;
            const majorSpacing = units === 'metric' ? GRID_MAJOR_CM_METRIC : GRID_MAJOR_CM_IMPERIAL;

            const gridLines: { x1: number; y1: number; x2: number; y2: number; major: boolean }[] = [];
            if (!isContainer) {
              for (let x = 0; x <= bed.widthCm; x += gridSpacing) {
                const isMajor = units === 'metric'
                  ? x % majorSpacing === 0
                  : Math.abs(x % majorSpacing) < 0.1 || Math.abs((x % majorSpacing) - majorSpacing) < 0.1;
                gridLines.push({ x1: x * scale, y1: 0, x2: x * scale, y2: height, major: isMajor });
              }
              for (let y = 0; y <= bed.lengthCm; y += gridSpacing) {
                const isMajor = units === 'metric'
                  ? y % majorSpacing === 0
                  : Math.abs(y % majorSpacing) < 0.1 || Math.abs((y % majorSpacing) - majorSpacing) < 0.1;
                gridLines.push({ x1: 0, y1: y * scale, x2: width, y2: y * scale, major: isMajor });
              }
            }

            const sunIcon = bed.sunExposure === 'full' ? '☀️' : bed.sunExposure === 'partial' ? '⛅' : '☁️';

            // Label font size scales with zoom to prevent overlap when zoomed out
            // At BASE_SCALE (2px/cm), use 12px. Scale proportionally but cap at minimum 8px.
            const zoomRatio = scale / BASE_SCALE;
            const labelFontSize = Math.max(8, Math.round(12 * zoomRatio));
            const labelYOffset = labelFontSize + 4;
            // Hide labels entirely if they'd be too small to read
            const showLabel = labelFontSize >= 8;

            // Colors: containers are dark gray, beds are tan
            const fillColor = isContainer ? '#4a4a4a' : '#f5f0e6';
            const strokeColor = isBeingMoved ? '#3b82f6' : (isContainer ? '#333333' : '#8b7355');

            return (
              <g key={bed.id}>
                {/* Selection highlight */}
                {isSelected && !isBeingMoved && (
                  isContainer ? (
                    <circle
                      cx={centerX}
                      cy={centerY}
                      r={radius + 4}
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      strokeDasharray="6 3"
                    />
                  ) : (
                    <rect
                      x={svgX - 4}
                      y={svgY - 4}
                      width={width + 8}
                      height={height + 8}
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      strokeDasharray="6 3"
                      rx={6}
                    />
                  )
                )}

                {/* Bed/Container background */}
                {isContainer ? (
                  <circle
                    cx={centerX}
                    cy={centerY}
                    r={radius}
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth={2}
                    strokeDasharray={isBeingMoved ? '6 3' : 'none'}
                    style={{ cursor: bedsLocked ? 'default' : 'move' }}
                    onClick={(e) => handleBedClick(e, bed.id)}
                    onMouseDown={(e) => handleBedMoveStart(e, bed)}
                  />
                ) : (
                  <rect
                    x={svgX}
                    y={svgY}
                    width={width}
                    height={height}
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth={2}
                    strokeDasharray={isBeingMoved ? '6 3' : 'none'}
                    rx={4}
                    style={{ cursor: bedsLocked ? 'default' : 'move' }}
                    onClick={(e) => handleBedClick(e, bed.id)}
                    onMouseDown={(e) => handleBedMoveStart(e, bed)}
                  />
                )}

                {/* Grid lines (beds only) */}
                {gridLines.map((line, i) => (
                  <line
                    key={i}
                    x1={svgX + line.x1}
                    y1={svgY + line.y1}
                    x2={svgX + line.x2}
                    y2={svgY + line.y2}
                    stroke={line.major ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.06)'}
                    strokeWidth={line.major ? 1 : 0.5}
                    style={{ pointerEvents: 'none' }}
                  />
                ))}

                {/* Bed label */}
                {showLabel && (
                  <text
                    x={svgX + 8}
                    y={svgY - labelYOffset}
                    fill="#5c4d3d"
                    fontSize={labelFontSize}
                    fontWeight={600}
                    style={{ pointerEvents: 'none' }}
                  >
                    {bed.name} {sunIcon}
                  </text>
                )}

                {/* Bed actions when selected */}
                {isSelected && !isBeingMoved && (
                  <g>
                    {/* Duplicate button */}
                    <g
                      style={{ cursor: 'pointer' }}
                      onClick={(e) => { e.stopPropagation(); onDuplicateBed(bed); }}
                    >
                      <title>Duplicate</title>
                      <rect
                        x={svgX + width - 76}
                        y={svgY - 24}
                        width={24}
                        height={20}
                        fill="white"
                        stroke="#ddd"
                        rx={4}
                      />
                      <Copy
                        x={svgX + width - 70}
                        y={svgY - 22}
                        width={12}
                        height={16}
                        color="#666"
                      />
                    </g>
                    {/* Edit button */}
                    <g
                      style={{ cursor: 'pointer' }}
                      onClick={(e) => { e.stopPropagation(); onEditBed(bed); }}
                    >
                      <title>Edit</title>
                      <rect
                        x={svgX + width - 50}
                        y={svgY - 24}
                        width={24}
                        height={20}
                        fill="white"
                        stroke="#ddd"
                        rx={4}
                      />
                      <Pencil
                        x={svgX + width - 44}
                        y={svgY - 22}
                        width={12}
                        height={16}
                        color="#666"
                      />
                    </g>
                    {/* Delete button */}
                    <g
                      style={{ cursor: 'pointer' }}
                      onClick={(e) => { e.stopPropagation(); onDeleteBed(bed); }}
                    >
                      <title>Delete</title>
                      <rect
                        x={svgX + width - 24}
                        y={svgY - 24}
                        width={24}
                        height={20}
                        fill="white"
                        stroke="#ddd"
                        rx={4}
                      />
                      <Trash2
                        x={svgX + width - 18}
                        y={svgY - 22}
                        width={12}
                        height={16}
                        color="#666"
                      />
                    </g>
                  </g>
                )}
              </g>
            );
          })}

          {/* Drag preview for new placements */}
          {dragPreview && (
            dragPreview.isContainer ? (
              // Container preview: circle(s) representing the plant(s)
              (() => {
                const bed = beds.find(b => b.id === dragPreview.bedId);
                if (!bed) return null;
                const bedX = bed.positionX ?? 0;
                const bedY = bed.positionY ?? 0;
                const containerRadius = (bed.widthCm * scale) / 2;
                const centerX = toSvgX(bedX) + containerRadius;
                const centerY = toSvgY(bedY) + containerRadius;
                const plantRadius = (dragPreview.widthCm * scale) / 2;
                const quantity = dragPreview.containerQuantity ?? 1;
                const previewColor = !dragPreview.valid ? '#ef4444' : dragPreview.isPartial ? '#f59e0b' : dragPreview.color;
                const positions = getContainerPlantPositions(
                  quantity,
                  bed.widthCm,
                  dragPreview.widthCm,
                  centerX,
                  centerY,
                  scale
                );
                return (
                  <>
                    {positions.map((pos, i) => (
                      <circle
                        key={i}
                        cx={pos.x}
                        cy={pos.y}
                        r={plantRadius}
                        fill={previewColor}
                        fillOpacity={0.4}
                        stroke={previewColor}
                        strokeWidth={2}
                        strokeDasharray={dragPreview.valid ? 'none' : '4 2'}
                      />
                    ))}
                    {dragPreview.isPartial && dragPreview.partialQuantity != null && (
                      <text
                        x={centerX}
                        y={centerY}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="#92400e"
                        fontSize={12}
                        fontWeight={600}
                        style={{ pointerEvents: 'none' }}
                      >
                        {dragPreview.partialQuantity} of {dragPreview.requestedQuantity}
                      </text>
                    )}
                  </>
                );
              })()
            ) : (
              // Regular bed preview: rectangle
              (() => {
                const previewColor = !dragPreview.valid ? '#ef4444' : dragPreview.isPartial ? '#f59e0b' : dragPreview.color;
                const rectX = toSvgX(dragPreview.xCm);
                const rectY = toSvgY(dragPreview.yCm);
                const rectW = dragPreview.widthCm * scale;
                const rectH = dragPreview.heightCm * scale;
                return (
                  <>
                    <rect
                      x={rectX}
                      y={rectY}
                      width={rectW}
                      height={rectH}
                      fill={previewColor}
                      fillOpacity={0.3}
                      stroke={previewColor}
                      strokeWidth={2}
                      strokeDasharray={dragPreview.valid ? 'none' : '4 2'}
                      rx={4}
                    />
                    {dragPreview.isPartial && dragPreview.partialQuantity != null && (
                      <text
                        x={rectX + rectW / 2}
                        y={rectY + rectH / 2}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="#92400e"
                        fontSize={12}
                        fontWeight={600}
                        style={{ pointerEvents: 'none' }}
                      >
                        {dragPreview.partialQuantity} of {dragPreview.requestedQuantity}
                      </text>
                    )}
                  </>
                );
              })()
            )
          )}

          {/* Planting footprints - sort so selected placement renders last (on top) */}
          {[...footprints].sort((a, b) => {
            // Selected placement should render last (on top)
            if (a.placement.id === selectedPlacement) return 1;
            if (b.placement.id === selectedPlacement) return -1;
            return 0;
          }).map((footprint) => {
            const { placement, planting, widthCm, heightCm, rows, cols, color, bed, isHarvesting, growthFactor } = footprint;
            if (!bed) return null;

            const isBeingMoved = movingPlacement?.id === placement.id;
            const isBeingResized = resizing?.placementId === placement.id;

            const bedX = bed.positionX ?? 0;
            const bedY = bed.positionY ?? 0;

            // Calculate absolute position
            let absX: number, absY: number, dispWidth: number, dispHeight: number;
            let dispCols = cols, dispRows = rows;

            if (isBeingMoved && movePreview && hasDragged) {
              absX = bedX + movePreview.xCm;
              absY = bedY + movePreview.yCm;
              dispWidth = widthCm;
              dispHeight = heightCm;
            } else if (isBeingResized && resizePreview) {
              absX = bedX + resizePreview.xCm;
              absY = bedY + resizePreview.yCm;
              dispWidth = resizePreview.widthCm;
              dispHeight = resizePreview.heightCm;
              dispCols = resizePreview.cols;
              dispRows = resizePreview.rows;
            } else if (committedMove && committedMove.placementId === placement.id) {
              // Use committed position while waiting for async update to complete
              absX = bedX + committedMove.xCm;
              absY = bedY + committedMove.yCm;
              dispWidth = widthCm;
              dispHeight = heightCm;
            } else {
              absX = footprint.absoluteX;
              absY = footprint.absoluteY;
              dispWidth = widthCm;
              dispHeight = heightCm;
            }

            const svgX = toSvgX(absX);
            const svgY = toSvgY(absY);
            const width = dispWidth * scale;
            const height = dispHeight * scale;

            const isSelected = selectedPlacement === placement.id;
            const isInteracting = (isBeingMoved && hasDragged) || isBeingResized;

            const displayQuantity = isBeingResized && resizePreview
              ? resizePreview.quantity
              : placement.quantity;

            // Generate plant dots
            const dots: { cx: number; cy: number }[] = [];
            let plantIndex = 0;
            for (let row = 0; row < dispRows && plantIndex < displayQuantity; row++) {
              for (let col = 0; col < dispCols && plantIndex < displayQuantity; col++) {
                const dotX = svgX + (col + 0.5) * placement.spacingCm * scale;
                const dotY = svgY + (row + 0.5) * placement.spacingCm * scale;
                dots.push({ cx: dotX, cy: dotY });
                plantIndex++;
              }
            }

            const isInvalid = (isBeingMoved && movePreview && hasDragged && !movePreview.valid) ||
                              (isBeingResized && resizePreview && !resizePreview.valid);

            const isHovered = hoveredPlacement === placement.id;
            const showMaturePreview = isHovered && growthFactor < 1 && !isInteracting;
            const isInContainer = bed.shape === 'container';

            // For containers: calculate centered position for the plant circle
            const containerRadius = isInContainer ? (bed.widthCm * scale) / 2 : 0;
            const containerCenterX = isInContainer ? toSvgX(bedX) + containerRadius : 0;
            const containerCenterY = isInContainer ? toSvgY(bedY) + containerRadius : 0;
            const plantRadius = isInContainer ? calculatePlantDotRadius(placement.spacingCm, scale, growthFactor) : 0;
            const maturePlantRadius = isInContainer ? calculatePlantDotRadius(placement.spacingCm, scale, 1) : 0;

            return (
              <g
                key={placement.id}
                className={`${styles.footprint} ${isSelected ? styles.selected : ''}`}
                onClick={(e) => handleFootprintClick(e, placement.id)}
                onMouseEnter={() => setHoveredPlacement(placement.id)}
                onMouseLeave={() => setHoveredPlacement(null)}
              >
                {planting && <title>{planting.label}</title>}

                {isInContainer ? (
                  // Container placement: render plants using circle packing
                  (() => {
                    const containerQuantity = placement.quantity;
                    const plantPositions = getContainerPlantPositions(
                      containerQuantity,
                      bed.widthCm,
                      placement.spacingCm,
                      containerCenterX,
                      containerCenterY,
                      scale
                    );

                    return (
                      <>
                        {/* Selection highlight - circle around all plants */}
                        {isSelected && !isInteracting && (
                          <circle
                            cx={containerCenterX}
                            cy={containerCenterY}
                            r={containerRadius - 2}
                            fill="none"
                            stroke="#3b82f6"
                            strokeWidth={2}
                            strokeDasharray="4 2"
                          />
                        )}

                        {/* Invisible drag target covering the container */}
                        <circle
                          cx={containerCenterX}
                          cy={containerCenterY}
                          r={containerRadius}
                          fill="transparent"
                          style={{ cursor: isInteracting ? 'grabbing' : 'grab' }}
                          onMouseDown={(e) => handlePlacementMoveStart(e, footprint)}
                        />

                        {/* Plant circles at packed positions */}
                        {plantPositions.map((pos, i) => (
                          <circle
                            key={i}
                            cx={pos.x}
                            cy={pos.y}
                            r={plantRadius}
                            fill={isInvalid ? '#ef4444' : color}
                            fillOpacity={isInteracting ? 0.5 : 0.6}
                            stroke={isInvalid ? '#ef4444' : color}
                            strokeWidth={2}
                            strokeDasharray={isInteracting ? '4 2' : 'none'}
                            style={{ pointerEvents: 'none' }}
                          />
                        ))}

                        {/* Mature size preview on hover */}
                        {showMaturePreview && plantPositions.map((pos, i) => (
                          <circle
                            key={`mature-${i}`}
                            cx={pos.x}
                            cy={pos.y}
                            r={maturePlantRadius}
                            fill="none"
                            stroke={color}
                            strokeWidth={1.5}
                            strokeDasharray="3 2"
                            strokeOpacity={0.7}
                            style={{ pointerEvents: 'none' }}
                          />
                        ))}
                      </>
                    );
                  })()
                ) : (
                  // Regular bed placement: render as rectangle with dots
                  <>
                    {/* Selection highlight */}
                    {isSelected && !isInteracting && (
                      <rect
                        x={svgX - 3}
                        y={svgY - 3}
                        width={width + 6}
                        height={height + 6}
                        fill="none"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        strokeDasharray="4 2"
                        rx={6}
                      />
                    )}

                    {/* Footprint rectangle */}
                    <rect
                      x={svgX}
                      y={svgY}
                      width={width}
                      height={height}
                      fill={isInvalid ? '#ef4444' : color}
                      fillOpacity={isInteracting ? 0.4 : 0.3}
                      stroke={isInvalid ? '#ef4444' : color}
                      strokeWidth={2}
                      strokeDasharray={isInteracting ? '4 2' : 'none'}
                      rx={4}
                      style={{ cursor: isInteracting ? 'grabbing' : 'grab' }}
                      onMouseDown={(e) => handlePlacementMoveStart(e, footprint)}
                    />

                    {/* Plant dots - size based on growth stage */}
                    {dots.map((dot, i) => (
                      <circle
                        key={i}
                        cx={dot.cx}
                        cy={dot.cy}
                        r={calculatePlantDotRadius(placement.spacingCm, scale, growthFactor)}
                        fill={isInvalid ? '#ef4444' : color}
                        fillOpacity={0.6}
                        style={{ pointerEvents: 'none' }}
                      />
                    ))}

                    {/* Mature size preview on hover - dotted circles showing full size */}
                    {showMaturePreview && dots.map((dot, i) => (
                      <circle
                        key={`mature-${i}`}
                        cx={dot.cx}
                        cy={dot.cy}
                        r={calculatePlantDotRadius(placement.spacingCm, scale, 1)}
                        fill="none"
                        stroke={color}
                        strokeWidth={1.5}
                        strokeDasharray="3 2"
                        strokeOpacity={0.7}
                        style={{ pointerEvents: 'none' }}
                      />
                    ))}

                    {/* Label */}
                    {planting && width > 40 && height > 20 && (
                      <text
                        x={svgX + width / 2}
                        y={svgY + height / 2}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill={isInvalid ? '#ef4444' : color}
                        fontSize={Math.min(12, height * 0.3)}
                        fontWeight={600}
                        style={{ pointerEvents: 'none' }}
                      >
                        {footprint.cultivar ? `${footprint.cultivar.crop} ${footprint.cultivar.variety}` : planting.label.split(' ')[0]} {placement.quantity} of {planting.quantity ?? 1}
                      </text>
                    )}
                  </>
                )}

                {/* Harvest indicator - scissors icon */}
                {isHarvesting && !isInteracting && (
                  <foreignObject
                    x={isInContainer ? containerCenterX + maturePlantRadius - 8 : svgX + width - 14}
                    y={isInContainer ? containerCenterY - maturePlantRadius - 8 : svgY - 2}
                    width={16}
                    height={16}
                    style={{ pointerEvents: 'none' }}
                  >
                    <div
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        backgroundColor: '#d07a00',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Scissors size={10} color="white" strokeWidth={2.5} />
                    </div>
                  </foreignObject>
                )}

                {/* Quantity indicator during resize (beds only) */}
                {!isInContainer && isBeingResized && resizePreview && (
                  <text
                    x={svgX + width / 2}
                    y={svgY + height + 14}
                    textAnchor="middle"
                    fill="#333"
                    fontSize={11}
                    fontWeight={500}
                    style={{ pointerEvents: 'none' }}
                  >
                    {resizePreview.quantity} plant{resizePreview.quantity !== 1 ? 's' : ''}
                  </text>
                )}

                {/* Resize handles and delete button */}
                {isSelected && !isInteracting && (
                  isInContainer ? (
                    // Container: just delete button, no resize handles
                    <g
                      style={{ cursor: 'pointer' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onPlacementDelete(footprint.placement.id);
                        setSelectedPlacement(null);
                      }}
                    >
                      <circle
                        cx={containerCenterX + maturePlantRadius + 4}
                        cy={containerCenterY - maturePlantRadius - 4}
                        r={8}
                        fill="#ef4444"
                      />
                      <path
                        d={`M${containerCenterX + maturePlantRadius + 1},${containerCenterY - maturePlantRadius - 7} L${containerCenterX + maturePlantRadius + 7},${containerCenterY - maturePlantRadius - 1} M${containerCenterX + maturePlantRadius + 7},${containerCenterY - maturePlantRadius - 7} L${containerCenterX + maturePlantRadius + 1},${containerCenterY - maturePlantRadius - 1}`}
                        stroke="white"
                        strokeWidth={2}
                        strokeLinecap="round"
                      />
                    </g>
                  ) : (
                    // Bed: resize handles + delete button
                    <>
                      <rect
                        x={svgX - handleSize / 2}
                        y={svgY - handleSize / 2}
                        width={handleSize}
                        height={handleSize}
                        fill="white"
                        stroke="#3b82f6"
                        strokeWidth={1.5}
                        rx={2}
                        style={{ cursor: 'nwse-resize' }}
                        onMouseDown={(e) => handleResizeStart(e, footprint, 'nw')}
                      />
                      <rect
                        x={svgX + width - handleSize / 2}
                        y={svgY - handleSize / 2}
                        width={handleSize}
                        height={handleSize}
                        fill="white"
                        stroke="#3b82f6"
                        strokeWidth={1.5}
                        rx={2}
                        style={{ cursor: 'nesw-resize' }}
                        onMouseDown={(e) => handleResizeStart(e, footprint, 'ne')}
                      />
                      <rect
                        x={svgX - handleSize / 2}
                        y={svgY + height - handleSize / 2}
                        width={handleSize}
                        height={handleSize}
                        fill="white"
                        stroke="#3b82f6"
                        strokeWidth={1.5}
                        rx={2}
                        style={{ cursor: 'nesw-resize' }}
                        onMouseDown={(e) => handleResizeStart(e, footprint, 'sw')}
                      />
                      <rect
                        x={svgX + width - handleSize / 2}
                        y={svgY + height - handleSize / 2}
                        width={handleSize}
                        height={handleSize}
                        fill="white"
                        stroke="#3b82f6"
                        strokeWidth={1.5}
                        rx={2}
                        style={{ cursor: 'nwse-resize' }}
                        onMouseDown={(e) => handleResizeStart(e, footprint, 'se')}
                      />
                      {/* Delete button */}
                      <g
                        style={{ cursor: 'pointer' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onPlacementDelete(footprint.placement.id);
                          setSelectedPlacement(null);
                        }}
                      >
                        <circle
                          cx={svgX + width + 4}
                          cy={svgY - 4}
                          r={8}
                          fill="#ef4444"
                        />
                        <path
                          d={`M${svgX + width + 1},${svgY - 7} L${svgX + width + 7},${svgY - 1} M${svgX + width + 7},${svgY - 7} L${svgX + width + 1},${svgY - 1}`}
                          stroke="white"
                          strokeWidth={2}
                          strokeLinecap="round"
                        />
                      </g>
                    </>
                  )
                )}
              </g>
            );
          })}

          {/* Auto-layout suggestion previews */}
          {suggestionFootprints.map(({ suggestion, planting, cultivar, widthCm, heightCm, rows, cols, color, absoluteX, absoluteY }) => {
            const svgX = toSvgX(absoluteX);
            const svgY = toSvgY(absoluteY);
            const width = widthCm * scale;
            const height = heightCm * scale;

            const dots: { cx: number; cy: number }[] = [];
            let plantIndex = 0;
            for (let row = 0; row < rows && plantIndex < suggestion.quantity; row++) {
              for (let col = 0; col < cols && plantIndex < suggestion.quantity; col++) {
                const dotX = svgX + (col + 0.5) * suggestion.spacingCm * scale;
                const dotY = svgY + (row + 0.5) * suggestion.spacingCm * scale;
                dots.push({ cx: dotX, cy: dotY });
                plantIndex++;
              }
            }

            return (
              <g key={suggestion.plantingId} className={styles.suggestionPreview}>
                <rect
                  x={svgX - 2}
                  y={svgY - 2}
                  width={width + 4}
                  height={height + 4}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  rx={6}
                />
                <rect
                  x={svgX}
                  y={svgY}
                  width={width}
                  height={height}
                  fill={color}
                  fillOpacity={0.15}
                  stroke="none"
                  rx={4}
                />
                {dots.map((dot, i) => (
                  <circle
                    key={i}
                    cx={dot.cx}
                    cy={dot.cy}
                    r={Math.min(suggestion.spacingCm * scale * 0.3, 8)}
                    fill={color}
                    fillOpacity={0.35}
                  />
                ))}
                {planting && width > 40 && height > 20 && (
                  <text
                    x={svgX + width / 2}
                    y={svgY + height / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={color}
                    fontSize={Math.min(12, height * 0.3)}
                    fontWeight={600}
                    opacity={0.7}
                    style={{ pointerEvents: 'none' }}
                  >
                    {cultivar ? `${cultivar.crop} ${cultivar.variety}` : planting.label.split(' ')[0]} ({suggestion.quantity})
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Empty state */}
        {beds.length === 0 && (
          <div className={styles.emptyOverlay}>
            <span>No beds yet. Add a bed to get started.</span>
          </div>
        )}

      </div>
    </div>
  );
}
