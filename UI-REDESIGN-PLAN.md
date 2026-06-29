# Jawji UI Redesign — Implementation Plan

Base path: `apps/desktop/src/renderer`

---

## Phase 1: Dead Code Cleanup + Shared Utilities

**Goal:** Remove dead code and extract duplicated utilities into shared modules before touching any UI.

### 1a. Delete BetaflightDashboard (dead code)

**Delete:**
- `components/betaflight/BetaflightDashboard.tsx`
- `components/betaflight/index.ts`

**Verify:** `BetaflightDashboard` is only exported from its own index.ts. Not imported in App.tsx or anywhere else. The betaflight folder is safe to remove entirely.

### 1b. Extract shared `mavTypeToVehicleType`

**Current duplication:**
- `App.tsx:101` — inline object literal
- `components/settings/SettingsView.tsx:61` — identical object literal
- `shared/parameter-metadata.ts` — already has it as a function

**Create:** `lib/mav-type.ts`
```ts
import type { VehicleType } from '../stores/settings-store';

export const MAV_TYPE_TO_VEHICLE: Record<number, VehicleType> = {
  0: 'copter', 1: 'plane', 2: 'copter', 3: 'copter', 4: 'copter',
  10: 'rover', 11: 'boat', 12: 'sub', 13: 'copter', 14: 'copter',
  15: 'copter', 16: 'plane', 19: 'vtol', 20: 'vtol', 21: 'vtol',
  22: 'vtol', 23: 'vtol', 24: 'vtol', 25: 'vtol',
};
```

**Update imports in:**
- `App.tsx:101` → delete inline copy, import from `lib/mav-type`
- `SettingsView.tsx:61` → delete inline copy, import from `lib/mav-type`
- `shared/parameter-metadata.ts` → replace its `mavTypeToVehicleType` function with re-export from `lib/mav-type`

### 1c. Extract shared `severityColor`

**Current duplication:**
- `components/debug/DebugConsole.tsx:25`
- `components/panels/MessagesPanel.tsx:8`

**Create:** `lib/severity.ts`
```ts
export function severityColor(severity: number): string {
  switch (severity) {
    case 0: case 1: case 2: case 3: return 'text-red-400';
    case 4: return 'text-yellow-400';
    case 5: return 'text-blue-400';
    case 6: return 'text-content';
    default: return 'text-content-secondary';
  }
}
```

**Update imports in both files.**

### 1d. Resolve duplicate StatCard

**Current:**
- `components/ui/StatCard.tsx` — clean, typed component (label, value, unit, icon, accent)
- `SettingsView.tsx:237` — local `StatCard` with different props (icon, value, label, color)

**Action:** The local `StatCard` in SettingsView has a different shape (icon prop is ReactNode, color is a full className string). Since it's only used in `ArduPilotFlightStats` (4 calls), inline it into `ArduPilotFlightStats` as simple divs rather than forcing the shared `StatCard` to accommodate two APIs. Delete the local `StatCard` function.

**Files touched:** `SettingsView.tsx` — replace `<StatCard>` calls in `ArduPilotFlightStats` with inline markup matching the existing pattern.

### 1e. Extract CircularGauge to shared UI

**Create:** `components/ui/CircularGauge.tsx` — move the local component from `SettingsView.tsx:175-234` verbatim.

**Update:** `SettingsView.tsx` imports from `../ui/CircularGauge`.

---

## Phase 2: Navigation Rail → Compact 64px Icon Rail

**Goal:** Convert the 176px label+icon sidebar into a VS Code-style 64px icon-only rail that expands on hover to show labels.

### Architecture

The new rail has two states:
1. **Collapsed (64px, `w-16`):** Icon-only, vertically stacked, grouped with subtle dividers
2. **Expanded (220px, `w-[220px]`):** Icon + label, triggered by hover with a 200ms delay (to avoid flicker)

The hover expansion is CSS-driven (`group-hover`) with a transition, not React state — zero re-renders.

### New file: `components/navigation/CompactNavRail.tsx`

Replace `NavigationRail.tsx` entirely. Structure:

```tsx
<nav className="w-16 group/nav hover:w-[220px] h-full bg-surface-nav border-r border-subtle
     flex flex-col py-2 shrink-0 transition-[width] duration-300 overflow-hidden">
  {/* Items with group-hover to show labels */}
  <NavItem icon={<BarChart3 />} label="Telemetry" id="telemetry" active={...} />
  {/* Group dividers between Fly/Configure/Tools */}
  <div className="my-1 border-t border-subtle mx-3" />
  {/* Bottom section: Settings, Theme, Report */}
</nav>
```

