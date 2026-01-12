'use client';

import { useMemo, useRef, useState, useCallback } from 'react';
import {
  calculateFootprint,
  calculateFootprintWithLayout,
  calculateQuantityFromDimensions,
  getValidRectangleConfigs,
  getCropColor,
  checkCollisions,
  fitsInBed,
} from '@/lib/gardenLayout';
import type {
  GardenBed,
  PlantingPlacement,
  Planting,
  Cultivar,
  PlacementSuggestion,
} from '@/lib/types';
import styles from './BedCanvas.module.css';

type DragData = {
  plantingId: string;
  quantity: number;
  spacingCm: number;
  cropName: string;
  family?: string;
};

type Units = 'metric' | 'imperial';

type BedCanvasProps = {
  bed: GardenBed;
  placements: PlantingPlacement[];
  plantings: Planting[];
  cultivars: Cultivar[];
  scale: number; // pixels per cm
  units?: Units;
  suggestions?: PlacementSuggestion[]; // Auto-layout preview
  onEditBed: () => void;
  onDeleteBed: () => void;
  onPlacementCreate: (placement: Omit<PlantingPlacement, 'id'>) => void;
  onPlacementUpdate: (id: string, updates: Partial<PlantingPlacement>) => void;
  onPlacementDelete: (id: string) => void;
  onPlantingQuantityUpdate?: (plantingId: string, quantity: number) => void;
};

// Unit display helper
function bedDimensionsDisplay(widthCm: number, lengthCm: number, units: Units): string {
  if (units === 'metric') {
    return `${(widthCm / 100).toFixed(1)}m × ${(lengthCm / 100).toFixed(1)}m`;
  }
  const widthFt = (widthCm / 2.54 / 12).toFixed(1);
  const lengthFt = (lengthCm / 2.54 / 12).toFixed(1);
  return `${widthFt}ft × ${lengthFt}ft`;
}

// Grid line spacing in cm
const GRID_SPACING_CM_METRIC = 10; // 10cm minor lines
const GRID_MAJOR_CM_METRIC = 50;   // 50cm major lines

// Imperial grid: 6 inches = ~15.24cm, 1 foot = ~30.48cm
const INCH_CM = 2.54;
const GRID_SPACING_CM_IMPERIAL = 6 * INCH_CM;  // 6-inch minor lines (~15.24cm)
const GRID_MAJOR_CM_IMPERIAL = 12 * INCH_CM;   // 1-foot major lines (~30.48cm)

// Snap to grid size in cm (unchanged - works for both systems)
const SNAP_CM = 5;

function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

