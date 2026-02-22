'use client';

import { useMemo, useState } from 'react';
import climateData from '@/../data/climate.json';
import libraryData from '@/../data/cultivar-library.json';
import baselineData from '@/../data/baseline-cultivars.json';
import { BaselineTimeline } from '@/components/timeline/BaselineTimeline';
import { CultivarCard } from '@/components/cultivars/CultivarCard';
import { TabNav, type Tab } from '@/components/tabs/TabNav';
import { ScheduleView } from '@/components/schedule/ScheduleView';
import { CalendarView } from '@/components/calendar/CalendarView';
import { GardenView } from '@/components/garden/GardenView';
import { LibraryView } from '@/components/library/LibraryView';
import { usePlantings } from '@/hooks/usePlantings';
import { usePlans } from '@/hooks/usePlans';
import { useTasks } from '@/hooks/useTasks';
import type { Cultivar, FrostWindow, Climate } from '@/lib/types';
import styles from './page.module.css';

// ============================================
// Data Loading
// ============================================

type LoadedData = {
  frost: FrostWindow;
  cultivars: Cultivar[];
  climate: Climate;
};

const climate = climateData as { frostWindow: FrostWindow; climate: Climate };
const libraryCultivars = (libraryData as { cultivars: Cultivar[] }).cultivars;
const baselineCultivars = (baselineData as { cultivars: Cultivar[] }).cultivars;

const data: LoadedData = {
  frost: climate.frostWindow,
  cultivars: [...libraryCultivars, ...baselineCultivars],
  climate: climate.climate,
};