### NavItem component (inline in CompactNavRail.tsx):

```tsx
function NavItem({ icon, label, id, active, disabled, onClick }) {
  return (
    <button
      onClick={() => !disabled && onClick(id)}
      disabled={disabled}
      className={`
        relative w-full flex items-center gap-3 px-3 py-2.5 mx-1.5 rounded-lg
        text-sm font-medium transition-colors
        ${active ? 'bg-blue-500/20 text-blue-400' : 'text-content-secondary hover:bg-surface-raised hover:text-content'}
        ${disabled ? 'opacity-40 cursor-not-allowed' : ''}
      `}
      title={label}
    >
      {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-blue-400 rounded-r" />}
      <span className="w-5 h-5 shrink-0">{icon}</span>
      <span className="whitespace-nowrap opacity-0 group-hover/nav:opacity-100 transition-opacity duration-200">
        {label}
      </span>
    </button>
  );
}
```

### Group labels:

```tsx
{/* Shown only on hover via group-hover */}
<div className="px-4 mt-3 mb-1 opacity-0 group-hover/nav:opacity-100 transition-opacity duration-200">
  <span className="section-header-eyebrow">Fly</span>
</div>
```

### Icon mapping (replace all inline SVGs with lucide-react):

| View | Current inline icon | lucide-react icon |
|------|-------------------|-------------------|
| telemetry | BarChart3 | `BarChart3` |
| mission | Map | `Map` |
| library | BookOpen | `BookOpen` |
| parameters | SlidersHorizontal | `SlidersHorizontal` |
| calibration | ShieldCheck | `ShieldCheck` |
| inspector | ClipboardList | `ClipboardList` |
| firmware | Cpu | `Cpu` |
| osd | Monitor | `Monitor` |
| sitl | MonitorPlay | `MonitorPlay` |
| lua-graph | Network | `Network` |
| modules | Package | `Package` |
| cli | Terminal | `Terminal` |
| companion | Server | `Server` |
| logs | FileText | `FileText` |
| settings | Settings | `Settings` |
| report | AlertTriangle | `AlertTriangle` |
| theme (dark) | Moon | `Moon` |
| theme (light) | Sun | `Sun` |
| theme (system) | Monitor | `Monitor` |

### ThemeToggle → Compact form:

Move ThemeToggle inside the bottom section of CompactNavRail. On collapsed state it shows the current theme icon. On expand it shows "Dark theme" / "Light theme" / "System theme" text.

### Files touched:
- **Delete:** `components/navigation/NavigationRail.tsx` (replaced entirely)
- **Create:** `components/navigation/CompactNavRail.tsx`
- **Update:** `App.tsx` — change import from `NavigationRail` to `CompactNavRail`, adjust the flex layout

### App.tsx layout change:

Current:
```tsx
<div className="flex h-full">
  <NavigationRail onViewChange={handleViewChange} />
  <aside className={`border-r border-subtle bg-surface-nav shrink-0 transition-all duration-300 ${sidebarCollapsed ? 'w-16' : 'w-80'}`}>
```

New:
```tsx
<div className="flex h-full">
  <CompactNavRail onViewChange={handleViewChange} />
  <aside className={`border-r border-subtle bg-surface-nav shrink-0 transition-all duration-300 ${sidebarCollapsed ? 'w-16' : 'w-80'}`}>
```

No other App.tsx layout changes needed — the aside/main flex pattern stays the same.

### Risk areas:
- Hover expand must use CSS `group-hover`, not `onMouseEnter` state, to avoid re-renders during rapid mouse movement
- The `transition-[width] duration-300` must work with Tailwind — if `transition-all` is too broad, use explicit `transition-[width]`
- `overflow-hidden` on the nav prevents labels from breaking layout during width transition

---

## Phase 3: Layout Optimization

**Goal:** Reduce total chrome width. Currently NavigationRail (176px) + Sidebar (320px) = 496px. After Phase 2 it becomes 64px + 320px = 384px, and on hover 220px + 320px = 540px temporarily.

### 3a. Collapse sidebar by default when connected

Already implemented via `sidebarCollapsedByContext` — the collapsed state defaults to `true` when connected. No change needed, just verify it still works with the new nav rail.

### 3b. ConnectionPanel in CollapsedSidebar

The `CollapsedSidebar` component (App.tsx:182-237) currently shows:
- Expand button
- Connection status dot
- System ID
- Disconnect button

This is good. No changes needed to its content — it already works at 64px width.

### 3c. Remove sidebar collapse button from expanded sidebar

