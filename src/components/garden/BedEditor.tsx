'use client';

import { useState, useEffect } from 'react';
import type { GardenBed } from '@/lib/types';
import styles from './BedEditor.module.css';

type Units = 'metric' | 'imperial';

type BedEditorProps = {
  bed?: GardenBed | null;
  units?: Units;
  onSave: (bed: Omit<GardenBed, 'id'>) => Promise<void>;
  onCancel: () => void;
};

// Conversion helpers
const CM_PER_INCH = 2.54;
const INCHES_PER_FOOT = 12;

function cmToInches(cm: number): number {
  return cm / CM_PER_INCH;
}

function inchesToCm(inches: number): number {
  return inches * CM_PER_INCH;
}

function cmToFeetAndInches(cm: number): { feet: number; inches: number } {
  const totalInches = cmToInches(cm);
  const feet = Math.floor(totalInches / INCHES_PER_FOOT);
  const inches = Math.round(totalInches % INCHES_PER_FOOT);
  return { feet, inches };
}

function feetAndInchesToCm(feet: number, inches: number): number {
  const totalInches = feet * INCHES_PER_FOOT + inches;
  return Math.round(inchesToCm(totalInches));
}

function formatArea(widthCm: number, lengthCm: number, units: Units): string {
  if (units === 'metric') {
    const sqMeters = (widthCm * lengthCm) / 10000;
    return `${sqMeters.toFixed(1)} m²`;
  }
  const sqFeet = (cmToInches(widthCm) * cmToInches(lengthCm)) / 144;
  return `${sqFeet.toFixed(1)} ft²`;
}

function formatDimensions(widthCm: number, lengthCm: number, units: Units): string {
  if (units === 'metric') {
    return `${(widthCm / 100).toFixed(1)}m × ${(lengthCm / 100).toFixed(1)}m`;
  }
  const w = cmToFeetAndInches(widthCm);
  const l = cmToFeetAndInches(lengthCm);
  const formatFtIn = (ft: number, inches: number) => {
    if (inches === 0) return `${ft}ft`;
    return `${ft}ft ${inches}in`;
  };
  return `${formatFtIn(w.feet, w.inches)} × ${formatFtIn(l.feet, l.inches)}`;
}