export function BedCanvas({
  bed,
  placements,
  plantings,
  cultivars,
  scale,
  units = 'metric',
  suggestions = [],
  onEditBed,
  onDeleteBed,
  onPlacementCreate,
  onPlacementUpdate,
  onPlacementDelete,
  onPlantingQuantityUpdate,
}: BedCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dragPreview, setDragPreview] = useState<{
    xCm: number;
    yCm: number;
    widthCm: number;
    heightCm: number;
    color: string;
    valid: boolean;
  } | null>(null);
  const [selectedPlacement, setSelectedPlacement] = useState<string | null>(null);

  // State for moving existing placements
  const [movingPlacement, setMovingPlacement] = useState<{
    id: string;
    startXCm: number;
    startYCm: number;
    offsetXCm: number;
    offsetYCm: number;
    widthCm: number;
    heightCm: number;
    color: string;
    startMouseX: number; // For detecting drag vs click
    startMouseY: number;
  } | null>(null);
  const [movePreview, setMovePreview] = useState<{
    xCm: number;
    yCm: number;
    valid: boolean;
  } | null>(null);

  // State for resizing placements
  const [resizing, setResizing] = useState<{
    placementId: string;
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
  } | null>(null);

  // Track if mouse has moved enough to count as a drag (vs a click)
  const [hasDragged, setHasDragged] = useState(false);
  const DRAG_THRESHOLD = 3; // pixels
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

  // Calculate SVG dimensions with padding for resize handles
  const handleSize = 10;
  const handlePadding = handleSize; // Padding on all sides for handles
  const svgWidth = bed.widthCm * scale + handlePadding * 2;
  const svgHeight = bed.lengthCm * scale + handlePadding * 2;

  // Build lookup maps
  const plantingMap = useMemo(
    () => new Map(plantings.map((p) => [p.id, p])),
    [plantings]
  );
  const cultivarMap = useMemo(
    () => new Map(cultivars.map((c) => [c.id, c])),
    [cultivars]
  );

  // Calculate footprints for all placements
  const footprints = useMemo(() => {
    return placements.map((placement) => {
      const planting = plantingMap.get(placement.plantingId);
      const cultivar = planting
        ? cultivarMap.get(planting.cultivarId)
        : undefined;
      const quantity = planting?.quantity ?? 1;
      // Use custom cols if specified, otherwise calculate default
      const { widthCm, heightCm, rows, cols } = placement.cols
        ? calculateFootprintWithLayout(quantity, placement.spacingCm, placement.cols)
        : calculateFootprint(quantity, placement.spacingCm);

      return {
        placement,
        planting,
        cultivar,
        widthCm,
        heightCm,
        rows,
        cols,
        color: getCropColor(cultivar?.family, cultivar?.crop ?? ''),
      };
    });
  }, [placements, plantingMap, cultivarMap]);

  // Calculate footprints for suggestion previews
  const suggestionFootprints = useMemo(() => {
    return suggestions.map((suggestion) => {
      const planting = plantingMap.get(suggestion.plantingId);
      const cultivar = planting
        ? cultivarMap.get(planting.cultivarId)
        : undefined;
      const quantity = planting?.quantity ?? 1;
      const { widthCm, heightCm, rows, cols } = calculateFootprint(
        quantity,
        suggestion.spacingCm
      );

      return {
        suggestion,
        planting,
        cultivar,
        widthCm,
        heightCm,
        rows,
        cols,
        color: getCropColor(cultivar?.family, cultivar?.crop ?? ''),
      };
    });
  }, [suggestions, plantingMap, cultivarMap]);

  // Generate grid lines based on units
  const gridLines = useMemo(() => {
    const lines: { x1: number; y1: number; x2: number; y2: number; major: boolean }[] = [];

    const gridSpacing = units === 'metric' ? GRID_SPACING_CM_METRIC : GRID_SPACING_CM_IMPERIAL;
    const majorSpacing = units === 'metric' ? GRID_MAJOR_CM_METRIC : GRID_MAJOR_CM_IMPERIAL;

    // Vertical lines
    for (let x = 0; x <= bed.widthCm; x += gridSpacing) {
      // For imperial, check if this is approximately a foot mark
      const isMajor = units === 'metric'
        ? x % majorSpacing === 0
        : Math.abs(x % majorSpacing) < 0.1 || Math.abs((x % majorSpacing) - majorSpacing) < 0.1;

      lines.push({
        x1: x * scale,
        y1: 0,
        x2: x * scale,
        y2: svgHeight,
        major: isMajor,
      });
    }

    // Horizontal lines
    for (let y = 0; y <= bed.lengthCm; y += gridSpacing) {
      const isMajor = units === 'metric'
        ? y % majorSpacing === 0
        : Math.abs(y % majorSpacing) < 0.1 || Math.abs((y % majorSpacing) - majorSpacing) < 0.1;

      lines.push({
        x1: 0,
        y1: y * scale,
        x2: svgWidth,
        y2: y * scale,
        major: isMajor,
      });
    }

    return lines;
  }, [bed.widthCm, bed.lengthCm, scale, svgWidth, svgHeight, units]);

  // Convert mouse position to cm coordinates (accounting for handle padding)
  const getPositionCm = (e: React.DragEvent | React.MouseEvent): { xCm: number; yCm: number } => {
    if (!canvasRef.current) return { xCm: 0, yCm: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - handlePadding;
    const y = e.clientY - rect.top - handlePadding;
    return {
      xCm: snapToGrid(x / scale, SNAP_CM),
      yCm: snapToGrid(y / scale, SNAP_CM),
    };
  };

  // Check if a placement is valid (no collisions, fits in bed)
  const isPlacementValid = (
    xCm: number,
    yCm: number,
    widthCm: number,
    heightCm: number,
    excludeId?: string
  ): boolean => {
    const candidate = { xCm, yCm, widthCm, heightCm };

    // Check bed bounds
    if (!fitsInBed(candidate, { widthCm: bed.widthCm, lengthCm: bed.lengthCm })) {
      return false;
    }

    // Check collisions with existing placements
    const existingFootprints = footprints.map((f) => ({
      id: f.placement.id,
      xCm: f.placement.xCm,
      yCm: f.placement.yCm,
      widthCm: f.widthCm,
      heightCm: f.heightCm,
    }));

    const collision = checkCollisions(candidate, existingFootprints, excludeId);
    return !collision.hasCollision;
  };

  // Find the best fitting rectangle configuration for a placement
  // Returns the first valid config that fits, preferring the default layout
  const findBestFittingConfig = (
    quantity: number,
    spacingCm: number,
    cursorXCm: number,
    cursorYCm: number,
    excludeId?: string
  ): { widthCm: number; heightCm: number; cols: number; xCm: number; yCm: number; valid: boolean } | null => {
    const allConfigs = getValidRectangleConfigs(quantity, spacingCm);

    // Try each configuration and both orientations
    for (const config of allConfigs) {
      const orientations = [
        { w: config.widthCm, h: config.heightCm, cols: config.cols },
        // Rotated: swap width/height, and cols becomes rows
        { w: config.heightCm, h: config.widthCm, cols: config.rows },
      ];

      for (const { w, h, cols } of orientations) {
        // Center on cursor
        const centeredX = Math.max(0, snapToGrid(cursorXCm - w / 2, SNAP_CM));
        const centeredY = Math.max(0, snapToGrid(cursorYCm - h / 2, SNAP_CM));

        if (isPlacementValid(centeredX, centeredY, w, h, excludeId)) {
          return { widthCm: w, heightCm: h, cols, xCm: centeredX, yCm: centeredY, valid: true };
        }
      }
    }

    // No valid config found - return the default for preview purposes (will show as invalid)
    const defaultFootprint = calculateFootprint(quantity, spacingCm);
    const centeredX = Math.max(0, snapToGrid(cursorXCm - defaultFootprint.widthCm / 2, SNAP_CM));
    const centeredY = Math.max(0, snapToGrid(cursorYCm - defaultFootprint.heightCm / 2, SNAP_CM));
    return {
      widthCm: defaultFootprint.widthCm,
      heightCm: defaultFootprint.heightCm,
      cols: defaultFootprint.cols,
      xCm: centeredX,
      yCm: centeredY,
      valid: false,
    };
  };

  // Handle drag over
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);

    try {
      const dataStr = e.dataTransfer.getData('application/json');
      if (!dataStr) return;

      const data: DragData = JSON.parse(dataStr);
      const { xCm, yCm } = getPositionCm(e);

      const bestFit = findBestFittingConfig(data.quantity, data.spacingCm, xCm, yCm);
      if (!bestFit) return;

      setDragPreview({
        xCm: bestFit.xCm,
        yCm: bestFit.yCm,
        widthCm: bestFit.widthCm,
        heightCm: bestFit.heightCm,
        color: getCropColor(data.family, data.cropName),
        valid: bestFit.valid,
      });
    } catch {
      // Data not available during dragover in some browsers
    }
  };

  // Handle drag enter (for getting data)
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  // Handle drag leave
  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if leaving the canvas entirely
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const { clientX, clientY } = e;
      if (
        clientX < rect.left ||
        clientX > rect.right ||
        clientY < rect.top ||
        clientY > rect.bottom
      ) {
        setDragOver(false);
        setDragPreview(null);
      }
    }
  };

  // Handle drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    setDragPreview(null);

    try {
      const dataStr = e.dataTransfer.getData('application/json');
      if (!dataStr) return;

      const data: DragData = JSON.parse(dataStr);
      const { xCm, yCm } = getPositionCm(e);

      // Find the best fitting configuration
      const bestFit = findBestFittingConfig(data.quantity, data.spacingCm, xCm, yCm);

      if (bestFit && bestFit.valid) {
        onPlacementCreate({
          plantingId: data.plantingId,
          bedId: bed.id,
          xCm: bestFit.xCm,
          yCm: bestFit.yCm,
          spacingCm: data.spacingCm,
          cols: bestFit.cols,
        });
      }
    } catch (err) {
      console.error('Failed to parse drop data:', err);
    }
  };

  // Handle click on footprint
  const handleFootprintClick = (e: React.MouseEvent, placementId: string) => {
    e.stopPropagation();
    // Don't change selection if we're in the middle of a move/resize
    if (movingPlacement || resizing) return;
    // Don't toggle selection if we just finished a mousedown/mouseup (handled by handleMoveStart)
    if (justFinishedInteraction.current) {
      justFinishedInteraction.current = false;
      return;
    }
    setSelectedPlacement(selectedPlacement === placementId ? null : placementId);
  };

  // Handle click outside to deselect
  // Use a ref to track if we just finished a move interaction
  const justFinishedInteraction = useRef(false);

  const handleCanvasClick = (e: React.MouseEvent) => {
    // Don't deselect if we're in the middle of or just finished an interaction
    if (movingPlacement || resizing || justFinishedInteraction.current) {
      justFinishedInteraction.current = false;
      return;
    }
    // Only deselect if clicking on the canvas background, not on a footprint
    // The footprint click handler will handle its own selection
    if (e.target === e.currentTarget || (e.target as Element).tagName === 'svg') {
      setSelectedPlacement(null);
    }
  };

  // --- MOVE HANDLERS ---

  // Start moving a placement (mousedown - may be click or drag)
  const handleMoveStart = (e: React.MouseEvent, footprint: typeof footprints[0]) => {
    e.stopPropagation();
    e.preventDefault();

    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseXCm = (e.clientX - rect.left - handlePadding) / scale;
    const mouseYCm = (e.clientY - rect.top - handlePadding) / scale;

    // Calculate offset from mouse to footprint origin
    const offsetXCm = mouseXCm - footprint.placement.xCm;
    const offsetYCm = mouseYCm - footprint.placement.yCm;

    // Reset drag detection
    setHasDragged(false);

    setMovingPlacement({
      id: footprint.placement.id,
      startXCm: footprint.placement.xCm,
      startYCm: footprint.placement.yCm,
      offsetXCm,
      offsetYCm,
      widthCm: footprint.widthCm,
      heightCm: footprint.heightCm,
      color: footprint.color,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
    });
    setMovePreview({
      xCm: footprint.placement.xCm,
      yCm: footprint.placement.yCm,
      valid: true,
    });
    // Select immediately on mousedown
    setSelectedPlacement(footprint.placement.id);
  };

  // Handle mouse move during placement move
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();

    // Handle moving
    if (movingPlacement) {
      // Check if we've moved past the drag threshold
      const deltaX = Math.abs(e.clientX - movingPlacement.startMouseX);
      const deltaY = Math.abs(e.clientY - movingPlacement.startMouseY);
      const isDragging = deltaX > DRAG_THRESHOLD || deltaY > DRAG_THRESHOLD;

      if (isDragging && !hasDragged) {
        setHasDragged(true);
      }

      // Only update preview if we're actually dragging
      if (isDragging || hasDragged) {
        const mouseXCm = (e.clientX - rect.left - handlePadding) / scale;
        const mouseYCm = (e.clientY - rect.top - handlePadding) / scale;

        const newXCm = snapToGrid(mouseXCm - movingPlacement.offsetXCm, SNAP_CM);
        const newYCm = snapToGrid(mouseYCm - movingPlacement.offsetYCm, SNAP_CM);

        // Clamp to bed bounds
        const clampedX = Math.max(0, Math.min(newXCm, bed.widthCm - movingPlacement.widthCm));
        const clampedY = Math.max(0, Math.min(newYCm, bed.lengthCm - movingPlacement.heightCm));

        const valid = isPlacementValid(
          clampedX,
          clampedY,
          movingPlacement.widthCm,
          movingPlacement.heightCm,
          movingPlacement.id
        );

        setMovePreview({
          xCm: clampedX,
          yCm: clampedY,
          valid,
        });
      }
    }

    // Handle resizing
    if (resizing) {
      const mouseX = e.clientX;
      const mouseY = e.clientY;

      // Calculate delta in cm
      const deltaXCm = (mouseX - resizing.startMouseX) / scale;
      const deltaYCm = (mouseY - resizing.startMouseY) / scale;

      // Calculate target dimensions based on corner being dragged
      let targetWidthCm = resizing.originalWidthCm;
      let targetHeightCm = resizing.originalHeightCm;
      let targetXCm = resizing.originalXCm;
      let targetYCm = resizing.originalYCm;

      if (resizing.corner === 'se') {
        targetWidthCm = Math.max(resizing.spacingCm, resizing.originalWidthCm + deltaXCm);
        targetHeightCm = Math.max(resizing.spacingCm, resizing.originalHeightCm + deltaYCm);
      } else if (resizing.corner === 'sw') {
        targetWidthCm = Math.max(resizing.spacingCm, resizing.originalWidthCm - deltaXCm);
        targetHeightCm = Math.max(resizing.spacingCm, resizing.originalHeightCm + deltaYCm);
        targetXCm = resizing.originalXCm + resizing.originalWidthCm - targetWidthCm;
      } else if (resizing.corner === 'ne') {
        targetWidthCm = Math.max(resizing.spacingCm, resizing.originalWidthCm + deltaXCm);
        targetHeightCm = Math.max(resizing.spacingCm, resizing.originalHeightCm - deltaYCm);
        targetYCm = resizing.originalYCm + resizing.originalHeightCm - targetHeightCm;
      } else if (resizing.corner === 'nw') {
        targetWidthCm = Math.max(resizing.spacingCm, resizing.originalWidthCm - deltaXCm);
        targetHeightCm = Math.max(resizing.spacingCm, resizing.originalHeightCm - deltaYCm);
        targetXCm = resizing.originalXCm + resizing.originalWidthCm - targetWidthCm;
        targetYCm = resizing.originalYCm + resizing.originalHeightCm - targetHeightCm;
      }

      // Calculate new quantity based on target dimensions (canvas is source of truth)
      const { quantity: newQuantity, rows: newRows, cols: newCols } = calculateQuantityFromDimensions(
        targetWidthCm,
        targetHeightCm,
        resizing.spacingCm
      );

      // Calculate actual dimensions from the computed rows/cols
      const actualWidthCm = newCols * resizing.spacingCm;
      const actualHeightCm = newRows * resizing.spacingCm;

      // Adjust position to keep the appropriate corner anchored
      let newXCm = resizing.originalXCm;
      let newYCm = resizing.originalYCm;

      if (resizing.corner === 'sw' || resizing.corner === 'nw') {
        newXCm = resizing.originalXCm + resizing.originalWidthCm - actualWidthCm;
      }
      if (resizing.corner === 'ne' || resizing.corner === 'nw') {
        newYCm = resizing.originalYCm + resizing.originalHeightCm - actualHeightCm;
      }

      // Snap position
      newXCm = snapToGrid(Math.max(0, newXCm), SNAP_CM);
      newYCm = snapToGrid(Math.max(0, newYCm), SNAP_CM);

      const valid = isPlacementValid(
        newXCm,
        newYCm,
        actualWidthCm,
        actualHeightCm,
        resizing.placementId
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

  // Handle mouse up to complete move or resize
  const handleMouseUp = () => {
    // Track that we just finished an interaction to prevent canvas click from deselecting
    if (movingPlacement || resizing) {
      justFinishedInteraction.current = true;
    }

    // Only apply move if user actually dragged (not just clicked)
    if (movingPlacement && movePreview && movePreview.valid && hasDragged) {
      onPlacementUpdate(movingPlacement.id, {
        xCm: movePreview.xCm,
        yCm: movePreview.yCm,
      });
    }
    // If it was just a click (no drag), selection is already set in handleMoveStart

    if (resizing && resizePreview && resizePreview.valid) {
      // Update placement position and layout
      onPlacementUpdate(resizing.placementId, {
        xCm: resizePreview.xCm,
        yCm: resizePreview.yCm,
        cols: resizePreview.cols,
      });

      // Update planting quantity (canvas is source of truth)
      if (onPlantingQuantityUpdate) {
        // Find the placement to get the plantingId
        const placement = placements.find((p) => p.id === resizing.placementId);
        if (placement) {
          onPlantingQuantityUpdate(placement.plantingId, resizePreview.quantity);
        }
      }
    }

    setMovingPlacement(null);
    setMovePreview(null);
    setResizing(null);
    setResizePreview(null);
    setHasDragged(false);
  };

  // Handle mouse leave to cancel move/resize
  const handleMouseLeave = () => {
    if (movingPlacement || resizing) {
      setMovingPlacement(null);
      setMovePreview(null);
      setResizing(null);
      setResizePreview(null);
      setHasDragged(false);
    }
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
    });
    setSelectedPlacement(footprint.placement.id);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Delete selected placement
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedPlacement) {
      e.preventDefault();
      onPlacementDelete(selectedPlacement);
      setSelectedPlacement(null);
      return;
    }

    // Escape to deselect
    if (e.key === 'Escape' && selectedPlacement) {
      setSelectedPlacement(null);
      return;
    }

    // Tab/Shift+Tab to cycle through placements
    if (e.key === 'Tab' && placements.length > 0) {
      e.preventDefault();
      const currentIndex = selectedPlacement
        ? placements.findIndex((p) => p.id === selectedPlacement)
        : -1;

      let nextIndex: number;
      if (e.shiftKey) {
        // Previous placement
        nextIndex = currentIndex <= 0 ? placements.length - 1 : currentIndex - 1;
      } else {
        // Next placement
        nextIndex = currentIndex >= placements.length - 1 ? 0 : currentIndex + 1;
      }

      setSelectedPlacement(placements[nextIndex].id);
    }
  };

  // Sun exposure icon
  const sunIcon = bed.sunExposure === 'full' ? '☀️' : bed.sunExposure === 'partial' ? '⛅' : '☁️';

  return (
    <div
      className={styles.container}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      role="application"
      aria-label={`Garden bed: ${bed.name}, ${bedDimensionsDisplay(bed.widthCm, bed.lengthCm, units)}, ${placements.length} planting${placements.length !== 1 ? 's' : ''}`}
    >
      {/* Bed Header */}
      <div className={styles.header}>
        <span className={styles.name}>{bed.name}</span>
        <span className={styles.dimensions}>
          {bedDimensionsDisplay(bed.widthCm, bed.lengthCm, units)}
        </span>
        <span className={styles.sun} title={`${bed.sunExposure} sun`}>
          {sunIcon}
        </span>
        <div className={styles.actions}>
          <button
            className={styles.actionButton}
            onClick={onEditBed}
            title="Edit bed"
          >
            ✏️
          </button>
          <button
            className={styles.actionButton}
            onClick={onDeleteBed}
            title="Delete bed"
          >
            🗑️
          </button>
        </div>
      </div>

      {/* SVG Canvas */}
      <div
        ref={canvasRef}
        className={`${styles.canvasWrapper} ${dragOver ? styles.dragOver : ''} ${(movingPlacement && hasDragged) || resizing ? styles.interacting : ''}`}
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
          {/* Background */}
          <rect
            x={handlePadding}
            y={handlePadding}
            width={bed.widthCm * scale}
            height={bed.lengthCm * scale}
            fill="#f5f0e6"
          />

          {/* Grid lines */}
          {gridLines.map((line, i) => (
            <line
              key={i}
              x1={line.x1 + handlePadding}
              y1={line.y1 + handlePadding}
              x2={line.x2 + handlePadding}
              y2={line.y2 + handlePadding}
              stroke={line.major ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.06)'}
              strokeWidth={line.major ? 1 : 0.5}
            />
          ))}

          {/* Drag preview */}
          {dragPreview && (
            <rect
              x={dragPreview.xCm * scale + handlePadding}
              y={dragPreview.yCm * scale + handlePadding}
              width={dragPreview.widthCm * scale}
              height={dragPreview.heightCm * scale}
              fill={dragPreview.valid ? dragPreview.color : '#ef4444'}
              fillOpacity={0.3}
              stroke={dragPreview.valid ? dragPreview.color : '#ef4444'}
              strokeWidth={2}
              strokeDasharray={dragPreview.valid ? 'none' : '4 2'}
              rx={4}
            />
          )}

          {/* Planting footprints */}
          {footprints.map((footprint) => {
            const { placement, planting, widthCm, heightCm, rows, cols, color } = footprint;
            const isBeingMoved = movingPlacement?.id === placement.id;
            const isBeingResized = resizing?.placementId === placement.id;

            // Use preview position if being moved/resized (add padding offset)
            // Only use move preview if actually dragging (not just clicked)
            const x = (isBeingMoved && movePreview && hasDragged
              ? movePreview.xCm * scale
              : isBeingResized && resizePreview
                ? resizePreview.xCm * scale
                : placement.xCm * scale) + handlePadding;
            const y = (isBeingMoved && movePreview && hasDragged
              ? movePreview.yCm * scale
              : isBeingResized && resizePreview
                ? resizePreview.yCm * scale
                : placement.yCm * scale) + handlePadding;
            const width = isBeingResized && resizePreview
              ? resizePreview.widthCm * scale
              : widthCm * scale;
            const height = isBeingResized && resizePreview
              ? resizePreview.heightCm * scale
              : heightCm * scale;

            const isSelected = selectedPlacement === placement.id;
            // Only show interacting state when actually dragging (not just clicked)
            const isInteracting = (isBeingMoved && hasDragged) || isBeingResized;

            // Calculate rows/cols for rendering dots
            // When resizing, use the preview values; otherwise use the planting's current values
            const displayCols = isBeingResized && resizePreview ? resizePreview.cols : cols;
            const displayRows = isBeingResized && resizePreview ? resizePreview.rows : rows;
            const displayQuantity = isBeingResized && resizePreview ? resizePreview.quantity : (planting?.quantity ?? 1);

            // Generate plant dot positions
            const dots: { cx: number; cy: number }[] = [];
            let plantIndex = 0;
            for (let row = 0; row < displayRows && plantIndex < displayQuantity; row++) {
              for (let col = 0; col < displayCols && plantIndex < displayQuantity; col++) {
                const dotX = x + (col + 0.5) * placement.spacingCm * scale;
                const dotY = y + (row + 0.5) * placement.spacingCm * scale;
                dots.push({ cx: dotX, cy: dotY });
                plantIndex++;
              }
            }

            // Check validity for display (only when actually dragging)
            const isInvalid = (isBeingMoved && movePreview && hasDragged && !movePreview.valid) ||
                              (isBeingResized && resizePreview && !resizePreview.valid);

            return (
              <g
                key={placement.id}
                className={`${styles.footprint} ${isSelected ? styles.selected : ''}`}
                onClick={(e) => handleFootprintClick(e, placement.id)}
              >
                {/* Tooltip on hover */}
                {planting && (
                  <title>{planting.label}</title>
                )}

                {/* Selection highlight */}
                {isSelected && !isInteracting && (
                  <rect
                    x={x - 3}
                    y={y - 3}
                    width={width + 6}
                    height={height + 6}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    strokeDasharray="4 2"
                    rx={6}
                  />
                )}

                {/* Footprint rectangle - draggable for moving */}
                <rect
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  fill={isInvalid ? '#ef4444' : color}
                  fillOpacity={isInteracting ? 0.4 : 0.3}
                  stroke={isInvalid ? '#ef4444' : color}
                  strokeWidth={2}
                  strokeDasharray={isInteracting ? '4 2' : 'none'}
                  rx={4}
                  style={{ cursor: isInteracting ? 'grabbing' : 'grab' }}
                  onMouseDown={(e) => handleMoveStart(e, footprint)}
                />

                {/* Plant dots */}
                {dots.map((dot, i) => (
                  <circle
                    key={i}
                    cx={dot.cx}
                    cy={dot.cy}
                    r={Math.min(placement.spacingCm * scale * 0.3, 8)}
                    fill={isInvalid ? '#ef4444' : color}
                    fillOpacity={0.6}
                    style={{ pointerEvents: 'none' }}
                  />
                ))}

                {/* Label */}
                {planting && width > 40 && height > 20 && (
                  <text
                    x={x + width / 2}
                    y={y + height / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={isInvalid ? '#ef4444' : color}
                    fontSize={Math.min(12, height * 0.3)}
                    fontWeight={600}
                    style={{ pointerEvents: 'none' }}
                  >
                    {planting.label.split(' ')[0]}
                  </text>
                )}

                {/* Quantity indicator during resize */}
                {isBeingResized && resizePreview && (
                  <text
                    x={x + width / 2}
                    y={y + height + 14}
                    textAnchor="middle"
                    fill="#333"
                    fontSize={11}
                    fontWeight={500}
                    style={{ pointerEvents: 'none' }}
                  >
                    {resizePreview.quantity} plant{resizePreview.quantity !== 1 ? 's' : ''}
                  </text>
                )}

                {/* Resize handles - show when selected and not actively dragging */}
                {isSelected && !isInteracting && (
                  <>
                    {/* NW corner */}
                    <rect
                      x={x - handleSize / 2}
                      y={y - handleSize / 2}
                      width={handleSize}
                      height={handleSize}
                      fill="white"
                      stroke="#3b82f6"
                      strokeWidth={1.5}
                      rx={2}
                      style={{ cursor: 'nwse-resize' }}
                      onMouseDown={(e) => handleResizeStart(e, footprint, 'nw')}
                    />
                    {/* NE corner */}
                    <rect
                      x={x + width - handleSize / 2}
                      y={y - handleSize / 2}
                      width={handleSize}
                      height={handleSize}
                      fill="white"
                      stroke="#3b82f6"
                      strokeWidth={1.5}
                      rx={2}
                      style={{ cursor: 'nesw-resize' }}
                      onMouseDown={(e) => handleResizeStart(e, footprint, 'ne')}
                    />
                    {/* SW corner */}
                    <rect
                      x={x - handleSize / 2}
                      y={y + height - handleSize / 2}
                      width={handleSize}
                      height={handleSize}
                      fill="white"
                      stroke="#3b82f6"
                      strokeWidth={1.5}
                      rx={2}
                      style={{ cursor: 'nesw-resize' }}
                      onMouseDown={(e) => handleResizeStart(e, footprint, 'sw')}
                    />
                    {/* SE corner */}
                    <rect
                      x={x + width - handleSize / 2}
                      y={y + height - handleSize / 2}
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
                        cx={x + width + 4}
                        cy={y - 4}
                        r={8}
                        fill="#ef4444"
                      />
                      <path
                        d={`M${x + width + 1},${y - 7} L${x + width + 7},${y - 1} M${x + width + 7},${y - 7} L${x + width + 1},${y - 1}`}
                        stroke="white"
                        strokeWidth={2}
                        strokeLinecap="round"
                      />
                    </g>
                  </>
                )}
              </g>
            );
          })}

          {/* Auto-layout suggestion previews */}
          {suggestionFootprints.map(({ suggestion, planting, widthCm, heightCm, rows, cols, color }) => {
            const x = suggestion.xCm * scale + handlePadding;
            const y = suggestion.yCm * scale + handlePadding;
            const width = widthCm * scale;
            const height = heightCm * scale;

            // Generate plant dot positions
            const dots: { cx: number; cy: number }[] = [];
            const quantity = planting?.quantity ?? 1;
            let plantIndex = 0;
            for (let row = 0; row < rows && plantIndex < quantity; row++) {
              for (let col = 0; col < cols && plantIndex < quantity; col++) {
                const dotX = x + (col + 0.5) * suggestion.spacingCm * scale;
                const dotY = y + (row + 0.5) * suggestion.spacingCm * scale;
                dots.push({ cx: dotX, cy: dotY });
                plantIndex++;
              }
            }

            return (
              <g key={suggestion.plantingId} className={styles.suggestionPreview}>
                {/* Dashed outline to indicate preview */}
                <rect
                  x={x - 2}
                  y={y - 2}
                  width={width + 4}
                  height={height + 4}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  rx={6}
                />

                {/* Footprint rectangle (more transparent) */}
                <rect
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  fill={color}
                  fillOpacity={0.15}
                  stroke="none"
                  rx={4}
                />

                {/* Plant dots (lighter) */}
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

                {/* Label */}
                {planting && width > 40 && height > 20 && (
                  <text
                    x={x + width / 2}
                    y={y + height / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={color}
                    fontSize={Math.min(12, height * 0.3)}
                    fontWeight={600}
                    opacity={0.7}
                    style={{ pointerEvents: 'none' }}
                  >
                    {planting.label.split(' ')[0]}
                  </text>
                )}
              </g>
            );
          })}

          {/* Border */}
          <rect
            x={handlePadding}
            y={handlePadding}
            width={bed.widthCm * scale}
            height={bed.lengthCm * scale}
            fill="none"
            stroke="#8b7355"
            strokeWidth={2}
          />
        </svg>

        {/* Empty state overlay */}
        {placements.length === 0 && !dragOver && (
          <div className={styles.emptyOverlay}>
            <span>Drag plantings here</span>
          </div>
        )}

      </div>

      {/* Bed notes */}
      {bed.notes && <div className={styles.notes}>{bed.notes}</div>}
    </div>
  );
}