Currently there's an absolutely-positioned collapse button at `top-3 right-3` inside the sidebar (App.tsx:896-904). Keep this — it's the only way to collapse the sidebar. No change.

### Files touched:
- **Update:** `App.tsx` — only the NavigationRail import change from Phase 2

---

## Phase 4: Settings Decomposition

**Goal:** Break the 3420-line `SettingsView.tsx` into a tabbed interface with 5 tabs.

### Tab structure

| Tab | ID | Content extracted from SettingsView |
|-----|-----|-------------------------------------|
| Vehicle | `vehicle` | Active vehicle card, performance gauges, weather, flight stats, tips, vehicle profiles list, vehicle edit modal, template picker |
| Display | `display` | Display units toggle, experience level, UI visibility, survey performance settings |
| Mission | `mission` | Mission defaults section (altitude, speed, etc.) |
| Map | `map` | Offline maps (TileCacheCard), Map overlays (OpenAIP key) |
| About | `about` | About section, console settings, AI analysis, experimental features |

### New file structure under `components/settings/`:

```
components/settings/
├── SettingsView.tsx          (slim shell: header + Tabs + renders active tab)
├── tabs/
│   ├── VehicleTab.tsx        (~900 lines — vehicle card, gauges, weather, profiles, edit modal)
│   ├── DisplayTab.tsx        (~350 lines — units, experience, UI visibility, survey perf)
│   ├── MissionTab.tsx        (~200 lines — mission defaults)
│   ├── MapTab.tsx            (~100 lines — TileCacheCard + OpenAIP key)
│   └── AboutTab.tsx          (~400 lines — about, console, AI, experimental)
├── WeatherWidget.tsx         (extracted from SettingsView:293-870, ~580 lines)
├── vehicle-profile/          (existing subcomponents — no changes)
├── TileCacheCard.tsx         (existing — no changes)
├── SigningSection.tsx        (existing — no changes)
└── index.ts                  (existing export)
```

### SettingsView.tsx (new, ~80 lines):

```tsx
import { useState } from 'react';
import { Tabs } from '../ui/Tabs';
import { VehicleTab } from './tabs/VehicleTab';
import { DisplayTab } from './tabs/DisplayTab';
import { MissionTab } from './tabs/MissionTab';
import { MapTab } from './tabs/MapTab';
import { AboutTab } from './tabs/AboutTab';

type SettingsTab = 'vehicle' | 'display' | 'mission' | 'map' | 'about';

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'vehicle', label: 'Vehicle' },
  { id: 'display', label: 'Display' },
  { id: 'mission', label: 'Mission' },
  { id: 'map', label: 'Map' },
  { id: 'about', label: 'About' },
];

export function SettingsView() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('vehicle');

  return (
    <div className="h-full overflow-auto bg-surface-input">
      <div className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold text-content mb-4">Settings</h1>
        <Tabs items={TABS} active={activeTab} onChange={setActiveTab} />
        <div className="mt-6">
          {activeTab === 'vehicle' && <VehicleTab />}
          {activeTab === 'display' && <DisplayTab />}
          {activeTab === 'mission' && <MissionTab />}
          {activeTab === 'map' && <MapTab />}
          {activeTab === 'about' && <AboutTab />}
        </div>
      </div>
    </div>
  );
}
```

### What moves where:

**VehicleTab.tsx** gets:
- ProfileCompatibilityBanner (line 120-172)
- Active vehicle card section (line 1099-1220)
- Performance gauges section (line 1222-1274)
- WeatherWidget import (already extracted)
- ArduPilotFlightStats (line 873-911)
- Tips section
- Vehicle profiles list section (line 1587-1660)
- VehicleEditModal (line 2579-3420) — keep as a modal, not in the tab tree
- VehicleTemplatePicker
- All vehicle form helpers (useVehicleForm, FrameSizeInput, SelectField, etc.)
- Helper functions: fmtWeight, fmtLength, fmtCapacity, unitLabel, LARGE_UNIT_FIELDS
- Constants: FIRMWARE_SUPPORTED_TYPES, FIRMWARE_NAMES, checkProfileCompatibility
- State: editingVehicleId, showTemplatePicker, missionLocalValues (mission-specific ones move)

**DisplayTab.tsx** gets:
- Display units toggle (line 1306-1340)
- Experience level selector (line 1343-1410)
- UI visibility toggles
- Survey performance settings

**MissionTab.tsx** gets:
- Mission defaults section (line 1413-1513)
- Validation helpers: MISSION_FIELD_RULES, validateField

