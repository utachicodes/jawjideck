import type { FeatureTour } from './types';
import { useParameterStore } from '../stores/parameter-store';
import { hasDualVtolControllers } from '../components/mavlink-config/mavlink-pid-schemes';

// Feature tours are the per-release "what's new" walkthroughs. They are NOT
// version-gated at runtime (TourManager shows any registry tour the user hasn't
// seen for the current view), so stale tours keep prompting until removed here.
//
// One tour per SCREEN so a walkthrough never jumps the user between views. Each
// step's `predicate` skips it when its anchor isn't in the DOM (e.g. no groups
// yet), so a tour degrades gracefully instead of pointing at nothing.
const present = (selector: string) => () => !!document.querySelector(selector);

export const FEATURE_TOURS: FeatureTour[] = [
  {
    id: 'mission-planning-alpha32',
    view: 'mission',
    version: '0.0.32',
    title: 'Mission planning, leveled up',
    blurb:
      'Grouped missions, corridor surveys, GSD-first planning, GIS import, multi-format export, and full undo - all in the planner.',
    steps: [
      {
        selector: '[data-tour="mission-group"]',
        predicate: present('[data-tour="mission-group"]'),
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Missions are organized into groups</div>
            <p className="text-xs leading-relaxed opacity-90">
              Every waypoint now lives in a named, colored <strong>group</strong>. Click the swatch
              to recolor, the checkbox to show/hide it on the map, and the per-group button to
              upload or save just that group. Each header shows the group's
              {' '}<strong>distance, flight time and GSD</strong> at a glance.
            </p>
          </div>
        ),
      },
      {
        selector: '[data-tour="mission-survey"]',
        predicate: present('[data-tour="mission-survey"]'),
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Corridor surveys</div>
            <p className="text-xs leading-relaxed opacity-90">
              Under the <strong>Survey</strong> button, pick <strong>Corridor</strong> for linear
              jobs - roads, rail, power lines, pipelines. Draw a centerline and ArduDeck lays
              parallel strips along it. Pick <strong>Plane</strong> (racetrack turns at sharp bends)
              or <strong>Copter</strong> (turns on the spot), and set width, strip count and overlap.
            </p>
          </div>
        ),
      },
      {
        selector: '[data-tour="mission-survey"]',
        predicate: present('[data-tour="mission-survey"]'),
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Smarter area surveys</div>
            <p className="text-xs leading-relaxed opacity-90">
              Plan by <strong>GSD</strong> (cm/px) instead of guessing altitude, see live
              {' '}<strong>battery and data</strong> estimates, and split a big job into
              {' '}<strong>battery-sized sorties</strong> in one click. Crosshatch can even fly its
              two passes at <strong>two different heights</strong> for better 3D.
            </p>
          </div>
        ),
      },
      {
        selector: '[data-tour="mission-import"]',
        predicate: present('[data-tour="mission-import"]'),
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Import an area from GIS</div>
            <p className="text-xs leading-relaxed opacity-90">
              Bring a survey boundary straight in from <strong>KML</strong>, <strong>KMZ</strong> or
              {' '}<strong>GeoJSON</strong> - one survey group per polygon, inner rings kept as
              no-fly holes. No more re-tracing a boundary by hand.
            </p>
          </div>
        ),
      },
      {
        selector: '[data-tour="mission-export"]',
        predicate: present('[data-tour="mission-export"]'),
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Export in any format</div>
            <p className="text-xs leading-relaxed opacity-90">
              Save or export the whole mission from here - <strong>.waypoints</strong> (QGC WPL, for
              ArduPilot / Mission Planner) or <strong>.plan</strong> (QGroundControl). Pick the
              format up front; no guessing from the file dialog.
            </p>
          </div>
        ),
      },
      {
        selector: '[data-tour="mission-history"]',
        predicate: present('[data-tour="mission-history"]'),
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Undo, redo and crash recovery</div>
            <p className="text-xs leading-relaxed opacity-90">
              Full <strong>undo / redo</strong> (Cmd/Ctrl+Z) across edits, plus automatic
              {' '}<strong>autosave</strong> - if the app closes mid-plan, your mission is recovered
              on the next launch.
            </p>
          </div>
        ),
      },
    ],
  },
  {
    id: 'vtol-dual-controller-tuning-alpha32',
    view: 'parameters',
    version: '0.0.32',
    title: 'Tune VTOL and fixed-wing separately',
    blurb: 'QuadPlanes carry two controller sets. The PID tab now lets you switch which one you tune.',
    // Only offer this on a QuadPlane that exposes both control-law sets; on any
    // other vehicle the switch does not exist, so the tour stays hidden.
    predicate: () => hasDualVtolControllers(useParameterStore.getState().parameters),
    steps: [
      {
        selector: '[data-tour="tuning-vtol-toggle"]',
        predicate: present('[data-tour="tuning-vtol-toggle"]'),
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Two controllers, one autopilot</div>
            <p className="text-xs leading-relaxed opacity-90">
              A QuadPlane runs separate controllers for hover and forward flight. This switch flips
              the PID tab between the <strong>VTOL</strong> rate controller
              {' '}(<code className="font-mono text-[11px]">Q_A_RAT_</code>) and the
              {' '}<strong>fixed-wing</strong> controller
              {' '}(<code className="font-mono text-[11px]">RLL_RATE_</code> /
              {' '}<code className="font-mono text-[11px]">RLL2SRV_</code>).
            </p>
            <p className="text-xs leading-relaxed opacity-90">
              The sliders, presets and profiles all follow your choice, so you can tune each set
              without leaving the page.
            </p>
          </div>
        ),
      },
    ],
  },
  {
    id: 'flight-info-alpha32-5',
    view: 'mission',
    version: '0.0.32.5',
    title: 'New: the Flight Info briefing',
    blurb:
      'A live pre-flight briefing for any mission or survey: endurance and batteries, distance and altitude, site wind and weather, and your daylight window.',
    steps: [
      {
        selector: '[data-tour="flight-info-panel"]',
        // No predicate: the panel's tab is activated when this tour starts (see
        // MissionPlanningView), and mutationObservables lets the highlight snap
        // to it once dockview mounts the panel content.
        mutationObservables: ['[data-tour="flight-info-panel"]'],
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Brief the flight before you fly it</div>
            <p className="text-xs leading-relaxed opacity-90">
              The new <strong>Flight Info</strong> tab turns your mission into the numbers a pilot
              decides on: <strong>flight time</strong> and how many <strong>batteries</strong> it
              needs, total <strong>distance</strong> and <strong>altitude</strong> against the
              ceiling, and live <strong>site weather</strong>.
            </p>
            <p className="text-xs leading-relaxed opacity-90">
              Wind shows as a <strong>compass</strong>, and the <strong>daylight</strong> bar marks
              when the flight would finish against sunset - so you can see at a glance whether it
              lands before dark.
            </p>
          </div>
        ),
      },
    ],
  },
];

export function getToursForView(view: string): FeatureTour[] {
  return FEATURE_TOURS.filter((t) => t.view === view);
}

export function getTourById(id: string): FeatureTour | undefined {
  return FEATURE_TOURS.find((t) => t.id === id);
}
