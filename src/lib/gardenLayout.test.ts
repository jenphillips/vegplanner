import { describe, it, expect } from 'vitest';
import {
  calculateFootprint,
  calculateQuantityFromDimensions,
  isPlantingInGround,
  filterPlantingsInGround,
  checkCollisions,
  fitsInBed,
  getCropColor,
  getSeasonDateRange,
  autoLayout,
} from './gardenLayout';
import type { Planting, GardenBed, PlantingPlacement, Cultivar } from './types';

describe('calculateFootprint', () => {
  it('returns zero dimensions for zero quantity', () => {
    const result = calculateFootprint(0, 30);
    expect(result).toEqual({ widthCm: 0, heightCm: 0, rows: 0, cols: 0 });
  });

  it('returns zero dimensions for zero spacing', () => {
    const result = calculateFootprint(10, 0);
    expect(result).toEqual({ widthCm: 0, heightCm: 0, rows: 0, cols: 0 });
  });

  it('calculates footprint for single plant', () => {
    const result = calculateFootprint(1, 30);
    expect(result).toEqual({ widthCm: 30, heightCm: 30, rows: 1, cols: 1 });
  });

  it('calculates square-ish footprint for 4 plants', () => {
    const result = calculateFootprint(4, 30);
    expect(result).toEqual({ widthCm: 60, heightCm: 60, rows: 2, cols: 2 });
  });

  it('calculates footprint for 10 plants at 30cm spacing', () => {
    // ceil(sqrt(10)) = 4 cols, ceil(10/4) = 3 rows
    const result = calculateFootprint(10, 30);
    expect(result).toEqual({ widthCm: 120, heightCm: 90, rows: 3, cols: 4 });
  });

  it('calculates footprint for 6 plants at 15cm spacing', () => {
    // ceil(sqrt(6)) = 3 cols, ceil(6/3) = 2 rows
    const result = calculateFootprint(6, 15);
    expect(result).toEqual({ widthCm: 45, heightCm: 30, rows: 2, cols: 3 });
  });
});

describe('calculateQuantityFromDimensions', () => {
  it('calculates correct quantity for exact fit', () => {
    // 120cm wide, 90cm tall, 30cm spacing = 4x3 = 12 plants
    const result = calculateQuantityFromDimensions(120, 90, 30);
    expect(result).toEqual({ quantity: 12, rows: 3, cols: 4 });
  });

  it('floors partial columns and rows', () => {
    // 100cm wide = floor(100/30) = 3 cols
    // 80cm tall = floor(80/30) = 2 rows
    // = 6 plants
    const result = calculateQuantityFromDimensions(100, 80, 30);
    expect(result).toEqual({ quantity: 6, rows: 2, cols: 3 });
  });

  it('returns minimum of 1 plant for small dimensions', () => {
    const result = calculateQuantityFromDimensions(10, 10, 30);
    expect(result).toEqual({ quantity: 1, rows: 1, cols: 1 });
  });

  it('handles zero spacing gracefully', () => {
    const result = calculateQuantityFromDimensions(100, 100, 0);
    expect(result).toEqual({ quantity: 1, rows: 1, cols: 1 });
  });

  it('handles zero dimensions gracefully', () => {
    const result = calculateQuantityFromDimensions(0, 100, 30);
    expect(result).toEqual({ quantity: 1, rows: 1, cols: 1 });
  });

  it('is inverse of calculateFootprint for exact dimensions', () => {
    // Calculate footprint for 12 plants at 30cm spacing
    const footprint = calculateFootprint(12, 30);
    // Then calculate quantity from those dimensions
    const result = calculateQuantityFromDimensions(
      footprint.widthCm,
      footprint.heightCm,
      30
    );
    expect(result.quantity).toBe(12);
  });
});

