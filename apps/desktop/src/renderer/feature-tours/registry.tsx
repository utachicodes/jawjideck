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

// Order here drives two things: (1) which tour is offered first on a view that
// has more than one, and (2) the order ActiveTour's "Next feature" button walks
// an onboarding user through when they keep accepting - so it's deliberately
// laid out to follow the app's main nav top-to-bottom (telemetry -> mission ->
// library -> parameters -> inspector -> firmware -> osd -> sitl -> calibration)
// rather than by when each tour was added.
export const FEATURE_TOURS: FeatureTour[] = [
  {
    id: 'quick-launch-033',
    view: 'telemetry',
    version: '0.0.33',
    title: 'New: Quick Launch & the Area Editor',
    blurb:
      'Pop tools into their own windows from the header, and jump straight into the new Area Editor for drawing survey areas and corridors.',
    steps: [
      {
        selector: '[data-tour="welcome-cards"]',
        // Only shown on the disconnected welcome screen; skipped once connected.
        predicate: present('[data-tour="welcome-cards"]'),
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Jump straight into a tool</div>
            <p className="text-xs leading-relaxed opacity-90">
              No vehicle connected? These cards open the tools that work offline -
              {' '}<strong>Mission Planning</strong>, the new <strong>Area Editor</strong>,
              {' '}<strong>SITL</strong>, <strong>Flight Log Analysis</strong>,
              {' '}<strong>Firmware Flash</strong> and your <strong>Mission Library</strong>.
            </p>
          </div>
        ),
      },
      {
        selector: '[data-tour="quick-launch"]',
        predicate: present('[data-tour="quick-launch"]'),
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Quick Launch - tools in their own window</div>
            <p className="text-xs leading-relaxed opacity-90">
              Open the <strong>MAVLink Inspector</strong> or <strong>Telemetry Dashboard</strong> in a
              separate window - ideal for a <strong>second monitor</strong> while you keep planning or
              tuning in the main window. Each stays live alongside the rest of the app.
            </p>
          </div>
        ),
      },
      {
        selector: '[data-tour="quick-launch"]',
        predicate: present('[data-tour="quick-launch"]'),
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Meet the Area Editor</div>
            <p className="text-xs leading-relaxed opacity-90">
              The new <strong>Area Editor</strong> opens from here: a full-window map for drawing
              survey <strong>areas and corridors</strong> - multi-polygon, holes, KML import, a live
              {' '}<strong>flight briefing</strong> (toggle hectares/acres), and a
              {' '}<strong>go-to</strong> search to fly to any site. <strong>Send to mission</strong>
              {' '}drops it straight into the planner.
            </p>
          </div>
        ),
      },
    ],
  },
  {
    id: 'telemetry-live-view-033',
    view: 'telemetry',
    version: '0.0.33',
    title: 'Reading the live flight view',
    blurb: 'The map, the flight controls, and how to switch layouts once a vehicle is connected.',
    requires: {
      connection: true,
      panels: ['map', 'flightControl'],
      preset: 'pilotView',
      presetLabel: 'Pilot View',
    },
    steps: [
      {
        selector: '[data-tour="telemetry-map"]',
        predicate: present('[data-tour="telemetry-map"]'),
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Live position and flight path</div>
            <p className="text-xs leading-relaxed opacity-90">
              Your vehicle's position, heading and trail update live. A loaded mission and its
              waypoints draw here too, so you can watch progress against the plan.
            </p>
          </div>
        ),
      },
      {
        selector: '[data-tour="telemetry-map-overlays"]',
        predicate: present('[data-tour="telemetry-map-overlays"]'),
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Map layers and camera</div>
            <p className="text-xs leading-relaxed opacity-90">
              Switch base layers (satellite, terrain) and toggle <strong>terrain shading</strong> here.
              {' '}<strong>Follow vehicle</strong> keeps the camera centered on it - turn it off for a
              free, pan-and-zoom camera.
            </p>
          </div>
        ),
      },
      {
        selector: '[data-tour="telemetry-flight-control"]',
        predicate: present('[data-tour="telemetry-flight-control"]'),
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Mode, arm, and flight actions</div>
            <p className="text-xs leading-relaxed opacity-90">
              Current flight mode, the <strong>ARM/DISARM</strong> control, and one-click actions like
              {' '}<strong>Takeoff</strong> and <strong>RTL/Land</strong> - tailored to what your
              vehicle type supports.
            </p>
          </div>
        ),
      },
      {
        selector: '[data-tour="telemetry-layout-select"]',
        predicate: present('[data-tour="telemetry-layout-select"]'),
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Swap the whole layout</div>
            <p className="text-xs leading-relaxed opacity-90">
              Jump between preset layouts (Pilot View, Mission Telemetry, SITL) or load one you saved
              yourself - every panel rearranges to match.
            </p>
          </div>
        ),
      },
    ],
  },
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
              jobs - roads, rail, power lines, pipelines. Draw a centerline and Jawji lays
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
  {
    id: 'mission-library-intro-033',
    view: 'library',
    version: '0.0.33',
    title: 'Your saved missions',
    blurb: 'Every mission and survey you save lives here - searchable, taggable, and ready to reload.',
    steps: [
      {
        selector: '[data-tour="library-import"]',
        predicate: present('[data-tour="library-import"]'),
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Import from file</div>
            <p className="text-xs leading-relaxed opacity-90">
              Bring in a <strong>.waypoints</strong> or <strong>.plan</strong> file from Mission
              Planner or QGroundControl - it's added to your library, ready to fly or edit.
            </p>
          </div>
        ),
      },
      {
        selector: '[data-tour="library-search"]',
        predicate: present('[data-tour="library-search"]'),
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Find it fast</div>
            <p className="text-xs leading-relaxed opacity-90">
              Search by name, then filter by <strong>vehicle</strong> or <strong>tag</strong> and
              sort - useful once you've got more than a handful of saved plans.
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
    id: 'files-ftp-browser',
    view: 'parameters',
    version: '0.0.33',
    title: 'Browse files over MAVLink-FTP',
    blurb: 'Download logs, dataflash, and scripts straight off the flight controller - no SD card removal needed.',
    requires: { connection: true },
    steps: [
      {
        selector: '[data-tour="ftp-path-bar"]',
        // No predicate: the Files tab is activated when this tour starts (see
        // MavlinkConfigView), and mutationObservables lets the highlight snap to
        // it once the tab mounts.
        mutationObservables: ['[data-tour="ftp-path-bar"]'],
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">The FC's filesystem, in the app</div>
            <p className="text-xs leading-relaxed opacity-90">
              Click the breadcrumb to move between directories, <strong>Upload</strong> a file (e.g.
              a Lua script) straight to the FC, and use each row's icons to <strong>rename</strong>,
              {' '}<strong>delete</strong>, or <strong>download</strong> a file - all over
              MAVLink-FTP, no SD card swap required.
            </p>
          </div>
        ),
      },
    ],
  },
  {
    id: 'inspector-tour-033',
    view: 'inspector',
    version: '0.0.33',
    title: 'Get to know the MAVLink Inspector',
    blurb: 'Every message on the link, live rates, and click-to-graph any numeric field.',
    steps: [
      {
        selector: '[data-tour="inspector-stats"]',
        predicate: present('[data-tour="inspector-stats"]'),
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Every MAVLink message, live</div>
            <p className="text-xs leading-relaxed opacity-90">
              Total message types, combined rate in <strong>Hz</strong> and <strong>bandwidth</strong>
              {' '}update in real time as packets arrive. <strong>Pause</strong> freezes the view to
              inspect a moment; <strong>Clear</strong> wipes captured history.
            </p>
          </div>
        ),
      },
      {
        selector: '[data-tour="inspector-filters"]',
        predicate: present('[data-tour="inspector-filters"]'),
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Narrow the firehose</div>
            <p className="text-xs leading-relaxed opacity-90">
              Search by message name, or filter to one <strong>sysid</strong>/<strong>compid</strong>
              {' '}- handy on a link carrying multiple vehicles or components.
            </p>
          </div>
        ),
      },
      {
        selector: '[data-tour="inspector-tree"]',
        predicate: present('[data-tour="inspector-tree"]'),
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Expand a message, graph a field</div>
            <p className="text-xs leading-relaxed opacity-90">
              Click a message to expand its fields. Any numeric field gets a small graph icon - click
              it to start plotting that value live.
            </p>
          </div>
        ),
      },
      {
        selector: '[data-tour="inspector-graph-workspace"]',
        predicate: present('[data-tour="inspector-graph-workspace"]'),
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Your graphs live here</div>
            <p className="text-xs leading-relaxed opacity-90">
              Each graphed field becomes a tab. Drag tabs together for a multi-graph view, or pop a
              group out into its own window for a second monitor.
            </p>
          </div>
        ),
      },
    ],
  },
  {
    id: 'firmware-flash-intro-033',
    view: 'firmware',
    version: '0.0.33',
    title: 'Flashing firmware',
    blurb: 'Detect a board over USB (including DFU/bootloader mode), pick a source, and flash.',
    steps: [
      {
        selector: '[data-tour="firmware-detect"]',
        predicate: present('[data-tour="firmware-detect"]'),
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Plug in and detect</div>
            <p className="text-xs leading-relaxed opacity-90">
              Connect the board over USB - normal mode, MSP/MAVLink bootloader, or raw DFU are all
              detected automatically. The board's name, MCU, and current firmware show here once found.
            </p>
          </div>
        ),
      },
      {
        selector: '[data-tour="firmware-source"]',
        predicate: present('[data-tour="firmware-source"]'),
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Pick a firmware source</div>
            <p className="text-xs leading-relaxed opacity-90">
              ArduPilot, PX4, Betaflight, iNav, or load your own <strong>.bin/.hex/.apj</strong> with
              {' '}<strong>Custom</strong>. Cross-flashing between sources (e.g. Betaflight to iNav)
              is supported.
            </p>
          </div>
        ),
      },
      {
        selector: '[data-tour="firmware-flash-button"]',
        predicate: present('[data-tour="firmware-flash-button"]'),
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Flash</div>
            <p className="text-xs leading-relaxed opacity-90">
              Once a board, version, and (if needed) target are selected, this downloads the firmware
              and writes it - progress and any errors show right here.
            </p>
          </div>
        ),
      },
    ],
  },
  {
    id: 'osd-simulator-intro-033',
    view: 'osd',
    version: '0.0.33',
    title: 'Designing your OSD layout',
    blurb: 'Preview your on-screen display and drag elements into place before you ever plug in goggles.',
    steps: [
      {
        selector: '[data-tour="osd-mode-select"]',
        predicate: present('[data-tour="osd-mode-select"]'),
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Demo, Live, or Edit</div>
            <p className="text-xs leading-relaxed opacity-90">
              <strong>Demo</strong> shows sample values, <strong>Live</strong> uses real telemetry
              from a connected vehicle, and <strong>Edit Layout</strong> lets you drag elements
              around the canvas.
            </p>
          </div>
        ),
      },
      {
        selector: '[data-tour="osd-element-browser"]',
        predicate: present('[data-tour="osd-element-browser"]'),
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Every element you can place</div>
            <p className="text-xs leading-relaxed opacity-90">
              Battery voltage, GPS, flight mode, and more - pick one, then switch to
              {' '}<strong>Edit Layout</strong> mode and drag it anywhere on the canvas.
            </p>
          </div>
        ),
      },
    ],
  },
  {
    id: 'sitl-simulator-intro-033',
    view: 'sitl',
    version: '0.0.33',
    title: 'Flying without hardware',
    blurb: 'Launch a virtual ArduPilot or iNav flight controller and connect to it just like a real board.',
    steps: [
      {
        selector: '[data-tour="sitl-vehicle-type"]',
        predicate: present('[data-tour="sitl-vehicle-type"]'),
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Pick a vehicle type</div>
            <p className="text-xs leading-relaxed opacity-90">
              SITL simulates the airframe's physics too, so choose copter, plane, rover, or sub
              before launching - it changes how the simulated vehicle flies.
            </p>
          </div>
        ),
      },
      {
        selector: '[data-tour="sitl-start-button"]',
        predicate: present('[data-tour="sitl-start-button"]'),
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Download once, launch anytime</div>
            <p className="text-xs leading-relaxed opacity-90">
              First run downloads the SITL binary for your vehicle. After that, <strong>Start</strong>
              {' '}boots it instantly - connect over TCP at{' '}
              <code className="font-mono text-[11px]">127.0.0.1:5760</code> from the sidebar.
            </p>
          </div>
        ),
      },
    ],
  },
  {
    id: 'calibration-intro-033',
    view: 'calibration',
    version: '0.0.33',
    title: 'Calibrating sensors',
    blurb: 'Walks you through accelerometer, compass, gyro, and optical flow calibration step by step.',
    requires: { connection: true },
    steps: [
      {
        selector: '[data-tour="calibration-type-grid"]',
        predicate: present('[data-tour="calibration-type-grid"]'),
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Pick what needs calibrating</div>
            <p className="text-xs leading-relaxed opacity-90">
              Cards only appear for sensors your flight controller actually has. A warning badge
              means arming is currently blocked on that calibration - pick it to walk through the
              steps.
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
