import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { LatLng, SurveyConfig, SurveyResult, SurveyPattern, AltitudeReference, GroundPattern, CorridorMode } from '../components/survey/survey-types';
import { DEFAULT_SURVEY_CONFIG } from '../components/survey/survey-types';
import type { CameraPreset } from '../components/survey/survey-types';
// Importing the generators barrel triggers self-registration of every
// built-in generator against the registry. Survey-store then dispatches
// via `getSurveyGenerator(id)` instead of a hardcoded switch.
import '../components/survey/generators';
import { getSurveyGenerator, patternToGeneratorId } from '../components/survey/generator-registry';
import { surveyToMissionItems } from '../components/survey/mission-builder';
import { calculateAltitudeForGSD } from '../components/survey/survey-stats';
import { simplifyPolygon } from '../components/survey/geo-math';
import { runWithActivity } from './activity-store';
import { parseGisArea } from '../../shared/gis-area-import';
import { computeSurveyGroupSignature } from '../components/survey/survey-group-signature';
import { useSettingsStore } from './settings-store';
import { useMissionStore } from './mission-store';
import { MAV_CMD } from '../../shared/mission-types';
import { isSurveyGroup, createSurveyGroup, GROUP_COLOR_PALETTE, type SurveyGroup } from '../../shared/mission-group-types';

type DrawMode = 'none' | 'polygon';

// A recompute is "heavy" (worth a progress indicator + a yielded frame so it
// paints) when the polygon is dense or the last result was large. Cheap edits
// recompute inline so there's no spinner flash.
function recomputeIsHeavy(polygon: LatLng[] | null, result: SurveyResult | null): boolean {
  return (polygon?.length ?? 0) > 500 || (result?.waypoints?.length ?? 0) > 2000;
}

// Debounce so dragging a slider regenerates once when you stop, not on every
// pixel - the "recompute on release" behavior without per-slider handlers.
let recomputeTimer: ReturnType<typeof setTimeout> | null = null;
const RECOMPUTE_DEBOUNCE_MS = 350;

interface SurveyStore {
  // Drawing state
  drawMode: DrawMode;
  drawingVertices: LatLng[];

  // Survey state
  polygon: LatLng[] | null;
  config: Omit<SurveyConfig, 'polygon'>;
  result: SurveyResult | null;
  showFootprints: boolean;
  isActive: boolean;

  /**
   * When non-null, the survey panel is editing a previously-inserted
   * SurveyGroup. Vertex / config edits no longer just update the draft —
   * they also mutate the SurveyGroup's polygon + config and regenerate
   * its WPs in place, so the mission stays in sync with what the user is
   * seeing on the map.
   *
   * Set automatically after a successful Insert, and when the user picks
   * an existing SurveyGroup via the "Edit" affordance on the table.
   * Cleared by clearSurvey() and when the panel exits.
   */
  editingGroupId: string | null;

  // Drawing actions
  startDrawing: () => void;
  addVertex: (lat: number, lng: number) => void;
  completePolygon: () => void;
  cancelDrawing: () => void;

  /**
   * Link the survey panel to a previously-committed SurveyGroup so further
   * edits write through to it.
   */
  setEditingGroupId: (id: string | null) => void;
  /**
   * Load an existing SurveyGroup back into the survey draft for editing.
   * Sets polygon/config/result from the group, marks the panel active, and
   * sets editingGroupId so future edits mutate the group in place.
   */
  loadFromGroup: (group: {
    id: string;
    polygon: Array<{ lat: number; lng: number }>;
    config: Record<string, unknown>;
  }) => void;

  // Config actions
  setPattern: (pattern: SurveyPattern) => void;
  setAltitude: (altitude: number) => void;
  setSpeed: (speed: number) => void;
  setFrontOverlap: (overlap: number) => void;
  setSideOverlap: (overlap: number) => void;
  setCamera: (camera: CameraPreset) => void;
  setGridAngle: (angle: number) => void;
  setOvershoot: (overshoot: number) => void;
  setAltitudeReference: (ref: AltitudeReference) => void;
  setShowFootprints: (show: boolean) => void;
  setGroundPattern: (pattern: GroundPattern) => void;
  setSpiralDirection: (direction: 'inward' | 'outward') => void;
  setPerimeterPasses: (passes: number) => void;
  setPlanBy: (mode: 'altitude' | 'gsd') => void;
  /** Set a target GSD (cm/px); back-solves altitude from the current camera. */
  setGsd: (gsd: number) => void;
  setEnduranceMinutes: (minutes: number) => void;
  /** Crosshatch second-pass altitude offset, % of relative altitude. */
  setCrossGridAltitudeOffset: (percent: number) => void;
  // Corridor pattern tuning
  setCorridorWidth: (meters: number) => void;
  setCorridorStrips: (count: number) => void;
  setCorridorMode: (mode: CorridorMode) => void;
  setCorridorSideOffset: (meters: number) => void;
  setMaxTurnAngle: (degrees: number) => void;
  setFlipLegs: (flip: boolean) => void;
  setInvertPath: (invert: boolean) => void;

