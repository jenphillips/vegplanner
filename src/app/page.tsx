'use client';

import { useMemo, useState } from 'react';
import plannerData from '@/../data/vegplanner.json';
import { Timeline } from '@/components/timeline/Timeline';
import { CultivarCard } from '@/components/cultivars/CultivarCard';
import { usePlantings } from '@/hooks/usePlantings';
import type { Cultivar, FrostWindow, PlantingPlan, Climate } from '@/lib/types';
import styles from './page.module.css';

// ============================================
// Data Loading
// ============================================

type LoadedData = {
  frost: FrostWindow;
  cultivars: Cultivar[];
  plans: PlantingPlan[];
  climate: Climate;
};

const dataset = plannerData as {
  frostWindow: FrostWindow;
  cultivars: Cultivar[];
  plans: PlantingPlan[];
  climate: Climate;
};

const data: LoadedData = {
  frost: dataset.frostWindow,
  cultivars: dataset.cultivars,
  plans: dataset.plans,
  climate: dataset.climate,
};

const ready =
  !!data.frost && data.cultivars.length > 0 && data.plans.length > 0;

const daysBetweenExclusive = (startIso: string, endIso: string) => {
  const start = new Date(`${startIso}T00:00:00Z`).getTime();
  const end = new Date(`${endIso}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((end - start) / (1000 * 60 * 60 * 24) - 1));
};

// ============================================
// Main Component
// ============================================

export default function Home() {
  const [expandAll, setExpandAll] = useState(false);
  const {
    plantings,
    loading: plantingsLoading,
    addPlanting,
    updatePlanting,
    deletePlanting,
  } = usePlantings();

  // Get unique cultivars from plans
  const plannedCultivars = useMemo(() => {
    const cultivarMap = new Map(data.cultivars.map((c) => [c.id, c]));
    const uniqueIds = [...new Set(data.plans.map((p) => p.cultivarId))];
    return uniqueIds
      .map((id) => cultivarMap.get(id))
      .filter(Boolean) as Cultivar[];
  }, []);

  const handleAddPlanting = async (
    planting: Parameters<typeof addPlanting>[0]
  ) => {
    await addPlanting(planting);
  };

  const handleUpdatePlanting = async (
    id: string,
    updates: Parameters<typeof updatePlanting>[1]
  ) => {
    await updatePlanting(id, updates);
  };

  const handleDeletePlanting = async (id: string) => {
    await deletePlanting(id);
  };

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Vegplanner</p>
            <h1 className={styles.heading}>
              Plan your sow, transplant, and harvest dates
            </h1>
            <p className={styles.lede}>
              Uses your frost dates and cultivar catalog details to generate a
              simple schedule. Add succession plantings for continuous harvests.
            </p>
          </div>
        </div>

        {ready && (
          <div className={styles.infoPanel}>
            <div className={styles.infoItem}>
              <span className={styles.label}>Cultivars</span>
              <span>{data.cultivars.length} varieties</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.label}>Plantings</span>
              <span>
                {plantingsLoading ? '...' : `${plantings.length} planned`}
              </span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.label}>Frost</span>
              <span>
                Last {data.frost.lastSpringFrost} · First{' '}
                {data.frost.firstFallFrost}
              </span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.label}>Frost-free days</span>
              <span>
                {daysBetweenExclusive(
                  data.frost.lastSpringFrost,
                  data.frost.firstFallFrost
                )}{' '}
                days
              </span>
            </div>
            {data.climate?.location && (
              <div className={styles.infoItem}>
                <span className={styles.label}>Climate</span>
                <span>{data.climate.location}</span>
              </div>
            )}
          </div>
        )}

        {/* Cultivar Cards with Planting Management */}
        {ready && (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Cultivars & Plantings</h2>
                <p className={styles.sectionDesc}>
                  Click a cultivar to expand and manage succession plantings. The
                  app will automatically calculate optimal sowing dates based on
                  temperature tolerances.
                </p>
              </div>
              <button
                onClick={() => setExpandAll(!expandAll)}
                className={styles.expandButton}
              >
                {expandAll ? 'Collapse All' : 'Expand All'}
              </button>
            </div>
            <div className={styles.cultivarGrid}>
              {plannedCultivars.map((cultivar) => (
                <CultivarCard
                  key={cultivar.id}
                  cultivar={cultivar}
                  frost={data.frost}
                  climate={data.climate}
                  plantings={plantings}
                  onAddPlanting={handleAddPlanting}
                  onUpdatePlanting={handleUpdatePlanting}
                  onDeletePlanting={handleDeletePlanting}
                  forceExpanded={expandAll ? true : undefined}
                />
              ))}
            </div>
          </section>
        )}

        {/* Visual Timeline */}
        {ready && (
          <Timeline
            frost={data.frost}
            cultivars={data.cultivars}
            plans={data.plans}
            climate={data.climate}
          />
        )}
      </main>
    </div>
  );
}
