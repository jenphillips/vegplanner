import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const ALLOWED_COLLECTIONS = ['plantings', 'tasks', 'garden-beds'] as const;
type Collection = (typeof ALLOWED_COLLECTIONS)[number];

function getDataFilePath(collection: Collection): string {
  return path.join(process.cwd(), 'data', `${collection}.json`);
}

function isValidCollection(collection: string): collection is Collection {
  return ALLOWED_COLLECTIONS.includes(collection as Collection);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ collection: string }> }
) {
  const { collection } = await params;

  if (!isValidCollection(collection)) {
    return NextResponse.json(
      { error: `Invalid collection: ${collection}` },
      { status: 400 }
    );
  }

  const filePath = getDataFilePath(collection);

  if (!existsSync(filePath)) {
    // Return empty array if file doesn't exist yet
    return NextResponse.json([]);
  }

  try {
    const content = await readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    return NextResponse.json(data);
  } catch (error) {
    console.error(`Error reading ${collection}:`, error);
    return NextResponse.json(
      { error: `Failed to read ${collection}` },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ collection: string }> }
) {
  const { collection } = await params;

  if (!isValidCollection(collection)) {
    return NextResponse.json(
      { error: `Invalid collection: ${collection}` },
      { status: 400 }
    );
  }

  try {
    const data = await request.json();
    const filePath = getDataFilePath(collection);

    await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`Error writing ${collection}:`, error);
    return NextResponse.json(
      { error: `Failed to write ${collection}` },
      { status: 500 }
    );
  }
}