describe('isPlantingInGround', () => {
  const directSowPlanting: Planting = {
    id: '1',
    cultivarId: 'lettuce',
    label: 'Lettuce #1',
    quantity: 10,
    sowDate: '2025-05-01',
    harvestStart: '2025-06-20',
    harvestEnd: '2025-07-04',
    method: 'direct',
    status: 'planned',
    successionNumber: 1,
    createdAt: '2025-01-01',
  };

  const transplantPlanting: Planting = {
    id: '2',
    cultivarId: 'tomato',
    label: 'Tomato #1',
    quantity: 5,
    sowDate: '2025-04-01',
    transplantDate: '2025-06-01',
    harvestStart: '2025-07-15',
    harvestEnd: '2025-09-30',
    method: 'transplant',
    status: 'planned',
    successionNumber: 1,
    createdAt: '2025-01-01',
  };

  it('returns true for direct sow planting on sow date', () => {
    expect(isPlantingInGround(directSowPlanting, '2025-05-01')).toBe(true);
  });

  it('returns true for direct sow planting during growing period', () => {
    expect(isPlantingInGround(directSowPlanting, '2025-06-15')).toBe(true);
  });

  it('returns true for direct sow planting on harvest end date', () => {
    expect(isPlantingInGround(directSowPlanting, '2025-07-04')).toBe(true);
  });

  it('returns false for direct sow planting before sow date', () => {
    expect(isPlantingInGround(directSowPlanting, '2025-04-30')).toBe(false);
  });

  it('returns false for direct sow planting after harvest end', () => {
    expect(isPlantingInGround(directSowPlanting, '2025-07-05')).toBe(false);
  });

  it('returns false for transplant planting before transplant date', () => {
    // Even though sowDate is April 1, transplant isn't in ground until June 1
    expect(isPlantingInGround(transplantPlanting, '2025-05-15')).toBe(false);
  });

  it('returns true for transplant planting on transplant date', () => {
    expect(isPlantingInGround(transplantPlanting, '2025-06-01')).toBe(true);
  });

  it('returns true for transplant planting during growing period', () => {
    expect(isPlantingInGround(transplantPlanting, '2025-08-01')).toBe(true);
  });
});

