import type { FeatureTour } from './types';
import { useOverlayStore } from '../stores/overlay-store';
import { useConnectionStore } from '../stores/connection-store';
import { useInspectorStore } from '../stores/inspector-store';

export const FEATURE_TOURS: FeatureTour[] = [
  {
    id: 'telemetry-overhaul-v0.0.30',
    view: 'telemetry',
    version: '0.0.30',
    title: 'Telemetry got a refresh',
    blurb: 'New tactical vehicle icon, extended flight controls and a ready-made SITL panel layout.',
    requires: {
      connection: true,
      panels: ['map', 'flightControl'],
      preset: 'pilotView',
      presetLabel: 'Pilot View',
    },
    demo: { sitl: 'ardupilot', vehicleType: 'copter' },
    steps: [
      {
        selector: '[data-tour="telemetry-map"]',
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Tactical vehicle icon</div>
            <p className="text-xs leading-relaxed opacity-90">
              The on-map vehicle has been redrawn as a tactical glyph that scales cleanly at any
              zoom, shows heading at a glance and tints by flight mode.
            </p>
          </div>
        ),
      },
      {
        selector: '[data-tour="telemetry-flight-control"]',
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Extended Flight Control panel</div>
            <p className="text-xs leading-relaxed opacity-90">
              Arm/disarm, flight-mode chips and full RC override sticks now live together in one
              panel. Toggle modes directly, feed stick inputs with keyboard or a gamepad.
            </p>
          </div>
        ),
      },
      {
        selector: '[data-tour="telemetry-layout-select"]',
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">SITL layout template</div>
            <p className="text-xs leading-relaxed opacity-90">
              A new <strong>SITL</strong> preset in the layout dropdown drops environment, failure
              injection and simulation controls straight into your telemetry view. Shows up
              automatically whenever a SITL is running.
            </p>
          </div>
        ),
      },
      {
        selector: '[data-tour="telemetry-map-overlays"]',
        predicate: () => useOverlayStore.getState().dipulAvailable,
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">German UAS geozones (DIPUL)</div>
            <p className="text-xs leading-relaxed opacity-90">
              A new <strong>DIPUL</strong> toggle lives here whenever your map viewport is inside
              Germany. One click renders the official UAS restriction layers from the Digitale
              Plattform Unbemannte Luftfahrt - control zones, flight restriction areas, nature
              reserves, hospitals, police and military properties, federal roads and industrial sites.
            </p>
            <p className="text-xs leading-relaxed opacity-90">
              The layer auto-enables the first time you pan into Germany. Your on/off choice is
              remembered across sessions, and the toggle is hidden outside Germany so it stays out
              of the way for flights anywhere else.
            </p>
            <p className="text-[10px] uppercase tracking-wide opacity-60 pt-1">
              Source: DFS, BKG
            </p>
          </div>
        ),
      },
    ],
  },
  {
    id: 'mavlink-config-grouped-tabs-v0.0.31',
    view: 'parameters',
    version: '0.0.31',
    title: 'Cleaner MAVLink Config tabs',
    blurb: 'Receiver+Modes, Motor Test+Servo Output, and Parameters+Files have been grouped to keep the top-level tab strip from sprawling. Here is where each one moved.',
    requires: { connection: true },
    demo: { sitl: 'ardupilot', vehicleType: 'copter' },
    steps: [
      {
        selector: '[data-tour="mavlink-tab-group-tuning-group"]',
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Tuning ▾ — unchanged</div>
            <p className="text-xs leading-relaxed opacity-90">
              <strong>PID</strong>, <strong>Rates</strong>, and the <strong>Tuning</strong> presets
              are still here, one click deeper. The grouping makes room for the new ones below
              without growing the tab strip.
            </p>
          </div>
        ),
      },
      {
        selector: '[data-tour="mavlink-tab-group-rc-group"]',
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">RC ▾ — new home for Receiver + Flight Modes</div>
            <p className="text-xs leading-relaxed opacity-90">
              The <strong>Receiver</strong> tab and the <strong>Flight Modes</strong> tab are now
              under <strong>RC</strong>. Both are about how your transmitter talks to the FC — same
              setup flow, same mental model.
            </p>
            <p className="text-[11px] leading-relaxed opacity-70">
              On Rovers the modes tab is labelled <em>Drive Modes</em> but lives in the same group.
            </p>
          </div>
        ),
      },
      {
        selector: '[data-tour="mavlink-tab-group-outputs-group"]',
        // Copter only — Plane and Rover have no Motor Test, so no Outputs group exists.
        predicate: () => {
          const mavType = useConnectionStore.getState().connectionState.mavType;
          if (mavType === undefined) return true;
          // MAV_TYPE_FIXED_WING=1, VTOL=19-25, GROUND_ROVER=10, SURFACE_BOAT=11
          if (mavType === 1 || (mavType >= 19 && mavType <= 25)) return false;
          if (mavType === 10 || mavType === 11) return false;
          return true;
        },
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Outputs ▾ — new home for Motor Test + Servo Output</div>
            <p className="text-xs leading-relaxed opacity-90">
              <strong>Motor Test</strong> and <strong>Servo Output</strong> are now under
              {' '}<strong>Outputs</strong>. Both are about what the FC sends to actuators —
              used during initial setup, rare in normal operation.
            </p>
            <p className="text-[11px] leading-relaxed opacity-70">
              Plane and Rover do not have Motor Test, so Servo Output stays as a top-level tab there.
            </p>
          </div>
        ),
      },
      {
        selector: '[data-tour="mavlink-tab-group-storage-group"]',
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Storage ▾ — Parameters + the new Files browser</div>
            <p className="text-xs leading-relaxed opacity-90">
              <strong>All Parameters</strong> moved here, joined by a brand-new
              {' '}<strong>Files</strong> tab — a MAVLink-FTP browser for the FC's filesystem.
              Both are FC-side persistent state, both are escape-hatch / power-user surfaces.
            </p>
            <p className="text-xs leading-relaxed opacity-90">
              Open <strong>Files</strong> now and the next few tour steps will walk you through
              upload, download, rename, and delete.
            </p>
          </div>
        ),
      },
      // The next three steps only render if the user has actually opened the
      // Files tab. If they skip it, the tour ends after Storage above.
      {
        selector: '[data-tour="ftp-path-bar"]',
        predicate: () => !!document.querySelector('[data-tour="ftp-path-bar"]'),
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Breadcrumb navigation</div>
            <p className="text-xs leading-relaxed opacity-90">
              Click any segment to jump back up the tree. SITL exposes virtual mounts at the root
              ({' '}<code className="font-mono text-[11px]">/APM/</code>,
              {' '}<code className="font-mono text-[11px]">/@SYS/</code>,
              {' '}<code className="font-mono text-[11px]">/logs/</code>,
              {' '}<code className="font-mono text-[11px]">/scripts/</code>)
              {' '}so the tree matches real-hardware behaviour.
            </p>
          </div>
        ),
      },
      {
        selector: '[data-tour="ftp-upload-button"]',
        predicate: () => !!document.querySelector('[data-tour="ftp-upload-button"]'),
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Upload a file to the FC</div>
            <p className="text-xs leading-relaxed opacity-90">
              Push any local file straight into the current FC directory — Lua scripts into
              {' '}<code className="font-mono text-[11px]">/APM/scripts/</code>, parameter dumps
              into <code className="font-mono text-[11px]">/APM/</code>, whatever you need.
              No SD-card swap.
            </p>
          </div>
        ),
      },
      {
        selector: '[data-tour="ftp-row-actions"]',
        predicate: () => !!document.querySelector('[data-tour="ftp-row-actions"]'),
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Per-file actions</div>
            <p className="text-xs leading-relaxed opacity-90">
              Every row gives you <strong>Download</strong>, <strong>Rename</strong>, and
              {' '}<strong>Delete</strong>. Great for grabbing the latest
              {' '}<code className="font-mono text-[11px]">.bin</code> log without unplugging
              the SD, or swapping out a Lua script in place.
            </p>
          </div>
        ),
      },
    ],
  },
  {
    id: 'mavlink-inspector-v0.0.31',
    view: 'inspector',
    version: '0.0.31',
    title: 'MAVLink Inspector + pop-out windows',
    blurb: 'Live tree of every message the FC sends, with one-click field graphs that can be popped out to their own native window.',
    requires: { connection: true },
    demo: { sitl: 'ardupilot', vehicleType: 'copter' },
    steps: [
      {
        selector: '[data-tour="inspector-stats"]',
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Live message catalog</div>
            <p className="text-xs leading-relaxed opacity-90">
              Total message types, aggregate rate, and total throughput from the connected FC.
              Numbers update at 4 Hz regardless of packet rate, so a 100 Hz IMU stream stays cheap.
            </p>
          </div>
        ),
      },
      {
        selector: '[data-tour="inspector-filters"]',
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Search and filter</div>
            <p className="text-xs leading-relaxed opacity-90">
              Search-as-you-type by message name. Separate dropdowns filter by
              {' '}<strong>sysid</strong> and <strong>compid</strong>, so multi-vehicle and
              multi-component setups stay readable. The tree groups by
              {' '}<code className="font-mono text-[11px]">Vehicle X · Component Y</code>.
            </p>
          </div>
        ),
      },
      {
        selector: '[data-tour="inspector-tree"]',
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Click to expand, hover to graph</div>
            <p className="text-xs leading-relaxed opacity-90">
              Click any message to see its decoded fields with current values. Hover any
              {' '}<em>numeric</em> field and a small graph icon appears on the right — click it
              to plot that field in real time.
            </p>
          </div>
        ),
      },
      {
        selector: '[data-tour="inspector-graph-workspace"]',
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Graph workspace</div>
            <p className="text-xs leading-relaxed opacity-90">
              Every field you graph lands here as a tab. Drag tabs to split into multiple
              columns, close them with the X, or just stack them. The layout persists across
              view switches and app restarts.
            </p>
          </div>
        ),
      },
      {
        selector: '[data-tour="inspector-popout"]',
        predicate: () => useInspectorStore.getState().graphs.length > 0,
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Pop the workspace to its own window</div>
            <p className="text-xs leading-relaxed opacity-90">
              One click pops the entire graph workspace out to a native window. Drag it to a
              second monitor, leave it open through the whole flight, size and position are
              remembered. The detached window shares live data with the main app — same rate,
              no re-subscribe.
            </p>
            <p className="text-[11px] leading-relaxed opacity-70">
              The same pop-out treatment works for every panel in ArduDeck: Telemetry Dashboard,
              Attitude, Battery, GPS, Map, and so on.
            </p>
          </div>
        ),
      },
    ],
  },
  {
    id: 'mission-smart-planning-v0.0.30',
    view: 'mission',
    version: '0.0.30',
    title: 'Smarter mission planning',
    blurb: 'Auto-adjust altitudes through tricky terrain and drop waypoints relative to any existing one.',
    steps: [
      {
        selector: '[data-tour="mission-altitude-panel"]',
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Auto Adjust altitudes</div>
            <p className="text-xs leading-relaxed opacity-90">
              When your route clips terrain, the altitude profile now flags collisions and
              surfaces an <strong>Auto Adjust</strong> button in the top-right of this panel.
            </p>
            <p className="text-xs leading-relaxed opacity-90">
              If simply raising existing waypoints is not enough to clear a complex ridgeline,
              it will <strong>insert intermediate waypoints</strong> to carve a safe corridor
              above terrain.
            </p>
          </div>
        ),
      },
      {
        selector: '[data-tour="mission-map"]',
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Relative waypoints</div>
            <p className="text-xs leading-relaxed opacity-90">
              <strong>Right-click</strong> any waypoint on the map to open the new Relative
              Waypoint editor.
            </p>
            <p className="text-xs leading-relaxed opacity-90">
              Drag the popover marker to dial in bearing, distance and altitude offset, all
              anchored to the waypoint you clicked. Great for offset orbits, survey entry
              points, and precision approaches.
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