const daysBetweenExclusive = (startIso: string, endIso: string) => {
  const start = new Date(`${startIso}T00:00:00Z`).getTime();
  const end = new Date(`${endIso}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((end - start) / (1000 * 60 * 60 * 24) - 1));
};

// ============================================
// Main Component
// ============================================

export default function Home() {
  const [expandAll, setExpandAll] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('vegetables');
  const {
    plantings,
    loading: plantingsLoading,
    updatePlanting,
    deletePlanting,
    deleteAllForCultivar,
    updateAndRenumber,
    addAndRenumber,
    addMultipleAndRenumber,
  } = usePlantings();

  const {
    plans,
    loading: plansLoading,
    addPlan,
    removePlan,
  } = usePlans();

  const {
    tasksByWeek,
    loading: tasksLoading,
    toggleTaskComplete,
  } = useTasks(plantings, data.cultivars);

  // Check if app is ready (has static data and plans have loaded)
  const ready = !!data.frost && data.cultivars.length > 0 && !plansLoading;

  // Get unique cultivars from plans, sorted alphabetically by crop then variety
  const plannedCultivars = useMemo(() => {
    const cultivarMap = new Map(data.cultivars.map((c) => [c.id, c]));
    const uniqueIds = [...new Set(plans.map((p) => p.cultivarId))];
    return (uniqueIds
      .map((id) => cultivarMap.get(id))
      .filter(Boolean) as Cultivar[])
      .sort((a, b) => {
        const cropCompare = a.crop.localeCompare(b.crop);
        if (cropCompare !== 0) return cropCompare;
        return a.variety.localeCompare(b.variety);
      });
  }, [plans]);

  // Filter cultivars by plant type
  const vegetableCultivars = useMemo(() => {
    return plannedCultivars.filter((c) => c.plantType === 'vegetable');
  }, [plannedCultivars]);

  const herbCultivars = useMemo(() => {
    return plannedCultivars.filter((c) => c.plantType === 'herb');
  }, [plannedCultivars]);

  const flowerCultivars = useMemo(() => {
    return plannedCultivars.filter((c) => c.plantType === 'flower');
  }, [plannedCultivars]);

  const handleAddPlanting = async (
    planting: Parameters<typeof addAndRenumber>[0]
  ) => {
    const cultivar = data.cultivars.find((c) => c.id === planting.cultivarId);
    if (cultivar) {
      await addAndRenumber(planting, cultivar.crop, cultivar.variety);
    }
  };

  const handleAddMultiplePlantings = async (
    plantings: Parameters<typeof addMultipleAndRenumber>[0]
  ) => {
    if (plantings.length === 0) return;
    const cultivar = data.cultivars.find((c) => c.id === plantings[0].cultivarId);
    if (cultivar) {
      await addMultipleAndRenumber(plantings, cultivar.crop, cultivar.variety);
    }
  };

  const handleUpdatePlanting = async (
    id: string,
    updates: Parameters<typeof updatePlanting>[1]
  ) => {
    // Renumber plantings if sow date changed (to keep succession numbers chronological)
    if ('sowDate' in updates || 'sowDateOverride' in updates) {
      const planting = plantings.find((p) => p.id === id);
      if (planting) {
        const cultivar = data.cultivars.find((c) => c.id === planting.cultivarId);
        if (cultivar) {
          await updateAndRenumber(id, updates, cultivar.crop, cultivar.id, cultivar.variety);
          return;
        }
      }
    }
    await updatePlanting(id, updates);
  };

  const handleDeletePlanting = async (id: string) => {
    await deletePlanting(id);
  };

  const handleRemoveFromPlan = async (cultivarId: string) => {
    // Delete all plantings for this cultivar first, then remove the plan
    await deleteAllForCultivar(cultivarId);
    await removePlan(cultivarId);
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

        {/* Tab Navigation */}
        {ready && (
          <div className={styles.tabNavContainer}>
            <TabNav activeTab={activeTab} onTabChange={setActiveTab} />
          </div>
        )}

        {/* Vegetables Tab: Vegetable Cultivar Cards with Planting Management */}
        {ready && activeTab === 'vegetables' && (
          <>
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>Vegetable Cultivars & Plantings</h2>
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
                {vegetableCultivars.map((cultivar) => (
                  <CultivarCard
                    key={cultivar.id}
                    cultivar={cultivar}
                    frost={data.frost}
                    climate={data.climate}
                    plantings={plantings}
                    onAddPlanting={handleAddPlanting}
                    onAddMultiplePlantings={handleAddMultiplePlantings}
                    onUpdatePlanting={handleUpdatePlanting}
                    onDeletePlanting={handleDeletePlanting}
                    forceExpanded={expandAll}
                  />
                ))}
              </div>
            </section>

            {/* Seasonal Planting Reference (Baseline Vegetables) */}
            <BaselineTimeline frost={data.frost} climate={data.climate} />
          </>
        )}

        {/* Herbs Tab: Herb Cultivar Cards with Planting Management */}
        {ready && activeTab === 'herbs' && (
          <>
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>Herb Cultivars & Plantings</h2>
                  <p className={styles.sectionDesc}>
                    Click a cultivar to expand and manage succession plantings for
                    fresh herbs throughout the season.
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
                {herbCultivars.map((cultivar) => (
                  <CultivarCard
                    key={cultivar.id}
                    cultivar={cultivar}
                    frost={data.frost}
                    climate={data.climate}
                    plantings={plantings}
                    onAddPlanting={handleAddPlanting}
                    onAddMultiplePlantings={handleAddMultiplePlantings}
                    onUpdatePlanting={handleUpdatePlanting}
                    onDeletePlanting={handleDeletePlanting}
                    forceExpanded={expandAll}
                  />
                ))}
              </div>
            </section>
          </>
        )}

        {/* Flowers Tab: Flower Cultivar Cards with Planting Management */}
        {ready && activeTab === 'flowers' && (
          <>
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>Flower Cultivars & Plantings</h2>
                  <p className={styles.sectionDesc}>
                    Click a cultivar to expand and manage succession plantings for
                    continuous blooms throughout the season.
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
                {flowerCultivars.map((cultivar) => (
                  <CultivarCard
                    key={cultivar.id}
                    cultivar={cultivar}
                    frost={data.frost}
                    climate={data.climate}
                    plantings={plantings}
                    onAddPlanting={handleAddPlanting}
                    onAddMultiplePlantings={handleAddMultiplePlantings}
                    onUpdatePlanting={handleUpdatePlanting}
                    onDeletePlanting={handleDeletePlanting}
                    forceExpanded={expandAll}
                  />
                ))}
              </div>
            </section>
          </>
        )}

        {/* Calendar Tab: Chronological View */}
        {ready && activeTab === 'calendar' && (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Calendar View</h2>
                <p className={styles.sectionDesc}>
                  All plantings ordered chronologically by sow date. Drag to
                  reschedule individual plantings.
                </p>
              </div>
            </div>
            <CalendarView
              plantings={plantings}
              cultivars={data.cultivars}
              frost={data.frost}
              climate={data.climate}
              onUpdatePlanting={handleUpdatePlanting}
              onDeletePlanting={handleDeletePlanting}
              loading={plantingsLoading}
            />
          </section>
        )}

        {/* Tasks Tab: Schedule View */}
        {ready && activeTab === 'tasks' && (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Tasks & Schedule</h2>
                <p className={styles.sectionDesc}>
                  All tasks derived from your plantings, grouped by week.
                  Check off tasks as you complete them.
                </p>
              </div>
            </div>
            <ScheduleView
              tasksByWeek={tasksByWeek}
              cultivars={data.cultivars}
              onToggleComplete={toggleTaskComplete}
              loading={tasksLoading}
            />
          </section>
        )}

        {/* Garden Tab: Bed Layout */}
        {ready && activeTab === 'garden' && (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Garden Layout</h2>
                <p className={styles.sectionDesc}>
                  Visualize your garden beds and see which plantings are in the
                  ground at any point in the season.
                </p>
              </div>
            </div>
            <GardenView
              plantings={plantings}
              cultivars={data.cultivars}
              frost={data.frost}
              climate={data.climate}
              loading={plantingsLoading}
              onUpdatePlanting={handleUpdatePlanting}
            />
          </section>
        )}

        {/* Library Tab: Cultivar Library with Add/Remove from Plan */}
        {ready && activeTab === 'library' && (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Cultivar Library</h2>
                <p className={styles.sectionDesc}>
                  Browse all cultivars in your library. Add varieties to this
                  year&apos;s plan or remove ones you won&apos;t be growing.
                </p>
              </div>
            </div>
            <LibraryView
              cultivars={libraryCultivars}
              baselines={baselineCultivars}
              plans={plans}
              loading={plansLoading}
              onAddToPlan={addPlan}
              onRemoveFromPlan={handleRemoveFromPlan}
            />
          </section>
        )}

      </main>
    </div>
  );
}