describe('filterPlantingsInGround', () => {
  const plantings: Planting[] = [
    {
      id: '1',
      cultivarId: 'lettuce',
      label: 'Lettuce #1',
      quantity: 10,
      sowDate: '2025-05-01',
      harvestStart: '2025-06-20',
      harvestEnd: '2025-07-04',
      method: 'direct',
      status: 'planned',
      successionNumber: 1,
      createdAt: '2025-01-01',
    },
    {
      id: '2',
      cultivarId: 'lettuce',
      label: 'Lettuce #2',
      quantity: 10,
      sowDate: '2025-06-01',
      harvestStart: '2025-07-20',
      harvestEnd: '2025-08-04',
      method: 'direct',
      status: 'planned',
      successionNumber: 2,
      createdAt: '2025-01-01',
    },
  ];

  it('returns empty array when no plantings are in ground', () => {
    const result = filterPlantingsInGround(plantings, '2025-04-01');
    expect(result).toHaveLength(0);
  });

  it('returns first planting when only it is in ground', () => {
    const result = filterPlantingsInGround(plantings, '2025-05-15');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('returns both plantings during overlap period', () => {
    const result = filterPlantingsInGround(plantings, '2025-06-15');
    expect(result).toHaveLength(2);
  });
});

describe('checkCollisions', () => {
  const existing = [
    { id: 'a', xCm: 0, yCm: 0, widthCm: 50, heightCm: 50 },
    { id: 'b', xCm: 100, yCm: 0, widthCm: 50, heightCm: 50 },
  ];

  it('detects no collision when rectangles are separate', () => {
    const result = checkCollisions(
      { xCm: 60, yCm: 0, widthCm: 30, heightCm: 30 },
      existing
    );
    expect(result.hasCollision).toBe(false);
    expect(result.overlappingPlacements).toHaveLength(0);
  });

  it('detects collision with first rectangle', () => {
    const result = checkCollisions(
      { xCm: 25, yCm: 25, widthCm: 30, heightCm: 30 },
      existing
    );
    expect(result.hasCollision).toBe(true);
    expect(result.overlappingPlacements).toContain('a');
  });

  it('detects collision with multiple rectangles', () => {
    const result = checkCollisions(
      { xCm: 25, yCm: 0, widthCm: 100, heightCm: 30 },
      existing
    );
    expect(result.hasCollision).toBe(true);
    expect(result.overlappingPlacements).toContain('a');
    expect(result.overlappingPlacements).toContain('b');
  });

  it('excludes specified id from collision check', () => {
    const result = checkCollisions(
      { xCm: 25, yCm: 25, widthCm: 30, heightCm: 30 },
      existing,
      'a'
    );
    expect(result.hasCollision).toBe(false);
  });
});

describe('fitsInBed', () => {
  const bed = { widthCm: 120, lengthCm: 240 };

  it('returns true for placement that fits', () => {
    expect(fitsInBed({ xCm: 0, yCm: 0, widthCm: 60, heightCm: 90 }, bed)).toBe(
      true
    );
  });

  it('returns true for placement at edge', () => {
    expect(fitsInBed({ xCm: 60, yCm: 150, widthCm: 60, heightCm: 90 }, bed)).toBe(
      true
    );
  });

  it('returns false for placement extending beyond width', () => {
    expect(fitsInBed({ xCm: 100, yCm: 0, widthCm: 60, heightCm: 60 }, bed)).toBe(
      false
    );
  });

  it('returns false for placement extending beyond length', () => {
    expect(fitsInBed({ xCm: 0, yCm: 200, widthCm: 60, heightCm: 60 }, bed)).toBe(
      false
    );
  });

  it('returns false for negative position', () => {
    expect(fitsInBed({ xCm: -10, yCm: 0, widthCm: 60, heightCm: 60 }, bed)).toBe(
      false
    );
  });
});

describe('getCropColor', () => {
  it('returns a red shade for Solanaceae family (Tomato)', () => {
    const color = getCropColor('Solanaceae', 'Tomato');
    // Solanaceae shades are: '#c0392b', '#e74c3c', '#ec7063'
    expect(['#c0392b', '#e74c3c', '#ec7063']).toContain(color);
  });

  it('returns a green shade for Asteraceae family (Lettuce)', () => {
    const color = getCropColor('Asteraceae', 'Lettuce');
    // Asteraceae shades are: '#229954', '#27ae60', '#52be80'
    expect(['#229954', '#27ae60', '#52be80']).toContain(color);
  });

  it('returns a yellow shade for Fabaceae family (Bush Bean)', () => {
    const color = getCropColor('Fabaceae', 'Bush Bean');
    // Fabaceae shades are: '#d4ac0d', '#f1c40f', '#f4d03f'
    expect(['#d4ac0d', '#f1c40f', '#f4d03f']).toContain(color);
  });

  it('returns default gray for unknown family', () => {
    const color = getCropColor(undefined, 'Artichoke');
    // Default shades are: '#7f8c8d', '#95a5a6', '#bdc3c7'
    expect(['#7f8c8d', '#95a5a6', '#bdc3c7']).toContain(color);
  });

  it('returns consistent color for same crop name', () => {
    const color1 = getCropColor('Solanaceae', 'Tomato');
    const color2 = getCropColor('Solanaceae', 'Tomato');
    expect(color1).toBe(color2);
  });

  it('returns different shades for different crops in same family', () => {
    // Different crops should get potentially different shades based on hash
    const tomatoColor = getCropColor('Solanaceae', 'Tomato');
    const pepperColor = getCropColor('Solanaceae', 'Bell Pepper');
    // Both should be in Solanaceae red shades
    expect(['#c0392b', '#e74c3c', '#ec7063']).toContain(tomatoColor);
    expect(['#c0392b', '#e74c3c', '#ec7063']).toContain(pepperColor);
  });
});

describe('getSeasonDateRange', () => {
  it('returns null for empty plantings', () => {
    expect(getSeasonDateRange([])).toBeNull();
  });

  it('returns correct range for single planting', () => {
    const plantings: Planting[] = [
      {
        id: '1',
        cultivarId: 'lettuce',
        label: 'Lettuce #1',
        quantity: 10,
        sowDate: '2025-05-01',
        harvestStart: '2025-06-20',
        harvestEnd: '2025-07-04',
        method: 'direct',
        status: 'planned',
        successionNumber: 1,
        createdAt: '2025-01-01',
      },
    ];
    const result = getSeasonDateRange(plantings);
    expect(result).toEqual({ start: '2025-05-01', end: '2025-07-04' });
  });

  it('returns full range across multiple plantings', () => {
    const plantings: Planting[] = [
      {
        id: '1',
        cultivarId: 'lettuce',
        label: 'Lettuce #1',
        quantity: 10,
        sowDate: '2025-05-01',
        harvestStart: '2025-06-20',
        harvestEnd: '2025-07-04',
        method: 'direct',
        status: 'planned',
        successionNumber: 1,
        createdAt: '2025-01-01',
      },
      {
        id: '2',
        cultivarId: 'tomato',
        label: 'Tomato #1',
        quantity: 5,
        sowDate: '2025-04-01',
        transplantDate: '2025-06-01',
        harvestStart: '2025-07-15',
        harvestEnd: '2025-09-30',
        method: 'transplant',
        status: 'planned',
        successionNumber: 1,
        createdAt: '2025-01-01',
      },
    ];
    const result = getSeasonDateRange(plantings);
    expect(result).toEqual({ start: '2025-04-01', end: '2025-09-30' });
  });
});

describe('autoLayout', () => {
  // Test fixtures
  const createPlanting = (id: string, cultivarId: string, quantity: number): Planting => ({
    id,
    cultivarId,
    label: `${cultivarId} #1`,
    quantity,
    sowDate: '2025-05-01',
    harvestStart: '2025-06-20',
    harvestEnd: '2025-07-04',
    method: 'direct',
    status: 'planned',
    successionNumber: 1,
    createdAt: '2025-01-01',
  });

  const createBed = (id: string, widthCm: number, lengthCm: number): GardenBed => ({
    id,
    name: `Bed ${id}`,
    widthCm,
    lengthCm,
    xPosition: 0,
    yPosition: 0,
    sunExposure: 'full',
  });

  const createCultivar = (id: string, spacingCm: number): Cultivar => ({
    id,
    crop: 'Test Crop',
    variety: 'Test Variety',
    spacingCm,
    daysToMaturity: 60,
    method: 'direct',
    sowIndoorsWeeks: 0,
    transplantAfterFrost: 0,
    sowAfterFrost: 0,
    frostSensitivity: 'tolerant',
    plantingWindowEarlyStart: 0,
    plantingWindowEarlyEnd: 0,
    plantingWindowLateStart: 0,
    plantingWindowLateEnd: 0,
  });

  it('places a planting in an empty bed', () => {
    const plantings = [createPlanting('p1', 'c1', 4)];
    const beds = [createBed('b1', 120, 240)];
    const cultivars = [createCultivar('c1', 30)];
    const quantities = new Map([['p1', 4]]);

    const suggestions = autoLayout(plantings, beds, [], cultivars, quantities);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].plantingId).toBe('p1');
    expect(suggestions[0].bedId).toBe('b1');
    expect(suggestions[0].xCm).toBe(0);
    expect(suggestions[0].yCm).toBe(0);
  });

  it('avoids collision with existing placement', () => {
    const plantings = [createPlanting('p2', 'c1', 4)];
    const beds = [createBed('b1', 120, 240)];
    const cultivars = [createCultivar('c1', 30)];
    // Existing placement at origin: 4 plants at 30cm = 60x60cm
    const existingPlacements: PlantingPlacement[] = [
      { id: 'pl1', plantingId: 'p1', bedId: 'b1', xCm: 0, yCm: 0, spacingCm: 30 },
    ];
    const quantities = new Map([['p1', 4], ['p2', 4]]);

    const suggestions = autoLayout(plantings, beds, existingPlacements, cultivars, quantities);

    expect(suggestions).toHaveLength(1);
    // Should not overlap with existing placement at (0,0) with size 60x60
    const suggestion = suggestions[0];
    const isOverlapping =
      suggestion.xCm < 60 && suggestion.xCm + 60 > 0 &&
      suggestion.yCm < 60 && suggestion.yCm + 60 > 0;
    expect(isOverlapping).toBe(false);
  });

  it('respects custom cols on existing placements', () => {
    // This test verifies the fix: existing placements with custom cols
    // should use their actual dimensions, not the default square-ish layout
    const plantings = [createPlanting('p2', 'c1', 4)];
    const beds = [createBed('b1', 120, 240)];
    const cultivars = [createCultivar('c1', 30)];
    // Existing placement: 12 plants in 1 column = 30cm wide x 360cm tall
    // But bed is only 240cm long, so let's use 6 plants: 1 col x 6 rows = 30x180cm
    const existingPlacements: PlantingPlacement[] = [
      { id: 'pl1', plantingId: 'p1', bedId: 'b1', xCm: 0, yCm: 0, spacingCm: 30, cols: 1 },
    ];
    const quantities = new Map([['p1', 6], ['p2', 4]]);

    const suggestions = autoLayout(plantings, beds, existingPlacements, cultivars, quantities);

    expect(suggestions).toHaveLength(1);
    const suggestion = suggestions[0];
    // Existing placement with cols=1 is 30cm wide x 180cm tall
    // New placement should be placed to the right (x >= 30) since that's where space is
    expect(suggestion.xCm).toBeGreaterThanOrEqual(30);
  });

  it('does not place suggestions that overlap each other', () => {
    // Place multiple plantings and ensure they don't overlap
    const plantings = [
      createPlanting('p1', 'c1', 4),
      createPlanting('p2', 'c1', 4),
      createPlanting('p3', 'c1', 4),
    ];
    const beds = [createBed('b1', 120, 240)];
    const cultivars = [createCultivar('c1', 30)];
    const quantities = new Map([['p1', 4], ['p2', 4], ['p3', 4]]);

    const suggestions = autoLayout(plantings, beds, [], cultivars, quantities);

    expect(suggestions).toHaveLength(3);

    // Check that no two suggestions overlap
    for (let i = 0; i < suggestions.length; i++) {
      for (let j = i + 1; j < suggestions.length; j++) {
        const s1 = suggestions[i];
        const s2 = suggestions[j];
        // 4 plants at 30cm spacing = 2x2 grid = 60x60cm
        const footprint = calculateFootprint(4, 30);

        // Check if they're in the same bed
        if (s1.bedId === s2.bedId) {
          const overlaps =
            s1.xCm < s2.xCm + footprint.widthCm &&
            s1.xCm + footprint.widthCm > s2.xCm &&
            s1.yCm < s2.yCm + footprint.heightCm &&
            s1.yCm + footprint.heightCm > s2.yCm;
          expect(overlaps).toBe(false);
        }
      }
    }
  });

  it('returns empty array when no space available', () => {
    const plantings = [createPlanting('p1', 'c1', 100)]; // Large planting
    const beds = [createBed('b1', 60, 60)]; // Small bed
    const cultivars = [createCultivar('c1', 30)];
    const quantities = new Map([['p1', 100]]);

    const suggestions = autoLayout(plantings, beds, [], cultivars, quantities);

    expect(suggestions).toHaveLength(0);
  });
});