**MapTab.tsx** gets:
- TileCacheCard import
- OpenAIP key input (OpenAipKeyInput function, line 1720-1769)
- Map overlays section

**AboutTab.tsx** gets:
- AboutSection (line 2038-2224)
- ConsoleSettingsSection (line 1772-1807)
- AiAnalysisSection (line 1809-1934)
- ExperimentalFeaturesSection (line 1936-2017)
- ScriptInstallerActions (line 2020-2036)

### Deep-link scroll support:

The `scrollTarget` logic in SettingsView (line 940-953) uses `document.getElementById`. With tabs, the target element may be on a different tab. **Solution:** When `scrollTarget` arrives, set the appropriate tab first, then scroll after a short delay.

```tsx
useEffect(() => {
  if (!scrollTarget) return;
  // Map scroll targets to tabs
  const tabMap: Record<string, SettingsTab> = {
    'survey-performance': 'display',
    'mission-defaults': 'mission',
    // etc.
  };
  const targetTab = tabMap[scrollTarget];
  if (targetTab) setActiveTab(targetTab);
  // Delay scroll to let tab render
  setTimeout(() => {
    const el = document.getElementById(scrollTarget);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.add('ring-2', 'ring-blue-500/60');
      setTimeout(() => el.classList.remove('ring-2', 'ring-blue-500/60'), 1800);
    }
    useNavigationStore.getState().clearScrollTarget();
  }, 100);
}, [scrollTarget]);
```

### Risk areas:
- The `VehicleEditModal` is deeply coupled to vehicle state in the parent. Keep it as a sibling component inside VehicleTab, not extracted to its own module yet.
- `useVehicleForm` hook must stay co-located with VehicleEditModal since it depends on `VehicleProfile` type.
- WeatherWidget extraction is clean — it only depends on `useTelemetryStore` GPS and a `vehicleType` prop.

---

## Phase 5: Icon Standardization

**Goal:** Replace inline SVGs with lucide-react icons throughout the app.

### Priority files (most inline SVGs):

| File | Approx inline SVGs | Priority |
|------|-------------------|----------|
| SettingsView.tsx (now VehicleTab) | ~30 (weather icons, vehicle icons, UI icons) | High |
| App.tsx (VehicleMismatchDialog, CollapsedSidebar, WelcomeCards) | ~15 | Medium |
| AppShell.tsx | ~8 | Medium |
| CompactNavRail.tsx (from Phase 2) | 0 (already lucide) | Done |
| ConnectionPanel | ~10 | Low (skip for now) |

### WeatherWidget icon replacement:

The WeatherWidget has 7 custom weather condition icons (Thunderstorm, Rain, Snow, Cloudy, Partly Cloudy, Fog, Clear) that are detailed SVGs. **lucide-react has matching icons:**
- Thunderstorm → `CloudLightning`
- Rain → `CloudRain`
- Snow → `CloudSnow`
- Cloudy → `Cloud`
- Partly Cloudy → `CloudSun`
- Fog → `CloudFog`
- Clear/Sunny → `Sun`

These are close matches. The custom SVGs are more detailed but lucide icons are consistent with the rest of the app. **Recommendation:** Use lucide icons for consistency.

### VehicleMismatchDialog + CollapsedSidebar in App.tsx:

Replace inline SVGs with lucide:
- Warning triangle → `AlertTriangle`
- Expand arrows → `ChevronRight`
- Disconnect X → `X`
- Settings gear → `Settings`
- CLI exit warning → `AlertTriangle`
- Close X → `X`

### WelcomeCards in App.tsx:

The `WELCOME_CARDS` array has `iconPath` strings for inline SVG `<path>`. Convert to lucide icon component references:

```tsx
import { Map, PenTool, Cpu, Monitor, BarChart3, BookOpen } from 'lucide-react';

const WELCOME_CARDS = [
  { ..., icon: Map },
  { ..., icon: PenTool },
  // etc.
];
```

Then render as `{card.icon && <card.icon className="w-4 h-4" />}`.

### AppShell.tsx:

Replace:
- Stale connection warning icon → `AlertTriangle`
- Connection dots are fine (pure CSS)
- Spinner can stay as SVG or use `Loader2` from lucide
- Close X → `X`

### Files touched:
- `App.tsx` — replace inline SVGs in VehicleMismatchDialog, CollapsedSidebar, WelcomeCards
- `components/settings/tabs/VehicleTab.tsx` — replace weather icons with lucide
- `components/layout/AppShell.tsx` — replace inline SVGs

