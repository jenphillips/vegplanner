import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';

// ============================================
// Mock Setup
// ============================================

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';

const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockExistsSync = vi.mocked(existsSync);

beforeEach(() => {
  vi.resetAllMocks();
  mockWriteFile.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.resetAllMocks();
});

// Helper to create params promise
const createParams = (collection: string) => Promise.resolve({ collection });

// ============================================
// GET Tests
// ============================================

describe('GET /api/data/[collection]', () => {
  describe('valid collections', () => {
    it.each([
      'plantings',
      'tasks',
      'garden-beds',
      'placements',
      'plans',
    ])('returns data for %s collection', async (collection) => {
      const testData = [{ id: '1', name: 'Test' }];
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(JSON.stringify(testData));

      const request = new NextRequest('http://localhost/api/data/' + collection);
      const response = await GET(request, { params: createParams(collection) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(testData);
    });

    it('returns empty array when file does not exist', async () => {
      mockExistsSync.mockReturnValue(false);

      const request = new NextRequest('http://localhost/api/data/plantings');
      const response = await GET(request, { params: createParams('plantings') });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual([]);
    });

    it('reads from correct file path', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue('[]');

      const request = new NextRequest('http://localhost/api/data/garden-beds');
      await GET(request, { params: createParams('garden-beds') });

      expect(mockReadFile).toHaveBeenCalledWith(
        expect.stringContaining('data/garden-beds.json'),
        'utf-8'
      );
    });
  });

  describe('invalid collections', () => {
    it('returns 400 for invalid collection name', async () => {
      const request = new NextRequest('http://localhost/api/data/invalid');
      const response = await GET(request, { params: createParams('invalid') });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid collection: invalid');
    });

    it('returns 400 for empty collection name', async () => {
      const request = new NextRequest('http://localhost/api/data/');
      const response = await GET(request, { params: createParams('') });

      expect(response.status).toBe(400);
    });

    it('returns 400 for collection with path traversal attempt', async () => {
      const request = new NextRequest('http://localhost/api/data/../secret');
      const response = await GET(request, { params: createParams('../secret') });

      expect(response.status).toBe(400);
    });
  });

  describe('error handling', () => {
    it('returns 500 when file read fails', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockRejectedValue(new Error('Read error'));

      const request = new NextRequest('http://localhost/api/data/plantings');
      const response = await GET(request, { params: createParams('plantings') });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to read plantings');
    });

    it('returns 500 when JSON parse fails', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue('invalid json {{{');

      const request = new NextRequest('http://localhost/api/data/plantings');
      const response = await GET(request, { params: createParams('plantings') });

      expect(response.status).toBe(500);
    });
  });
});

// ============================================
// POST Tests
// ============================================

describe('POST /api/data/[collection]', () => {
  describe('valid collections', () => {
    it.each([
      'plantings',
      'tasks',
      'garden-beds',
      'placements',
      'plans',
    ])('saves data to %s collection', async (collection) => {
      const testData = [{ id: '1', name: 'Test' }];

      const request = new NextRequest('http://localhost/api/data/' + collection, {
        method: 'POST',
        body: JSON.stringify(testData),
      });

      const response = await POST(request, { params: createParams(collection) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('writes to correct file path', async () => {
      const testData = [{ id: '1' }];

      const request = new NextRequest('http://localhost/api/data/placements', {
        method: 'POST',
        body: JSON.stringify(testData),
      });

      await POST(request, { params: createParams('placements') });

      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('data/placements.json'),
        expect.any(String),
        'utf-8'
      );
    });

    it('writes formatted JSON', async () => {
      const testData = [{ id: '1', name: 'Test' }];

      const request = new NextRequest('http://localhost/api/data/plantings', {
        method: 'POST',
        body: JSON.stringify(testData),
      });

      await POST(request, { params: createParams('plantings') });

      const writtenContent = mockWriteFile.mock.calls[0][1] as string;
      expect(writtenContent).toContain('\n'); // Formatted with newlines
      expect(JSON.parse(writtenContent)).toEqual(testData);
    });

    it('saves empty array', async () => {
      const request = new NextRequest('http://localhost/api/data/plantings', {
        method: 'POST',
        body: JSON.stringify([]),
      });

      const response = await POST(request, { params: createParams('plantings') });

      expect(response.status).toBe(200);
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.any(String),
        '[]',
        'utf-8'
      );
    });

    it('saves complex nested data', async () => {
      const testData = [
        {
          id: '1',
          nested: {
            array: [1, 2, 3],
            object: { key: 'value' },
          },
        },
      ];

      const request = new NextRequest('http://localhost/api/data/plantings', {
        method: 'POST',
        body: JSON.stringify(testData),
      });

      await POST(request, { params: createParams('plantings') });

      const writtenContent = mockWriteFile.mock.calls[0][1] as string;
      expect(JSON.parse(writtenContent)).toEqual(testData);
    });
  });

  describe('invalid collections', () => {
    it('returns 400 for invalid collection name', async () => {
      const request = new NextRequest('http://localhost/api/data/invalid', {
        method: 'POST',
        body: JSON.stringify([]),
      });

      const response = await POST(request, { params: createParams('invalid') });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid collection: invalid');
    });
  });

  describe('error handling', () => {
    it('returns 500 when file write fails', async () => {
      mockWriteFile.mockRejectedValue(new Error('Write error'));

      const request = new NextRequest('http://localhost/api/data/plantings', {
        method: 'POST',
        body: JSON.stringify([]),
      });

      const response = await POST(request, { params: createParams('plantings') });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to write plantings');
    });

    it('returns 500 when request body is invalid JSON', async () => {
      const request = new NextRequest('http://localhost/api/data/plantings', {
        method: 'POST',
        body: 'invalid json',
      });

      const response = await POST(request, { params: createParams('plantings') });

      expect(response.status).toBe(500);
    });
  });
});

// ============================================
// Integration-style Tests
// ============================================

describe('API route integration', () => {
  it('round-trips data correctly', async () => {
    const testData = [
      { id: '1', name: 'Tomato', quantity: 6 },
      { id: '2', name: 'Spinach', quantity: 12 },
    ];

    // Save data
    const postRequest = new NextRequest('http://localhost/api/data/plantings', {
      method: 'POST',
      body: JSON.stringify(testData),
    });
    await POST(postRequest, { params: createParams('plantings') });

    // Capture what was written
    const writtenContent = mockWriteFile.mock.calls[0][1] as string;

    // Read it back
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue(writtenContent);

    const getRequest = new NextRequest('http://localhost/api/data/plantings');
    const response = await GET(getRequest, { params: createParams('plantings') });
    const data = await response.json();

    expect(data).toEqual(testData);
  });
});