  // Polygon editing
  updateVertex: (index: number, lat: number, lng: number) => void;
  removeVertex: (index: number) => void;

  /**
   * Explicit polygon-edit mode. While active, vertex edits mutate only the
   * polygon (cheap) and mark the waypoints stale (`pendingRecompute`) instead of
   * regenerating on every drag - essential for large imported boundaries. Done
   * (commit=true) regenerates once; Cancel (commit=false) reverts to the
   * snapshot taken on enter.
   */
  polygonEditMode: boolean;
  pendingRecompute: boolean;
  /** Polygon snapshot captured on enterPolygonEdit, used to revert on Cancel. */
  editSnapshot: LatLng[] | null;
  enterPolygonEdit: () => void;
  exitPolygonEdit: (commit: boolean) => void;

  /**
   * Regenerate the preview/mission. `immediate` runs now (used by discrete
   * actions and Done); otherwise it debounces so a dragged slider regenerates
   * once on release. Heavy recomputes show a progress indicator.
   */
  requestRecompute: (opts?: { immediate?: boolean }) => void;

  // Survey actions
  /**
   * Regenerate the preview from the current polygon/config. When editing a
   * committed group it also syncs the regenerated WPs back into the mission,
   * UNLESS `sync: false` — used when merely opening a group for edit, so that
   * just entering edit mode doesn't overwrite committed altitudes (e.g. terrain
   * auto-adjust) before the user has changed anything.
   */
  generateSurvey: (opts?: { sync?: boolean }) => void;
  /**
   * Import a survey boundary from a GIS file (KML/KMZ/GeoJSON) via the main
   * process, load the first area's outer ring into the draft, and generate.
   * Returns a small result so the UI can report success/empty/error.
   */
  importArea: () => Promise<{ ok: boolean; areaCount: number; error?: string }>;
  clearSurvey: () => void;
  activateSurvey: () => void;
  deactivateSurvey: () => void;

  // Preset application — overlays a preset's config slice + (optional) camera
  // onto the current config in a single store update. Only the fields the
  // preset specifies are overwritten; gridAngle and polygon are preserved.
  applyPresetConfig: (
    partial: Partial<Omit<SurveyConfig, 'polygon' | 'gridAngle'>>,
    camera?: CameraPreset,
  ) => void;
}

function runGenerator(config: SurveyConfig): SurveyResult | null {
  if (config.polygon.length < 3) return null;

  const id = patternToGeneratorId(config.pattern);
  const reg = getSurveyGenerator(id) ?? getSurveyGenerator('builtin.grid');
  if (!reg) return null;
  const result = reg.generate(config);
  // Built-in generators are synchronous. PR 4 generalizes survey-store to
  // handle async generators (Promise<SurveyResult>) once survey groups
  // become first-class and remote generators like TOPAS land.
  if (result instanceof Promise) {
    // Defensive: a generator unexpectedly returned a Promise here. PR 3
    // sticks to sync; ignore for now and let PR 4 thread async cleanly.
    return null;
  }
  return result;
}

// Module-level flag — true after the initial hydration from settings, used to
// suppress the persistence subscriber during the very first applyPresetConfig
// call (otherwise we'd save the hydrated config back to itself before any
// user change, which is harmless but noisy).
let isHydratingFromSettings = false;