### Skip (too many, low impact):
- ConnectionPanel.tsx (1066 lines, complex connection UI — leave for a future pass)
- Individual view components (TelemetryDashboard, ParametersView, etc.)

---

## Phase 6: Component Cleanup

### 6a. Remove duplicate StatCard (covered in Phase 1d)

Already handled — delete local StatCard from SettingsView, use inline divs in ArduPilotFlightStats.

### 6b. Extract WeatherWidget (covered in Phase 4)

Move from SettingsView.tsx to `components/settings/WeatherWidget.tsx`. It's ~580 lines with its own caching logic, API calls, and rendering. Clean extraction — only depends on `useTelemetryStore` GPS and a `vehicleType` prop.

### 6c. Extract circular helpers from SettingsView

The following helper functions are SettingsView-specific and should stay with VehicleTab:
- `fmtWeight`, `fmtLength`, `fmtCapacity`, `unitLabel`
- `LARGE_UNIT_FIELDS`
- `checkProfileCompatibility`
- `formatTime`, `formatDistance` (used in ArduPilotFlightStats and vehicle card)
- `MISSION_FIELD_RULES`, `VEHICLE_FIELD_RULES`, `validateField`

### 6d. Extract VehicleEditModal

Move `VehicleEditModal` + `useVehicleForm` + related form helpers to `components/settings/vehicle-profile/VehicleEditModal.tsx`. It's ~840 lines and self-contained (receives vehicle + onUpdate + onClose props).

### Files created/modified summary:

**New files:**
- `lib/mav-type.ts`
- `lib/severity.ts`
- `components/navigation/CompactNavRail.tsx`
- `components/settings/WeatherWidget.tsx`
- `components/settings/tabs/VehicleTab.tsx`
- `components/settings/tabs/DisplayTab.tsx`
- `components/settings/tabs/MissionTab.tsx`
- `components/settings/tabs/MapTab.tsx`
- `components/settings/tabs/AboutTab.tsx`
- `components/ui/CircularGauge.tsx`
- `components/settings/vehicle-profile/VehicleEditModal.tsx`

**Modified files:**
- `App.tsx` — nav rail import, lucide icons, mav-type import
- `components/settings/SettingsView.tsx` — reduced to ~80 line shell
- `components/layout/AppShell.tsx` — lucide icons
- `components/debug/DebugConsole.tsx` — severity import
- `components/panels/MessagesPanel.tsx` — severity import
- `shared/parameter-metadata.ts` — mav-type re-export

**Deleted files:**
- `components/betaflight/BetaflightDashboard.tsx`
- `components/betaflight/index.ts`
- `components/navigation/NavigationRail.tsx`

---

## Execution Order & Dependencies

```
Phase 1a (delete BetaflightDashboard)          ← no deps
Phase 1b (extract mavTypeToVehicleType)        ← no deps
Phase 1c (extract severityColor)               ← no deps
Phase 1d (resolve StatCard)                    ← no deps
Phase 1e (extract CircularGauge)               ← no deps
    ↓ all Phase 1 items are independent
Phase 2 (CompactNavRail)                       ← no deps on Phase 1
Phase 3 (layout optimization)                  ← depends on Phase 2
Phase 4 (Settings decomposition)               ← depends on Phase 1d, 1e
Phase 5 (icon standardization)                 ← depends on Phase 2 (nav icons done), Phase 4 (WeatherWidget extracted)
Phase 6 (component cleanup)                    ← depends on Phase 4 (VehicleEditModal extraction)
```

**Parallelization:** Phases 1a-1e can run in parallel. Phase 2 and 4 can run in parallel. Phase 5 depends on 2+4. Phase 6 depends on 4.

---

## Testing Checklist

After each phase:
1. `npm run build` (or equivalent) passes with zero errors
2. App launches in Electron without white screen
3. Navigate to every view via the nav rail
4. Connect to a flight controller (or SITL) — verify telemetry loads
5. Open Settings — verify all 5 tabs render correctly
6. Check dark/light/system theme cycling
7. Resize window — verify responsive behavior

After Phase 4 specifically:
1. Each settings tab renders without errors
2. Vehicle tab: edit vehicle, switch profiles, template picker works
3. Display tab: toggle units, change experience level
4. Mission tab: edit mission defaults, verify validation
5. Map tab: tile cache card renders, OpenAIP key save/load works
6. About tab: update check, experimental toggles, guided tour replay
7. Deep-link scroll from survey panel to settings works

After Phase 5:
1. All lucide icons render at correct size (w-5 h-5 for nav, w-4 h-4 for inline)
2. Weather icons look acceptable in the weather widget
3. Welcome card icons scale properly
