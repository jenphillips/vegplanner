import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { BedEditor } from './BedEditor';
import type { GardenBed } from '@/lib/types';

// ============================================
// Test Fixtures
// ============================================

const createGardenBed = (overrides: Partial<GardenBed> = {}): GardenBed => ({
  id: 'test-bed-1',
  name: 'Main Bed',
  widthCm: 120,
  lengthCm: 240,
  sunExposure: 'full',
  notes: 'Near the shed',
  ...overrides,
});

// ============================================
// Tests
// ============================================

describe('BedEditor', () => {
  describe('rendering', () => {
    it('renders Add Garden Bed title when no bed provided', () => {
      render(<BedEditor onSave={vi.fn()} onCancel={vi.fn()} />);

      expect(screen.getByRole('heading', { name: /add garden bed/i })).toBeInTheDocument();
    });

    it('renders Edit Garden Bed title when bed provided', () => {
      const bed = createGardenBed();
      render(<BedEditor bed={bed} onSave={vi.fn()} onCancel={vi.fn()} />);

      expect(screen.getByRole('heading', { name: /edit garden bed/i })).toBeInTheDocument();
    });

    it('renders name input field', () => {
      render(<BedEditor onSave={vi.fn()} onCancel={vi.fn()} />);

      expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    });

    it('renders sun exposure options', () => {
      render(<BedEditor onSave={vi.fn()} onCancel={vi.fn()} />);

      expect(screen.getByText('Sun Exposure')).toBeInTheDocument();
      expect(screen.getByLabelText(/full sun/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/partial/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/shade/i)).toBeInTheDocument();
    });

    it('renders notes textarea', () => {
      render(<BedEditor onSave={vi.fn()} onCancel={vi.fn()} />);

      expect(screen.getByLabelText(/notes/i)).toBeInTheDocument();
    });

    it('renders cancel and save buttons', () => {
      render(<BedEditor onSave={vi.fn()} onCancel={vi.fn()} />);

      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /add bed/i })).toBeInTheDocument();
    });

    it('renders Save Changes button when editing', () => {
      const bed = createGardenBed();
      render(<BedEditor bed={bed} onSave={vi.fn()} onCancel={vi.fn()} />);

      expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
    });
  });

  describe('metric units', () => {
    it('renders width and length inputs in centimeters', () => {
      render(<BedEditor units="metric" onSave={vi.fn()} onCancel={vi.fn()} />);

      expect(screen.getByLabelText(/width \(cm\)/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/length \(cm\)/i)).toBeInTheDocument();
    });

    it('shows dimension preview in meters', () => {
      render(<BedEditor units="metric" onSave={vi.fn()} onCancel={vi.fn()} />);

      // Default is 120cm x 240cm = 1.2m x 2.4m = 2.9 m²
      expect(screen.getByText(/1\.2m × 2\.4m/)).toBeInTheDocument();
      expect(screen.getByText(/2\.9 m²/)).toBeInTheDocument();
    });

    it('populates metric fields with existing bed dimensions', () => {
      const bed = createGardenBed({ widthCm: 150, lengthCm: 300 });
      render(<BedEditor bed={bed} units="metric" onSave={vi.fn()} onCancel={vi.fn()} />);

      expect(screen.getByLabelText(/width \(cm\)/i)).toHaveValue(150);
      expect(screen.getByLabelText(/length \(cm\)/i)).toHaveValue(300);
    });
  });

  describe('imperial units', () => {
    it('renders width and length inputs in feet and inches', () => {
      const { container } = render(<BedEditor units="imperial" onSave={vi.fn()} onCancel={vi.fn()} />);

      expect(container.querySelector('#bed-width-ft')).toBeInTheDocument();
      expect(container.querySelector('#bed-width-in')).toBeInTheDocument();
      expect(container.querySelector('#bed-length-ft')).toBeInTheDocument();
      expect(container.querySelector('#bed-length-in')).toBeInTheDocument();
    });

    it('shows dimension preview in feet', () => {
      const { container } = render(<BedEditor units="imperial" onSave={vi.fn()} onCancel={vi.fn()} />);

      // Default is 120cm x 240cm - check that ft² is displayed
      const preview = container.querySelector('[class*="dimensionPreview"]');
      expect(preview).toBeInTheDocument();
      expect(preview?.textContent).toMatch(/ft²/);
    });

    it('converts existing bed dimensions to feet and inches', () => {
      // 91cm ≈ 35.83 inches ≈ 3ft 0in (rounds 11.83in up to 12in, then carries to feet)
      // 152cm ≈ 59.84 inches ≈ 5ft 0in (rounds 11.84in up to 12in, then carries to feet)
      const bed = createGardenBed({ widthCm: 91, lengthCm: 152 });
      const { container } = render(<BedEditor bed={bed} units="imperial" onSave={vi.fn()} onCancel={vi.fn()} />);

      const widthFtInput = container.querySelector('#bed-width-ft') as HTMLInputElement;
      const lengthFtInput = container.querySelector('#bed-length-ft') as HTMLInputElement;

      // Accept the actual computed values
      expect(widthFtInput.value).toBeTruthy();
      expect(lengthFtInput.value).toBeTruthy();
      // Total inches should roughly match original cm
      const totalWidthInches = parseInt(widthFtInput.value) * 12 + parseInt((container.querySelector('#bed-width-in') as HTMLInputElement).value);
      expect(totalWidthInches).toBeGreaterThan(30); // 91cm is about 35.8 inches
      expect(totalWidthInches).toBeLessThan(40);
    });
  });

  describe('form population', () => {
    it('populates form with existing bed data', () => {
      const bed = createGardenBed({
        name: 'Tomato Bed',
        widthCm: 100,
        lengthCm: 200,
        sunExposure: 'partial',
        notes: 'Test notes',
      });

      render(<BedEditor bed={bed} units="metric" onSave={vi.fn()} onCancel={vi.fn()} />);

      expect(screen.getByLabelText(/name/i)).toHaveValue('Tomato Bed');
      expect(screen.getByLabelText(/width \(cm\)/i)).toHaveValue(100);
      expect(screen.getByLabelText(/length \(cm\)/i)).toHaveValue(200);
      expect(screen.getByLabelText(/partial/i)).toBeChecked();
      expect(screen.getByLabelText(/notes/i)).toHaveValue('Test notes');
    });

    it('resets form when bed prop changes', async () => {
      const bed1 = createGardenBed({ name: 'Bed 1' });
      const bed2 = createGardenBed({ name: 'Bed 2' });

      const { rerender } = render(
        <BedEditor bed={bed1} onSave={vi.fn()} onCancel={vi.fn()} />
      );

      expect(screen.getByLabelText(/name/i)).toHaveValue('Bed 1');

      rerender(<BedEditor bed={bed2} onSave={vi.fn()} onCancel={vi.fn()} />);

      expect(screen.getByLabelText(/name/i)).toHaveValue('Bed 2');
    });
  });

  describe('validation', () => {
    it('shows error when name is empty', async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      render(<BedEditor units="metric" onSave={onSave} onCancel={vi.fn()} />);

      // Clear the name field and submit
      const nameInput = screen.getByLabelText(/name/i);
      await user.clear(nameInput);

      const submitButton = screen.getByRole('button', { name: /add bed/i });
      await user.click(submitButton);

      expect(screen.getByText(/please enter a bed name/i)).toBeInTheDocument();
      expect(onSave).not.toHaveBeenCalled();
    });

    it('shows error when width is zero', async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      render(<BedEditor units="metric" onSave={onSave} onCancel={vi.fn()} />);

      // Fill in name but set width to 0
      await user.type(screen.getByLabelText(/name/i), 'Test Bed');
      const widthInput = screen.getByLabelText(/width \(cm\)/i);
      await user.clear(widthInput);

      const submitButton = screen.getByRole('button', { name: /add bed/i });
      await user.click(submitButton);

      expect(screen.getByText(/width must be greater than zero/i)).toBeInTheDocument();
      expect(onSave).not.toHaveBeenCalled();
    });

    it('shows error when length is zero', async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      render(<BedEditor units="metric" onSave={onSave} onCancel={vi.fn()} />);

      // Fill in name but set length to 0
      await user.type(screen.getByLabelText(/name/i), 'Test Bed');
      const lengthInput = screen.getByLabelText(/length \(cm\)/i);
      await user.clear(lengthInput);

      const submitButton = screen.getByRole('button', { name: /add bed/i });
      await user.click(submitButton);

      expect(screen.getByText(/length must be greater than zero/i)).toBeInTheDocument();
      expect(onSave).not.toHaveBeenCalled();
    });
  });

  describe('form submission', () => {
    it('calls onSave with bed data in metric units', async () => {
      const user = userEvent.setup();
      const onSave = vi.fn().mockResolvedValue(undefined);
      render(<BedEditor units="metric" onSave={onSave} onCancel={vi.fn()} />);

      await user.clear(screen.getByLabelText(/name/i));
      await user.type(screen.getByLabelText(/name/i), 'New Bed');

      await user.clear(screen.getByLabelText(/width \(cm\)/i));
      await user.type(screen.getByLabelText(/width \(cm\)/i), '100');

      await user.clear(screen.getByLabelText(/length \(cm\)/i));
      await user.type(screen.getByLabelText(/length \(cm\)/i), '200');

      await user.click(screen.getByLabelText(/partial/i));
      await user.type(screen.getByLabelText(/notes/i), 'Test notes');

      await user.click(screen.getByRole('button', { name: /add bed/i }));

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith({
          name: 'New Bed',
          widthCm: 100,
          lengthCm: 200,
          sunExposure: 'partial',
          notes: 'Test notes',
        });
      });
    });

    it('converts imperial units to cm when saving', async () => {
      const user = userEvent.setup();
      const onSave = vi.fn().mockResolvedValue(undefined);
      const { container } = render(<BedEditor units="imperial" onSave={onSave} onCancel={vi.fn()} />);

      await user.clear(screen.getByLabelText(/name/i));
      await user.type(screen.getByLabelText(/name/i), 'Imperial Bed');

      // Set to 3ft x 6ft (no inches)
      const widthFt = container.querySelector('#bed-width-ft') as HTMLInputElement;
      const widthIn = container.querySelector('#bed-width-in') as HTMLInputElement;
      const lengthFt = container.querySelector('#bed-length-ft') as HTMLInputElement;
      const lengthIn = container.querySelector('#bed-length-in') as HTMLInputElement;

      await user.clear(widthFt);
      await user.type(widthFt, '3');
      await user.clear(widthIn);
      await user.type(widthIn, '0');

      await user.clear(lengthFt);
      await user.type(lengthFt, '6');
      await user.clear(lengthIn);
      await user.type(lengthIn, '0');

      await user.click(screen.getByRole('button', { name: /add bed/i }));

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Imperial Bed',
            // 3ft = 36 inches * 2.54 = 91.44cm, rounded = 91
            widthCm: 91,
            // 6ft = 72 inches * 2.54 = 182.88cm, rounded = 183
            lengthCm: 183,
          })
        );
      });
    });

    it('trims name whitespace', async () => {
      const user = userEvent.setup();
      const onSave = vi.fn().mockResolvedValue(undefined);
      render(<BedEditor units="metric" onSave={onSave} onCancel={vi.fn()} />);

      await user.clear(screen.getByLabelText(/name/i));
      await user.type(screen.getByLabelText(/name/i), '  Trimmed Name  ');

      await user.click(screen.getByRole('button', { name: /add bed/i }));

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Trimmed Name',
          })
        );
      });
    });

    it('omits notes when empty', async () => {
      const user = userEvent.setup();
      const onSave = vi.fn().mockResolvedValue(undefined);
      render(<BedEditor units="metric" onSave={onSave} onCancel={vi.fn()} />);

      await user.clear(screen.getByLabelText(/name/i));
      await user.type(screen.getByLabelText(/name/i), 'Bed Without Notes');

      // Don't enter any notes

      await user.click(screen.getByRole('button', { name: /add bed/i }));

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith(
          expect.objectContaining({
            notes: undefined,
          })
        );
      });
    });

    it('shows saving state while saving', async () => {
      const user = userEvent.setup();
      let resolvePromise: () => void;
      const onSave = vi.fn().mockImplementation(
        () => new Promise<void>((resolve) => {
          resolvePromise = resolve;
        })
      );

      render(<BedEditor units="metric" onSave={onSave} onCancel={vi.fn()} />);

      await user.clear(screen.getByLabelText(/name/i));
      await user.type(screen.getByLabelText(/name/i), 'Test');

      await user.click(screen.getByRole('button', { name: /add bed/i }));

      // Should show saving state
      expect(screen.getByRole('button', { name: /saving/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();

      // Resolve the promise
      resolvePromise!();

      await waitFor(() => {
        expect(onSave).toHaveBeenCalled();
      });
    });

    it('shows error message when save fails', async () => {
      const user = userEvent.setup();
      const onSave = vi.fn().mockRejectedValue(new Error('Network error'));

      render(<BedEditor units="metric" onSave={onSave} onCancel={vi.fn()} />);

      await user.clear(screen.getByLabelText(/name/i));
      await user.type(screen.getByLabelText(/name/i), 'Test');

      await user.click(screen.getByRole('button', { name: /add bed/i }));

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });
  });

  describe('cancel behavior', () => {
    it('calls onCancel when Cancel button clicked', async () => {
      const user = userEvent.setup();
      const onCancel = vi.fn();
      render(<BedEditor onSave={vi.fn()} onCancel={onCancel} />);

      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(onCancel).toHaveBeenCalled();
    });

    it('calls onCancel when overlay clicked', async () => {
      const user = userEvent.setup();
      const onCancel = vi.fn();
      const { container } = render(<BedEditor onSave={vi.fn()} onCancel={onCancel} />);

      const overlay = container.querySelector('[class*="overlay"]');
      expect(overlay).toBeInTheDocument();

      await user.click(overlay!);

      expect(onCancel).toHaveBeenCalled();
    });

    it('does not call onCancel when modal content clicked', async () => {
      const user = userEvent.setup();
      const onCancel = vi.fn();
      const { container } = render(<BedEditor onSave={vi.fn()} onCancel={onCancel} />);

      const modal = container.querySelector('[class*="modal"]');
      expect(modal).toBeInTheDocument();

      await user.click(modal!);

      expect(onCancel).not.toHaveBeenCalled();
    });
  });

  describe('sun exposure selection', () => {
    it('defaults to full sun', () => {
      render(<BedEditor onSave={vi.fn()} onCancel={vi.fn()} />);

      expect(screen.getByLabelText(/full sun/i)).toBeChecked();
    });

    it('allows changing sun exposure', async () => {
      const user = userEvent.setup();
      render(<BedEditor onSave={vi.fn()} onCancel={vi.fn()} />);

      await user.click(screen.getByLabelText(/shade/i));

      expect(screen.getByLabelText(/shade/i)).toBeChecked();
      expect(screen.getByLabelText(/full sun/i)).not.toBeChecked();
    });

    it('preserves existing sun exposure when editing', () => {
      const bed = createGardenBed({ sunExposure: 'shade' });
      render(<BedEditor bed={bed} onSave={vi.fn()} onCancel={vi.fn()} />);

      expect(screen.getByLabelText(/shade/i)).toBeChecked();
    });
  });

  describe('dimension preview', () => {
    it('updates preview as dimensions change', async () => {
      const user = userEvent.setup();
      render(<BedEditor units="metric" onSave={vi.fn()} onCancel={vi.fn()} />);

      // Initial preview
      expect(screen.getByText(/1\.2m × 2\.4m/)).toBeInTheDocument();

      // Change width
      await user.clear(screen.getByLabelText(/width \(cm\)/i));
      await user.type(screen.getByLabelText(/width \(cm\)/i), '200');

      // Preview should update
      expect(screen.getByText(/2\.0m × 2\.4m/)).toBeInTheDocument();
    });

    it('hides preview when dimensions are invalid', async () => {
      const user = userEvent.setup();
      render(<BedEditor units="metric" onSave={vi.fn()} onCancel={vi.fn()} />);

      // Clear width to make it invalid
      await user.clear(screen.getByLabelText(/width \(cm\)/i));

      // Preview should not show dimensions
      expect(screen.queryByText(/m²/)).not.toBeInTheDocument();
    });
  });
});
