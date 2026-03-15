/**
 * Propagation-type-aware display labels.
 * Defaults to seed terminology; overrides for corms, bulbs, tubers, etc.
 */

import type { PropagationType } from './types';

export type PropagationLabels = {
  directMethodLabel: string;
  indoorMethodLabel: string;
  indoorTaskTitle: (label: string) => string;
  indoorDescription: (quantity: string) => string;
  directTaskTitle: (label: string) => string;
  directDescription: (quantity: string) => string;
  hardenOffDescription: string;
  transplantDescription: (quantity: string) => string;
  maturityBasisLabel: string;
  directTooltip: string;
  indoorTooltip: string;
};

const SEED_LABELS: PropagationLabels = {
  directMethodLabel: 'Direct sow',
  indoorMethodLabel: 'Transplant',
  indoorTaskTitle: (label) => `Start ${label} indoors`,
  indoorDescription: (qty) => `Sow ${qty} seeds`,
  directTaskTitle: (label) => `Direct sow ${label}`,
  directDescription: (qty) => `Sow ${qty} seeds outdoors`,
  hardenOffDescription: 'Move seedlings outdoors during the day',
  transplantDescription: (qty) => `Plant out ${qty} seedlings`,
  maturityBasisLabel: 'direct sow',
  directTooltip: 'Direct sow outdoors',
  indoorTooltip: 'Start indoors, transplant later',
};

const CORM_LABELS: PropagationLabels = {
  directMethodLabel: 'Plant corms',
  indoorMethodLabel: 'Start corms indoors',
  indoorTaskTitle: (label) => `Start ${label} corms indoors`,
  indoorDescription: (qty) => `Pot up ${qty} corms`,
  directTaskTitle: (label) => `Plant ${label} corms`,
  directDescription: (qty) => `Plant ${qty} corms outdoors`,
  hardenOffDescription: 'Move potted corms outdoors during the day',
  transplantDescription: (qty) => `Plant out ${qty} corms`,
  maturityBasisLabel: 'planting',
  directTooltip: 'Plant corms outdoors',
  indoorTooltip: 'Start corms indoors, transplant later',
};

const BULB_LABELS: PropagationLabels = {
  directMethodLabel: 'Plant bulbs',
  indoorMethodLabel: 'Start bulbs indoors',
  indoorTaskTitle: (label) => `Start ${label} bulbs indoors`,
  indoorDescription: (qty) => `Pot up ${qty} bulbs`,
  directTaskTitle: (label) => `Plant ${label} bulbs`,
  directDescription: (qty) => `Plant ${qty} bulbs outdoors`,
  hardenOffDescription: 'Move potted bulbs outdoors during the day',
  transplantDescription: (qty) => `Plant out ${qty} bulbs`,
  maturityBasisLabel: 'planting',
  directTooltip: 'Plant bulbs outdoors',
  indoorTooltip: 'Start bulbs indoors, transplant later',
};

const TUBER_LABELS: PropagationLabels = {
  directMethodLabel: 'Plant tubers',
  indoorMethodLabel: 'Start tubers indoors',
  indoorTaskTitle: (label) => `Start ${label} tubers indoors`,
  indoorDescription: (qty) => `Pot up ${qty} tubers`,
  directTaskTitle: (label) => `Plant ${label} tubers`,
  directDescription: (qty) => `Plant ${qty} tubers outdoors`,
  hardenOffDescription: 'Move potted tubers outdoors during the day',
  transplantDescription: (qty) => `Plant out ${qty} tubers`,
  maturityBasisLabel: 'planting',
  directTooltip: 'Plant tubers outdoors',
  indoorTooltip: 'Start tubers indoors, transplant later',
};

const LABELS_BY_TYPE: Record<string, PropagationLabels> = {
  seed: SEED_LABELS,
  corm: CORM_LABELS,
  bulb: BULB_LABELS,
  tuber: TUBER_LABELS,
};

export function getPropagationLabels(propagationType?: PropagationType): PropagationLabels {
  return LABELS_BY_TYPE[propagationType ?? 'seed'] ?? SEED_LABELS;
}

/**
 * Get method labels array for display in cultivar cards.
 * Returns 1 or 2 labels depending on sowMethod.
 */
export function getMethodLabels(
  sowMethod: string,
  propagationType?: PropagationType
): string[] {
  const labels = getPropagationLabels(propagationType);
  if (sowMethod === 'either') return [labels.directMethodLabel, labels.indoorMethodLabel];
  if (sowMethod === 'transplant') return [labels.indoorMethodLabel];
  return [labels.directMethodLabel];
}
