export type Rect = { left: number; top: number; bottom: number; width: number };
export type Viewport = { width: number; height: number };
export type Placement = { left: number; top: number | null; bottom: number | null; placement: 'above' | 'below' };

// Anchors a fixed-position popover to a trigger rect, flipping above when there
// isn't room below and clamping horizontally so it stays inside the viewport.
export function popoverPosition(
  trigger: Rect,
  viewport: Viewport,
  popoverHeight: number,
  popoverWidth: number,
  gap = 4,
): Placement {
  const margin = 8;
  const spaceBelow = viewport.height - trigger.bottom;
  const placeAbove = spaceBelow < popoverHeight && trigger.top > spaceBelow;
  const maxLeft = Math.max(margin, viewport.width - popoverWidth - margin);
  const left = Math.min(Math.max(trigger.left, margin), maxLeft);
  if (placeAbove) {
    return { left, top: null, bottom: viewport.height - trigger.top + gap, placement: 'above' };
  }
  return { left, top: trigger.bottom + gap, bottom: null, placement: 'below' };
}