export const useSurveyStore = create<SurveyStore>()(subscribeWithSelector((set, get) => ({
  drawMode: 'none',
  drawingVertices: [],
  polygon: null,
  config: { ...DEFAULT_SURVEY_CONFIG },
  result: null,
  showFootprints: false,
  isActive: false,
  editingGroupId: null,
  polygonEditMode: false,
  pendingRecompute: false,
  editSnapshot: null,

  startDrawing: () => {
    set({ drawMode: 'polygon', drawingVertices: [], polygon: null, result: null });
  },

  addVertex: (lat, lng) => {
    set((s) => ({ drawingVertices: [...s.drawingVertices, { lat, lng }] }));
  },

  completePolygon: () => {
    const { drawingVertices, config } = get();
    if (drawingVertices.length < 3) return;

    const polygon = [...drawingVertices];
    const fullConfig: SurveyConfig = { ...config, polygon };
    const result = runGenerator(fullConfig);

    set({ drawMode: 'none', drawingVertices: [], polygon, result });
  },

  cancelDrawing: () => {
    set({ drawMode: 'none', drawingVertices: [] });
  },

  setPattern: (pattern) => {
    set({ config: { ...get().config, pattern } });
    get().requestRecompute({ immediate: true });
  },

  setAltitude: (altitude) => {
    set({ config: { ...get().config, altitude } });
    get().requestRecompute();
  },

  setSpeed: (speed) => {
    set({ config: { ...get().config, speed } });
    get().requestRecompute();
  },

  setFrontOverlap: (frontOverlap) => {
    set({ config: { ...get().config, frontOverlap } });
    get().requestRecompute();
  },

  setSideOverlap: (sideOverlap) => {
    set({ config: { ...get().config, sideOverlap } });
    get().requestRecompute();
  },

  setCamera: (camera) => {
    set({ config: { ...get().config, camera } });
    get().requestRecompute({ immediate: true });
  },

  setGridAngle: (gridAngle) => {
    set({ config: { ...get().config, gridAngle } });
    get().requestRecompute();
  },

  setOvershoot: (overshoot) => {
    set({ config: { ...get().config, overshoot } });
    get().requestRecompute();
  },

  setAltitudeReference: (altitudeReference) => {
    set({ config: { ...get().config, altitudeReference } });
  },

  setShowFootprints: (showFootprints) => {
    set({ showFootprints });
  },

  setGroundPattern: (groundPattern) => {
    set({ config: { ...get().config, groundPattern } });
    // No regeneration needed — the waypoint geometry is identical between
    // boustrophedon and reverse-alternating. Only mission-builder reads this
    // when materializing the mission (to insert DO_SET_REVERSE between lines).
  },

  setSpiralDirection: (spiralDirection) => {
    set({ config: { ...get().config, spiralDirection } });
    get().requestRecompute({ immediate: true });
  },

  setPerimeterPasses: (perimeterPasses) => {
    // Clamp at the same range the generator enforces so the slider/UI can't
    // push past what's geometrically sensible.
    const clamped = Math.max(1, Math.min(5, Math.round(perimeterPasses)));
    set({ config: { ...get().config, perimeterPasses: clamped } });
    get().requestRecompute();
  },

  setPlanBy: (planBy) => {
    set({ config: { ...get().config, planBy } });
  },

  setGsd: (gsd) => {
    const { config } = get();
    const { camera } = config;
    const altitude = calculateAltitudeForGSD(
      camera.sensorWidth,
      camera.focalLength,
      camera.imageWidth,
      gsd,
    );
    // Clamp to the same range as the altitude slider so a wild GSD can't drive
    // the aircraft past sane limits.
    const clamped = Math.max(10, Math.min(500, Math.round(altitude)));
    set({ config: { ...config, altitude: clamped } });
    get().requestRecompute();
  },

  setEnduranceMinutes: (enduranceMinutes) => {
    set({ config: { ...get().config, enduranceMinutes: Math.max(1, Math.round(enduranceMinutes)) } });
  },

  setCrossGridAltitudeOffset: (percent) => {
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    set({ config: { ...get().config, crossGridAltitudeOffset: clamped } });
    get().requestRecompute();
  },

  setCorridorWidth: (meters) => {
    const clamped = Math.max(1, Math.min(2000, Math.round(meters)));
    set({ config: { ...get().config, corridorWidth: clamped } });
    get().requestRecompute();
  },

  setCorridorStrips: (count) => {
    // 0 = auto (derive from width / line spacing). Cap so a typo can't spawn
    // tens of thousands of waypoints.
    const clamped = Math.max(0, Math.min(40, Math.round(count)));
    set({ config: { ...get().config, corridorStrips: clamped } });
    get().requestRecompute();
  },

  setCorridorMode: (corridorMode) => {
    set({ config: { ...get().config, corridorMode } });
    get().requestRecompute({ immediate: true });
  },

  setCorridorSideOffset: (meters) => {
    set({ config: { ...get().config, corridorSideOffset: Math.round(meters) } });
    get().requestRecompute();
  },

  setMaxTurnAngle: (degrees) => {
    const clamped = Math.max(1, Math.min(90, Math.round(degrees)));
    set({ config: { ...get().config, maxTurnAngle: clamped } });
    get().requestRecompute();
  },

  setFlipLegs: (flipLegs) => {
    set({ config: { ...get().config, flipLegs } });
    get().requestRecompute({ immediate: true });
  },

  setInvertPath: (invertPath) => {
    set({ config: { ...get().config, invertPath } });
    get().requestRecompute({ immediate: true });
  },

  updateVertex: (index, lat, lng) => {
    const { polygon, polygonEditMode } = get();
    if (!polygon) return;
    const newPolygon = [...polygon];
    newPolygon[index] = { lat, lng };
    set({ polygon: newPolygon });
    // In edit mode just move the point and mark waypoints stale; Done recomputes.
    if (polygonEditMode) set({ pendingRecompute: true });
    else get().requestRecompute({ immediate: true });
  },

  removeVertex: (index) => {
    const { polygon, polygonEditMode } = get();
    if (!polygon || polygon.length <= 3) return; // Need at least 3 vertices
    const newPolygon = polygon.filter((_, i) => i !== index);
    set({ polygon: newPolygon });
    if (polygonEditMode) set({ pendingRecompute: true });
    else get().requestRecompute({ immediate: true });
  },

  enterPolygonEdit: () => {
    const { polygon } = get();
    set({
      polygonEditMode: true,
      pendingRecompute: false,
      editSnapshot: polygon ? polygon.map((p) => ({ ...p })) : null,
    });
  },

  exitPolygonEdit: (commit) => {
    if (recomputeTimer) { clearTimeout(recomputeTimer); recomputeTimer = null; }
    if (!commit) {
      // Cancel: restore the polygon captured on enter.
      const snap = get().editSnapshot;
      set({
        polygonEditMode: false,
        pendingRecompute: false,
        editSnapshot: null,
        ...(snap ? { polygon: snap } : {}),
      });
      return;
    }
    const dirty = get().pendingRecompute;
    set({ polygonEditMode: false, pendingRecompute: false, editSnapshot: null });
    if (dirty) get().requestRecompute({ immediate: true });
  },

  requestRecompute: (opts) => {
    if (recomputeTimer) { clearTimeout(recomputeTimer); recomputeTimer = null; }
    const run = () => {
      const { polygon, result } = get();
      if (recomputeIsHeavy(polygon, result)) {
        const count = result?.waypoints?.length ?? 0;
        const label = count > 0 ? `Recomputing ${count.toLocaleString()} waypoints...` : 'Generating waypoints...';
        void runWithActivity(label, () => get().generateSurvey());
      } else {
        get().generateSurvey();
      }
    };
    if (opts?.immediate) run();
    else recomputeTimer = setTimeout(() => { recomputeTimer = null; run(); }, RECOMPUTE_DEBOUNCE_MS);
  },

  generateSurvey: (opts) => {
    const sync = opts?.sync ?? true;
    const { polygon, config, editingGroupId } = get();
    if (!polygon || polygon.length < 3) return;

    const fullConfig: SurveyConfig = { ...config, polygon };
    const result = runGenerator(fullConfig);
    set({ result });

    // Live-edit sync: when the survey panel is editing an existing
    // SurveyGroup, push the regenerated polygon/config/items through to
    // mission-store so the committed mission tracks the on-screen draft.
    // Without this, vertex edits update the preview but leave the
    // previously-inserted WPs stale. Skipped on initial open (sync: false) so
    // opening a group for edit doesn't clobber its committed altitudes.
    if (sync && editingGroupId && result) {
      // Strip the leading NAV_TAKEOFF if the mission already has one
      // outside this group, so we don't accumulate duplicates on every
      // regeneration. Mirrors the logic in SurveyConfigPanel.handleInsertSurvey.
      let items = surveyToMissionItems(result, fullConfig);
      const missionStore = useMissionStore.getState();
      const externalTakeoff = missionStore.missionItems.some(
        (it) =>
          it.command === MAV_CMD.NAV_TAKEOFF && it.groupId !== editingGroupId,
      );
      if (externalTakeoff && items[0]?.command === MAV_CMD.NAV_TAKEOFF) {
        items = items.slice(1);
      }
      // Build a fake SurveyGroup-shaped object just for signature compute.
      const currentGroup = missionStore.groups.find(
        (g) => g.id === editingGroupId,
      );
      if (currentGroup && isSurveyGroup(currentGroup)) {
        const probe: SurveyGroup = {
          ...currentGroup,
          polygon: polygon.map((p) => ({ lat: p.lat, lng: p.lng })),
          config: fullConfig as unknown as Record<string, unknown>,
        };
        const signature = computeSurveyGroupSignature(probe);
        missionStore.syncSurveyGroupFromDraft(
          editingGroupId,
          probe.polygon,
          probe.config,
          items,
          signature,
        );
      }
    }
  },

  importArea: async () => {
    const api = window.electronAPI;
    if (!api?.importSurveyArea) return { ok: false, areaCount: 0, error: 'Import not available' };
    const res = await api.importSurveyArea();
    if (!res.success) {
      // A user cancel isn't an error worth shouting about.
      return { ok: false, areaCount: 0, error: res.error === 'Cancelled' ? undefined : res.error };
    }
    if (!res.content || !res.format) return { ok: false, areaCount: 0, error: 'Empty file' };
    const areas = parseGisArea(res.content, res.format);
    if (areas.length === 0) {
      return { ok: false, areaCount: 0, error: 'No polygon boundary found in the file' };
    }

    // The file defines the areas, so import creates one survey group per
    // polygon directly - no "draw a polygon first" step. Each is generated with
    // the current config; the first is opened in the panel for live tuning, the
    // rest sit on the map ready to edit. (Inner rings are parsed as holes but
    // the generators don't subtract them yet.)
    const { config } = get();
    const missionStore = useMissionStore.getState();
    const simplifyToleranceM = useSettingsStore.getState().surveyPerformance.importSimplifyToleranceM;
    const baseCount = missionStore.groups.filter(isSurveyGroup).length;
    const generatorId = patternToGeneratorId(config.pattern);
    const reg = getSurveyGenerator(generatorId);

    const entries: Array<{ group: SurveyGroup; items: ReturnType<typeof surveyToMissionItems> }> = [];
    await runWithActivity('Importing survey - generating waypoints...', () => {
    areas.forEach((area, i) => {
      // GIS boundaries are often digitized at sub-meter resolution (thousands of
      // vertices). Survey line spacing is tens of meters, so that detail is
      // wasted - and every vertex becomes a draggable marker plus per-edge work
      // in scan-line clipping, which is what makes large-KML import lag. Reduce
      // to a ~1 m tolerance: visually identical, orders of magnitude fewer points.
      const polygon = simplifyPolygon(
        area.polygon.map((p) => ({ lat: p.lat, lng: p.lng })),
        simplifyToleranceM,
      );
      const holes = area.holes.map((ring) =>
        simplifyPolygon(ring.map((p) => ({ lat: p.lat, lng: p.lng })), simplifyToleranceM),
      );
      // Holes flow through config so the generator can carve them out, and onto
      // the group so the map draws them as cutouts.
      const fullConfig: SurveyConfig = { ...config, polygon, holes };
      const result = runGenerator(fullConfig);
      if (!result || result.waypoints.length === 0) return;
      const items = surveyToMissionItems(result, fullConfig);
      const group = createSurveyGroup({
        name: `Imported ${baseCount + i + 1}`,
        generatorId,
        generatorVersion: reg?.version ?? '1.0.0',
        polygon,
        holes: holes.length > 0 ? holes : undefined,
        config: fullConfig as unknown as Record<string, unknown>,
        color: GROUP_COLOR_PALETTE[(baseCount + i) % GROUP_COLOR_PALETTE.length]!,
      });
      group.lastGeneratedSignature = computeSurveyGroupSignature(group);
      group.lastGeneratedAt = Date.now();
      entries.push({ group, items });
    });
    });

    if (entries.length === 0) {
      return { ok: false, areaCount: 0, error: 'Could not generate a survey from the imported area(s)' };
    }

    const ids = missionStore.addGroupsWithItems(entries);
    // Open the first imported area in the panel for editing/tuning.
    const first = entries[0]!.group;
    get().loadFromGroup({ id: ids[0]!, polygon: first.polygon, config: first.config });
    // Fly the map to what we just imported instead of leaving it wherever it was.
    missionStore.fitMapToMission();
    return { ok: true, areaCount: entries.length };
  },

  clearSurvey: () => {
    set({
      drawMode: 'none',
      drawingVertices: [],
      polygon: null,
      result: null,
      isActive: false,
      editingGroupId: null,
    });
  },

  activateSurvey: () => {
    set({ isActive: true });
  },

  deactivateSurvey: () => {
    set({
      isActive: false,
      drawMode: 'none',
      drawingVertices: [],
      polygon: null,
      result: null,
      editingGroupId: null,
    });
  },

  setEditingGroupId: (id) => {
    set({ editingGroupId: id });
  },

  loadFromGroup: (group) => {
    // Hydrate the draft from a previously-committed SurveyGroup so the user
    // can resume editing it. The polygon shape is normalized to LatLng,
    // and the generator-specific config is restored under the panel's
    // SurveyConfig shape (polygon stripped). isActive is set so the panel
    // surfaces; editingGroupId is set so future generateSurvey calls
    // write through.
    const rawConfig = group.config as Record<string, unknown>;
    const { polygon: _ignored, ...configWithoutPolygon } = rawConfig as {
      polygon?: unknown;
      [k: string]: unknown;
    };
    const config = {
      ...DEFAULT_SURVEY_CONFIG,
      ...(configWithoutPolygon as Partial<typeof DEFAULT_SURVEY_CONFIG>),
    };
    const polygon: LatLng[] = group.polygon.map((p) => ({
      lat: p.lat,
      lng: p.lng,
    }));
    set({
      drawMode: 'none',
      drawingVertices: [],
      polygon,
      config,
      isActive: true,
      editingGroupId: group.id,
    });
    // Build the preview only - do NOT sync, or merely opening a group would
    // overwrite its committed WPs (e.g. terrain-adjusted altitudes) before the
    // user edits anything. Subsequent vertex/config changes sync as normal.
    // Opening a large group regenerates a big preview; show progress.
    void runWithActivity('Loading survey...', () => get().generateSurvey({ sync: false }));
  },

  applyPresetConfig: (partial, camera) => {
    const current = get().config;
    // Merge — preset wins on keys it sets, current stays for everything else.
    // Camera is only replaced when the preset explicitly provides one (e.g.
    // Mower template flips into Manual mode); otherwise the user's chosen
    // camera survives a template switch.
    const nextConfig = {
      ...current,
      ...partial,
      ...(camera ? { camera } : {}),
    };
    set({ config: nextConfig });
    // Regenerate so the map updates immediately.
    get().requestRecompute({ immediate: true });
  },
})));