export function BedEditor({ bed, units = 'metric', onSave, onCancel }: BedEditorProps) {
  // Default values: 120cm x 240cm (metric) or 4ft x 8ft (imperial)
  const defaultWidthCm = 120;
  const defaultLengthCm = 240;

  // Convert existing bed dimensions to display units
  const getInitialMetricValue = (cmValue: number | undefined, defaultVal: number): string => {
    return (cmValue ?? defaultVal).toString();
  };

  const getInitialFeetInches = (cmValue: number | undefined, defaultVal: number): { feet: string; inches: string } => {
    const cm = cmValue ?? defaultVal;
    const { feet, inches } = cmToFeetAndInches(cm);
    return { feet: feet.toString(), inches: inches.toString() };
  };

  const [name, setName] = useState(bed?.name ?? '');

  // Metric state (cm)
  const [widthCmValue, setWidthCmValue] = useState(getInitialMetricValue(bed?.widthCm, defaultWidthCm));
  const [lengthCmValue, setLengthCmValue] = useState(getInitialMetricValue(bed?.lengthCm, defaultLengthCm));

  // Imperial state (feet + inches)
  const [widthFeet, setWidthFeet] = useState(getInitialFeetInches(bed?.widthCm, defaultWidthCm).feet);
  const [widthInches, setWidthInches] = useState(getInitialFeetInches(bed?.widthCm, defaultWidthCm).inches);
  const [lengthFeet, setLengthFeet] = useState(getInitialFeetInches(bed?.lengthCm, defaultLengthCm).feet);
  const [lengthInches, setLengthInches] = useState(getInitialFeetInches(bed?.lengthCm, defaultLengthCm).inches);

  const [sunExposure, setSunExposure] = useState<GardenBed['sunExposure']>(
    bed?.sunExposure ?? 'full'
  );
  const [notes, setNotes] = useState(bed?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!bed;

  // Reset form when bed prop changes
  useEffect(() => {
    setName(bed?.name ?? '');
    setWidthCmValue(getInitialMetricValue(bed?.widthCm, defaultWidthCm));
    setLengthCmValue(getInitialMetricValue(bed?.lengthCm, defaultLengthCm));
    const wFtIn = getInitialFeetInches(bed?.widthCm, defaultWidthCm);
    const lFtIn = getInitialFeetInches(bed?.lengthCm, defaultLengthCm);
    setWidthFeet(wFtIn.feet);
    setWidthInches(wFtIn.inches);
    setLengthFeet(lFtIn.feet);
    setLengthInches(lFtIn.inches);
    setSunExposure(bed?.sunExposure ?? 'full');
    setNotes(bed?.notes ?? '');
    setError(null);
  }, [bed]);

  // Calculate current cm values based on unit mode
  const getCurrentWidthCm = (): number => {
    if (units === 'metric') {
      return parseInt(widthCmValue, 10) || 0;
    }
    const ft = parseInt(widthFeet, 10) || 0;
    const inches = parseInt(widthInches, 10) || 0;
    return feetAndInchesToCm(ft, inches);
  };

  const getCurrentLengthCm = (): number => {
    if (units === 'metric') {
      return parseInt(lengthCmValue, 10) || 0;
    }
    const ft = parseInt(lengthFeet, 10) || 0;
    const inches = parseInt(lengthInches, 10) || 0;
    return feetAndInchesToCm(ft, inches);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!name.trim()) {
      setError('Please enter a bed name');
      return;
    }

    const widthCm = getCurrentWidthCm();
    const lengthCm = getCurrentLengthCm();

    if (widthCm <= 0) {
      setError('Width must be greater than zero');
      return;
    }

    if (lengthCm <= 0) {
      setError('Length must be greater than zero');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        widthCm,
        lengthCm,
        sunExposure,
        notes: notes.trim() || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save bed');
      setSaving(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>
          {isEditing ? 'Edit Garden Bed' : 'Add Garden Bed'}
        </h2>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="bed-name" className={styles.label}>
              Name
            </label>
            <input
              id="bed-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Main Bed 1"
              className={styles.input}
              autoFocus
            />
          </div>

          {units === 'metric' ? (
            <div className={styles.row}>
              <div className={styles.field}>
                <label htmlFor="bed-width" className={styles.label}>
                  Width (cm)
                </label>
                <input
                  id="bed-width"
                  type="number"
                  value={widthCmValue}
                  onChange={(e) => setWidthCmValue(e.target.value)}
                  min="1"
                  className={styles.input}
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="bed-length" className={styles.label}>
                  Length (cm)
                </label>
                <input
                  id="bed-length"
                  type="number"
                  value={lengthCmValue}
                  onChange={(e) => setLengthCmValue(e.target.value)}
                  min="1"
                  className={styles.input}
                />
              </div>
            </div>
          ) : (
            <div className={styles.imperialDimensions}>
              <div className={styles.field}>
                <label className={styles.label}>Width</label>
                <div className={styles.feetInchesRow}>
                  <div className={styles.feetInchesInput}>
                    <input
                      id="bed-width-ft"
                      type="number"
                      value={widthFeet}
                      onChange={(e) => setWidthFeet(e.target.value)}
                      min="0"
                      className={styles.input}
                    />
                    <span className={styles.unitLabel}>ft</span>
                  </div>
                  <div className={styles.feetInchesInput}>
                    <input
                      id="bed-width-in"
                      type="number"
                      value={widthInches}
                      onChange={(e) => setWidthInches(e.target.value)}
                      min="0"
                      max="11"
                      className={styles.input}
                    />
                    <span className={styles.unitLabel}>in</span>
                  </div>
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Length</label>
                <div className={styles.feetInchesRow}>
                  <div className={styles.feetInchesInput}>
                    <input
                      id="bed-length-ft"
                      type="number"
                      value={lengthFeet}
                      onChange={(e) => setLengthFeet(e.target.value)}
                      min="0"
                      className={styles.input}
                    />
                    <span className={styles.unitLabel}>ft</span>
                  </div>
                  <div className={styles.feetInchesInput}>
                    <input
                      id="bed-length-in"
                      type="number"
                      value={lengthInches}
                      onChange={(e) => setLengthInches(e.target.value)}
                      min="0"
                      max="11"
                      className={styles.input}
                    />
                    <span className={styles.unitLabel}>in</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className={styles.dimensionPreview}>
            {(() => {
              const widthCm = getCurrentWidthCm();
              const lengthCm = getCurrentLengthCm();
              if (widthCm <= 0 || lengthCm <= 0) return null;
              return (
                <span>
                  {formatDimensions(widthCm, lengthCm, units)} = {formatArea(widthCm, lengthCm, units)}
                </span>
              );
            })()}
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Sun Exposure</label>
            <div className={styles.sunOptions}>
              <label className={styles.sunOption}>
                <input
                  type="radio"
                  name="sunExposure"
                  value="full"
                  checked={sunExposure === 'full'}
                  onChange={() => setSunExposure('full')}
                />
                <span className={styles.sunLabel}>
                  <span className={styles.sunIcon}>☀️</span>
                  Full Sun
                </span>
              </label>
              <label className={styles.sunOption}>
                <input
                  type="radio"
                  name="sunExposure"
                  value="partial"
                  checked={sunExposure === 'partial'}
                  onChange={() => setSunExposure('partial')}
                />
                <span className={styles.sunLabel}>
                  <span className={styles.sunIcon}>⛅</span>
                  Partial
                </span>
              </label>
              <label className={styles.sunOption}>
                <input
                  type="radio"
                  name="sunExposure"
                  value="shade"
                  checked={sunExposure === 'shade'}
                  onChange={() => setSunExposure('shade')}
                />
                <span className={styles.sunLabel}>
                  <span className={styles.sunIcon}>☁️</span>
                  Shade
                </span>
              </label>
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="bed-notes" className={styles.label}>
              Notes <span className={styles.optional}>(optional)</span>
            </label>
            <textarea
              id="bed-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Near the shed, good drainage"
              className={styles.textarea}
              rows={2}
            />
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.actions}>
            <button
              type="button"
              onClick={onCancel}
              className={styles.cancelButton}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.saveButton}
              disabled={saving}
            >
              {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Bed'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
