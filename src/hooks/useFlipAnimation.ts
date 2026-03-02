'use client';

import { useLayoutEffect, useRef } from 'react';

type UseFlipAnimationOptions = {
  /** Minimum Y-delta in pixels to trigger animation */
  threshold?: number;
  /** Duration of the transition in ms */
  duration?: number;
  /** CSS easing function */
  easing?: string;
  /** Whether to animate newly added items with a fade-in */
  animateEntry?: boolean;
};

const DEFAULTS = {
  threshold: 2,
  duration: 250,
  easing: 'ease',
  animateEntry: true,
};

export function useFlipAnimation(
  containerRef: React.RefObject<HTMLElement | null>,
  _keys: string[],
  options?: UseFlipAnimationOptions
): void {
  const { threshold, duration, easing, animateEntry } = {
    ...DEFAULTS,
    ...options,
  };

  const positionsRef = useRef<Map<string, DOMRect>>(new Map());
  const isFirstRenderRef = useRef(true);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Respect prefers-reduced-motion
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      recordPositions(container, positionsRef.current);
      isFirstRenderRef.current = false;
      return;
    }

    // On first render, just record positions — no animation
    if (isFirstRenderRef.current) {
      recordPositions(container, positionsRef.current);
      isFirstRenderRef.current = false;
      return;
    }

    const children = container.querySelectorAll<HTMLElement>('[data-flip-id]');
    const animations: { el: HTMLElement; invertY: number; isNew: boolean }[] =
      [];

    children.forEach((child) => {
      const id = child.dataset.flipId!;
      const lastRect = child.getBoundingClientRect();
      const firstRect = positionsRef.current.get(id);

      if (!firstRect) {
        // Newly added item
        if (animateEntry) {
          animations.push({ el: child, invertY: 0, isNew: true });
        }
        return;
      }

      const deltaY = firstRect.top - lastRect.top;
      if (Math.abs(deltaY) > threshold) {
        animations.push({ el: child, invertY: deltaY, isNew: false });
      }
    });

    if (animations.length === 0) {
      recordPositions(container, positionsRef.current);
      return;
    }

    // INVERT: Apply inverse transforms immediately (no transition)
    animations.forEach(({ el, invertY, isNew }) => {
      if (isNew) {
        el.style.opacity = '0';
        el.style.transform = 'scale(0.97)';
      } else {
        el.style.transform = `translateY(${invertY}px)`;
      }
      el.style.transition = 'none';
    });

    // Force reflow so the browser registers the starting position
    void container.offsetHeight;

    // PLAY: Apply transition and animate to final position
    animations.forEach(({ el, isNew }) => {
      if (isNew) {
        el.style.transition = `transform ${duration}ms ${easing}, opacity ${duration}ms ${easing}`;
        el.style.opacity = '1';
        el.style.transform = 'none';
      } else {
        el.style.transition = `transform ${duration}ms ${easing}`;
        el.style.transform = 'none';
      }
    });

    // Clean up inline styles after animation completes
    const timeoutId = setTimeout(() => {
      animations.forEach(({ el }) => {
        el.style.transform = '';
        el.style.transition = '';
        el.style.opacity = '';
      });
    }, duration + 50);

    // Record new positions for next render
    recordPositions(container, positionsRef.current);

    return () => clearTimeout(timeoutId);
  });
}

function recordPositions(
  container: HTMLElement,
  map: Map<string, DOMRect>
): void {
  map.clear();
  const children = container.querySelectorAll<HTMLElement>('[data-flip-id]');
  children.forEach((child) => {
    const id = child.dataset.flipId;
    if (id) {
      map.set(id, child.getBoundingClientRect());
    }
  });
}