// Persistence: any change to the survey config is serialized and pushed to
// settings-store, which auto-saves it via the existing electron-store flow.
// We strip the polygon (scene-specific, not worth carrying across sessions —
// loading a saved polygon on a different map location would be confusing).
useSurveyStore.subscribe(
  (state) => state.config,
  (config) => {
    if (isHydratingFromSettings) return;
    // The Omit<SurveyConfig, 'polygon'> shape carries no polygon field already,
    // but the cast keeps us tolerant of future shape changes.
    useSettingsStore.getState().setSurveySavedConfig(config as unknown as Record<string, unknown>);
  },
);

// Shared hydration helper — applies saved config over the defaults without
// triggering the persistence subscriber above.
function applySavedConfig(saved: Record<string, unknown>) {
  isHydratingFromSettings = true;
  try {
    const merged = { ...DEFAULT_SURVEY_CONFIG, ...(saved as Partial<typeof DEFAULT_SURVEY_CONFIG>) };
    useSurveyStore.setState({ config: merged });
  } finally {
    isHydratingFromSettings = false;
  }
}

// Hydration: when settings finishes loading (single false→true transition of
// _isInitialized) and a saved config exists, apply it.
useSettingsStore.subscribe(
  (state) => state._isInitialized,
  (init, prev) => {
    if (!init || prev) return;
    const saved = useSettingsStore.getState().surveySavedConfig;
    if (saved) applySavedConfig(saved);
  },
);

// HMR / late-import safety: if settings finished loading before this module
// attached its subscriber, hydrate immediately from the current snapshot.
if (useSettingsStore.getState()._isInitialized) {
  const saved = useSettingsStore.getState().surveySavedConfig;
  if (saved) applySavedConfig(saved);
}
