/**
 * Pre-built graph templates for common ArduPilot scripting patterns.
 * Each template is hand-laid-out with comment annotations, generous spacing,
 * and a clear left-to-right data flow to serve as learning examples.
 */
import type { GraphFile } from './lua-graph-types';

export interface GraphTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  graph: GraphFile;
}

export const GRAPH_TEMPLATES: GraphTemplate[] = [
  // ─── Low Battery Warning ──────────────────────────────────────
  {
    id: 'low-battery-warning',
    name: 'Low Battery Warning',
    description: 'Send a GCS alert when battery voltage drops below a threshold.',
    category: 'Safety',
    graph: {
      version: 1,
      name: 'Low Battery Warning',
      description: 'Send a GCS alert when battery voltage drops below threshold',
      runIntervalMs: 1000,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      nodes: [
        // ── Stage annotations ──
        {
          id: 'comment_input',
          type: 'flow-comment',
          position: { x: 40, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 1',
            category: 'flow',
            propertyValues: { text: 'Read battery voltage from the flight controller' },
          },
        },
        {
          id: 'comment_logic',
          type: 'flow-comment',
          position: { x: 400, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 2',
            category: 'flow',
            propertyValues: { text: 'Is voltage below our safety limit?' },
          },
        },
        {
          id: 'comment_action',
          type: 'flow-comment',
          position: { x: 740, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 3',
            category: 'flow',
            propertyValues: { text: 'Warn the pilot via GCS message' },
          },
        },
        // ── Data flow ──
        {
          id: 'sensor',
          type: 'sensor-battery',
          position: { x: 60, y: 100 },
          data: {
            definitionType: 'sensor-battery',
            label: 'Battery',
            category: 'sensors',
            propertyValues: { instance: 0 },
          },
        },
        {
          id: 'compare',
          type: 'logic-compare',
          position: { x: 420, y: 110 },
          data: {
            definitionType: 'logic-compare',
            label: 'Voltage < 14.2?',
            category: 'logic',
            propertyValues: { operator: '<' },
          },
        },
        {
          id: 'threshold',
          type: 'var-constant',
          position: { x: 220, y: 290 },
          data: {
            definitionType: 'var-constant',
            label: 'Threshold (V)',
            category: 'variables',
            propertyValues: { type: 'number', value: '14.2' },
          },
        },
        {
          id: 'alert',
          type: 'action-gcs-text',
          position: { x: 740, y: 120 },
          data: {
            definitionType: 'action-gcs-text',
            label: 'Warn Low Battery',
            category: 'actions',
            propertyValues: { message: 'WARNING: Low battery voltage!', severity: 4 },
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'sensor', target: 'compare', sourceHandle: 'voltage', targetHandle: 'a' },
        { id: 'e2', source: 'threshold', target: 'compare', sourceHandle: 'value', targetHandle: 'b' },
        { id: 'e3', source: 'compare', target: 'alert', sourceHandle: 'result', targetHandle: 'trigger' },
      ],
      viewport: { x: 0, y: 0, zoom: 0.9 },
    },
  },

  // ─── Geofence Alert ───────────────────────────────────────────
  {
    id: 'geofence-alert',
    name: 'Geofence Alert',
    description: 'Warn when altitude exceeds a safety limit.',
    category: 'Safety',
    graph: {
      version: 1,
      name: 'Geofence Alert',
      description: 'Warn when altitude exceeds a safety limit',
      runIntervalMs: 500,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      nodes: [
        // ── Annotations ──
        {
          id: 'comment_input',
          type: 'flow-comment',
          position: { x: 40, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 1',
            category: 'flow',
            propertyValues: { text: 'Read current barometric altitude' },
          },
        },
        {
          id: 'comment_logic',
          type: 'flow-comment',
          position: { x: 380, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 2',
            category: 'flow',
            propertyValues: { text: 'Has vehicle exceeded the altitude fence?' },
          },
        },
        {
          id: 'comment_action',
          type: 'flow-comment',
          position: { x: 720, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 3',
            category: 'flow',
            propertyValues: { text: 'Alert GCS with urgent warning' },
          },
        },
        // ── Data flow ──
        {
          id: 'sensor',
          type: 'sensor-baro-alt',
          position: { x: 60, y: 110 },
          data: {
            definitionType: 'sensor-baro-alt',
            label: 'Baro Altitude',
            category: 'sensors',
            propertyValues: {},
          },
        },
        {
          id: 'compare',
          type: 'logic-compare',
          position: { x: 400, y: 110 },
          data: {
            definitionType: 'logic-compare',
            label: 'Alt > 120m?',
            category: 'logic',
            propertyValues: { operator: '>' },
          },
        },
        {
          id: 'max_alt',
          type: 'var-constant',
          position: { x: 200, y: 280 },
          data: {
            definitionType: 'var-constant',
            label: 'Max Altitude (m)',
            category: 'variables',
            propertyValues: { type: 'number', value: '120' },
          },
        },
        {
          id: 'alert',
          type: 'action-gcs-text',
          position: { x: 740, y: 120 },
          data: {
            definitionType: 'action-gcs-text',
            label: 'Altitude Warning',
            category: 'actions',
            propertyValues: { message: 'ALTITUDE LIMIT EXCEEDED!', severity: 4 },
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'sensor', target: 'compare', sourceHandle: 'alt_m', targetHandle: 'a' },
        { id: 'e2', source: 'max_alt', target: 'compare', sourceHandle: 'value', targetHandle: 'b' },
        { id: 'e3', source: 'compare', target: 'alert', sourceHandle: 'result', targetHandle: 'trigger' },
      ],
      viewport: { x: 0, y: 0, zoom: 0.9 },
    },
  },

  // ─── Mode Announcement ────────────────────────────────────────
  {
    id: 'mode-announcement',
    name: 'Mode Announcement',
    description: 'Send a GCS message whenever the RC mode channel changes.',
    category: 'Utility',
    graph: {
      version: 1,
      name: 'Mode Announcement',
      description: 'Send a GCS message whenever the RC mode channel changes',
      runIntervalMs: 200,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      nodes: [
        // ── Annotations ──
        {
          id: 'comment_input',
          type: 'flow-comment',
          position: { x: 40, y: 30 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 1',
            category: 'flow',
            propertyValues: { text: 'Read the RC mode switch (channel 5)' },
          },
        },
        {
          id: 'comment_detect',
          type: 'flow-comment',
          position: { x: 380, y: 30 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 2',
            category: 'flow',
            propertyValues: { text: 'Only fire when the value actually changes' },
          },
        },
        {
          id: 'comment_action',
          type: 'flow-comment',
          position: { x: 700, y: 30 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 3',
            category: 'flow',
            propertyValues: { text: 'Notify pilot of the switch change' },
          },
        },
        // ── Data flow ──
        {
          id: 'rc_input',
          type: 'sensor-rc-channel',
          position: { x: 60, y: 120 },
          data: {
            definitionType: 'sensor-rc-channel',
            label: 'Mode Switch (CH5)',
            category: 'sensors',
            propertyValues: { channel: 5 },
          },
        },
        {
          id: 'on_change',
          type: 'timing-on-change',
          position: { x: 400, y: 125 },
          data: {
            definitionType: 'timing-on-change',
            label: 'Detect Change',
            category: 'timing',
            propertyValues: {},
          },
        },
        {
          id: 'announce',
          type: 'action-gcs-text',
          position: { x: 720, y: 125 },
          data: {
            definitionType: 'action-gcs-text',
            label: 'Mode Changed',
            category: 'actions',
            propertyValues: { message: 'Flight mode switch changed', severity: 6 },
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'rc_input', target: 'on_change', sourceHandle: 'value_us', targetHandle: 'value' },
        { id: 'e2', source: 'on_change', target: 'announce', sourceHandle: 'changed', targetHandle: 'trigger' },
      ],
      viewport: { x: 0, y: 0, zoom: 0.9 },
    },
  },

  // ─── Landing Gear ─────────────────────────────────────────────
  {
    id: 'landing-gear',
    name: 'Landing Gear',
    description: 'Auto retract/deploy landing gear based on altitude threshold.',
    category: 'Automation',
    graph: {
      version: 1,
      name: 'Landing Gear',
      description: 'Auto retract/deploy landing gear based on altitude',
      runIntervalMs: 500,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      nodes: [
        // ── Annotations ──
        {
          id: 'comment_sense',
          type: 'flow-comment',
          position: { x: 30, y: 10 },
          data: {
            definitionType: 'flow-comment',
            label: 'Sense',
            category: 'flow',
            propertyValues: { text: 'Read current altitude above ground' },
          },
        },
        {
          id: 'comment_decide',
          type: 'flow-comment',
          position: { x: 370, y: 10 },
          data: {
            definitionType: 'flow-comment',
            label: 'Decide',
            category: 'flow',
            propertyValues: { text: 'Above gear-change altitude?' },
          },
        },
        {
          id: 'comment_branch',
          type: 'flow-comment',
          position: { x: 660, y: 10 },
          data: {
            definitionType: 'flow-comment',
            label: 'Branch',
            category: 'flow',
            propertyValues: { text: 'Take different action based on result' },
          },
        },
        // ── Sensor column ──
        {
          id: 'altitude',
          type: 'sensor-baro-alt',
          position: { x: 50, y: 100 },
          data: {
            definitionType: 'sensor-baro-alt',
            label: 'Altitude',
            category: 'sensors',
            propertyValues: {},
          },
        },
        {
          id: 'gear_alt',
          type: 'var-constant',
          position: { x: 50, y: 260 },
          data: {
            definitionType: 'var-constant',
            label: 'Gear Alt (m)',
            category: 'variables',
            propertyValues: { type: 'number', value: '10' },
          },
        },
        // ── Logic column ──
        {
          id: 'compare',
          type: 'logic-compare',
          position: { x: 380, y: 100 },
          data: {
            definitionType: 'logic-compare',
            label: 'Above 10m?',
            category: 'logic',
            propertyValues: { operator: '>' },
          },
        },
        {
          id: 'branch',
          type: 'logic-if-else',
          position: { x: 680, y: 110 },
          data: {
            definitionType: 'logic-if-else',
            label: 'Branch',
            category: 'logic',
            propertyValues: {},
          },
        },
        // ── TRUE path (retract — top) ──
        {
          id: 'retract_pwm',
          type: 'var-constant',
          position: { x: 900, y: 30 },
          data: {
            definitionType: 'var-constant',
            label: 'Retracted PWM',
            category: 'variables',
            propertyValues: { type: 'number', value: '1100' },
          },
        },
        {
          id: 'retract',
          type: 'action-set-servo',
          position: { x: 1000, y: 100 },
          data: {
            definitionType: 'action-set-servo',
            label: 'Retract Gear',
            category: 'actions',
            propertyValues: { servo_num: 9 },
          },
        },
        // ── FALSE path (deploy — bottom) ──
        {
          id: 'deploy_pwm',
          type: 'var-constant',
          position: { x: 900, y: 260 },
          data: {
            definitionType: 'var-constant',
            label: 'Deployed PWM',
            category: 'variables',
            propertyValues: { type: 'number', value: '1900' },
          },
        },
        {
          id: 'deploy',
          type: 'action-set-servo',
          position: { x: 1000, y: 330 },
          data: {
            definitionType: 'action-set-servo',
            label: 'Deploy Gear',
            category: 'actions',
            propertyValues: { servo_num: 9 },
          },
        },
      ],
      edges: [
        // Sensor → Compare
        { id: 'e1', source: 'altitude', target: 'compare', sourceHandle: 'alt_m', targetHandle: 'a' },
        { id: 'e2', source: 'gear_alt', target: 'compare', sourceHandle: 'value', targetHandle: 'b' },
        // Compare → Branch
        { id: 'e3', source: 'compare', target: 'branch', sourceHandle: 'result', targetHandle: 'condition' },
        // TRUE → Retract
        { id: 'e4', source: 'branch', target: 'retract', sourceHandle: 'true_out', targetHandle: 'trigger' },
        { id: 'e5', source: 'retract_pwm', target: 'retract', sourceHandle: 'value', targetHandle: 'pwm' },
        // FALSE → Deploy
        { id: 'e6', source: 'branch', target: 'deploy', sourceHandle: 'false_out', targetHandle: 'trigger' },
        { id: 'e7', source: 'deploy_pwm', target: 'deploy', sourceHandle: 'value', targetHandle: 'pwm' },
      ],
      viewport: { x: 0, y: 0, zoom: 0.8 },
    },
  },

  // ─── Camera Trigger ───────────────────────────────────────────
  {
    id: 'camera-trigger',
    name: 'Camera Trigger',
    description: 'Trigger camera relay at a fixed time interval while the vehicle is moving.',
    category: 'Automation',
    graph: {
      version: 1,
      name: 'Camera Trigger',
      description: 'Trigger camera relay at time intervals while moving',
      runIntervalMs: 500,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      nodes: [
        // ── Annotations ──
        {
          id: 'comment_sense',
          type: 'flow-comment',
          position: { x: 40, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 1',
            category: 'flow',
            propertyValues: { text: 'Check if the vehicle is moving' },
          },
        },
        {
          id: 'comment_gate',
          type: 'flow-comment',
          position: { x: 380, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 2',
            category: 'flow',
            propertyValues: { text: 'Only trigger while speed > minimum' },
          },
        },
        {
          id: 'comment_timer',
          type: 'flow-comment',
          position: { x: 690, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 3',
            category: 'flow',
            propertyValues: { text: 'Rate-limit the shutter trigger' },
          },
        },
        {
          id: 'comment_fire',
          type: 'flow-comment',
          position: { x: 1000, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 4',
            category: 'flow',
            propertyValues: { text: 'Activate camera relay' },
          },
        },
        // ── Data flow ──
        {
          id: 'speed',
          type: 'sensor-groundspeed',
          position: { x: 60, y: 110 },
          data: {
            definitionType: 'sensor-groundspeed',
            label: 'Ground Speed',
            category: 'sensors',
            propertyValues: {},
          },
        },
        {
          id: 'min_speed',
          type: 'var-constant',
          position: { x: 160, y: 270 },
          data: {
            definitionType: 'var-constant',
            label: 'Min Speed (m/s)',
            category: 'variables',
            propertyValues: { type: 'number', value: '1' },
          },
        },
        {
          id: 'moving_check',
          type: 'logic-compare',
          position: { x: 400, y: 115 },
          data: {
            definitionType: 'logic-compare',
            label: 'Moving?',
            category: 'logic',
            propertyValues: { operator: '>' },
          },
        },
        {
          id: 'timer',
          type: 'timing-run-every',
          position: { x: 710, y: 120 },
          data: {
            definitionType: 'timing-run-every',
            label: 'Every 5 sec',
            category: 'timing',
            propertyValues: { interval_ms: 5000 },
          },
        },
        {
          id: 'shutter',
          type: 'action-relay',
          position: { x: 1020, y: 120 },
          data: {
            definitionType: 'action-relay',
            label: 'Camera Shutter',
            category: 'actions',
            propertyValues: { relay_num: 0, state: 1 },
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'speed', target: 'moving_check', sourceHandle: 'speed_ms', targetHandle: 'a' },
        { id: 'e2', source: 'min_speed', target: 'moving_check', sourceHandle: 'value', targetHandle: 'b' },
        { id: 'e3', source: 'moving_check', target: 'timer', sourceHandle: 'result', targetHandle: 'trigger' },
        { id: 'e4', source: 'timer', target: 'shutter', sourceHandle: 'flow', targetHandle: 'trigger' },
      ],
      viewport: { x: 0, y: 0, zoom: 0.8 },
    },
  },

  // ─── Terrain Follow ───────────────────────────────────────────
  {
    id: 'terrain-follow',
    name: 'Terrain Follow',
    description: 'Warn when rangefinder reading is outside the safe range for terrain following.',
    category: 'Navigation',
    graph: {
      version: 1,
      name: 'Terrain Follow',
      description: 'Monitor rangefinder for safe terrain-following altitude',
      runIntervalMs: 200,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      nodes: [
        // ── Annotations ──
        {
          id: 'comment_sense',
          type: 'flow-comment',
          position: { x: 40, y: 30 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 1',
            category: 'flow',
            propertyValues: { text: 'Read distance to ground from rangefinder' },
          },
        },
        {
          id: 'comment_check',
          type: 'flow-comment',
          position: { x: 370, y: 30 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 2',
            category: 'flow',
            propertyValues: { text: 'Is altitude within safe 3-50m range?' },
          },
        },
        {
          id: 'comment_invert',
          type: 'flow-comment',
          position: { x: 670, y: 30 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 3',
            category: 'flow',
            propertyValues: { text: 'Invert: trigger when OUT of range' },
          },
        },
        {
          id: 'comment_warn',
          type: 'flow-comment',
          position: { x: 940, y: 30 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 4',
            category: 'flow',
            propertyValues: { text: 'Send urgent terrain warning' },
          },
        },
        // ── Data flow ──
        {
          id: 'rangefinder',
          type: 'sensor-rangefinder',
          position: { x: 60, y: 120 },
          data: {
            definitionType: 'sensor-rangefinder',
            label: 'Rangefinder',
            category: 'sensors',
            propertyValues: { instance: 0 },
          },
        },
        {
          id: 'range_check',
          type: 'logic-range-check',
          position: { x: 390, y: 120 },
          data: {
            definitionType: 'logic-range-check',
            label: 'Safe Range?',
            category: 'logic',
            propertyValues: { min: 3, max: 50 },
          },
        },
        {
          id: 'invert',
          type: 'logic-not',
          position: { x: 690, y: 130 },
          data: {
            definitionType: 'logic-not',
            label: 'Out of Range?',
            category: 'logic',
            propertyValues: {},
          },
        },
        {
          id: 'warning',
          type: 'action-gcs-text',
          position: { x: 960, y: 130 },
          data: {
            definitionType: 'action-gcs-text',
            label: 'Terrain Warning',
            category: 'actions',
            propertyValues: { message: 'TERRAIN: Rangefinder out of safe range!', severity: 4 },
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'rangefinder', target: 'range_check', sourceHandle: 'distance_m', targetHandle: 'value' },
        { id: 'e2', source: 'range_check', target: 'invert', sourceHandle: 'in_range', targetHandle: 'input' },
        { id: 'e3', source: 'invert', target: 'warning', sourceHandle: 'result', targetHandle: 'trigger' },
      ],
      viewport: { x: 0, y: 0, zoom: 0.85 },
    },
  },

  // ─── Depth Logger ────────────────────────────────────────────
  {
    id: 'depth-logger',
    name: 'Depth Logger',
    description: 'Log rangefinder depth + GPS position to a CSV file, triggered by an RC aux switch.',
    category: 'Data Logging',
    graph: {
      version: 1,
      name: 'Depth Logger',
      description: 'Log rangefinder depth and GPS position to file on switch trigger',
      runIntervalMs: 200,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      nodes: [
        // ── Annotations ──
        {
          id: 'comment_trigger',
          type: 'flow-comment',
          position: { x: 40, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Trigger',
            category: 'flow',
            propertyValues: { text: 'Detect when the pilot flips the aux switch HIGH' },
          },
        },
        {
          id: 'comment_sensors',
          type: 'flow-comment',
          position: { x: 430, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Read Sensors',
            category: 'flow',
            propertyValues: { text: 'Grab depth from rangefinder and GPS position' },
          },
        },
        {
          id: 'comment_log',
          type: 'flow-comment',
          position: { x: 810, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Log & Notify',
            category: 'flow',
            propertyValues: { text: 'Write to file and notify pilot' },
          },
        },
        // ── Trigger chain ──
        {
          id: 'aux_switch',
          type: 'sensor-rc-aux-switch',
          position: { x: 60, y: 110 },
          data: {
            definitionType: 'sensor-rc-aux-switch',
            label: 'Depth Switch',
            category: 'sensors',
            propertyValues: { aux_fn: 300 },
          },
        },
        {
          id: 'edge_detect',
          type: 'timing-rising-edge',
          position: { x: 260, y: 120 },
          data: {
            definitionType: 'timing-rising-edge',
            label: 'Switch Flipped?',
            category: 'timing',
            propertyValues: {},
          },
        },
        // ── Sensor column ──
        {
          id: 'rangefinder',
          type: 'sensor-rangefinder-orient',
          position: { x: 450, y: 110 },
          data: {
            definitionType: 'sensor-rangefinder-orient',
            label: 'Depth Sensor',
            category: 'sensors',
            propertyValues: { orientation: 25 },
          },
        },
        {
          id: 'gps',
          type: 'sensor-gps',
          position: { x: 450, y: 230 },
          data: {
            definitionType: 'sensor-gps',
            label: 'GPS Position',
            category: 'sensors',
            propertyValues: {},
          },
        },
        // ── Log & Notify ──
        {
          id: 'file_log',
          type: 'action-log-to-file',
          position: { x: 830, y: 100 },
          data: {
            definitionType: 'action-log-to-file',
            label: 'Write CSV',
            category: 'actions',
            propertyValues: { filename: 'depth_log.csv', separator: ';' },
          },
        },
        {
          id: 'notify',
          type: 'action-gcs-text',
          position: { x: 830, y: 300 },
          data: {
            definitionType: 'action-gcs-text',
            label: 'Notify Pilot',
            category: 'actions',
            propertyValues: { message: 'Depth measurement logged', severity: 6 },
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'aux_switch', target: 'edge_detect', sourceHandle: 'is_high', targetHandle: 'input' },
        { id: 'e2', source: 'edge_detect', target: 'file_log', sourceHandle: 'triggered', targetHandle: 'trigger' },
        { id: 'e3', source: 'rangefinder', target: 'file_log', sourceHandle: 'distance_m', targetHandle: 'value1' },
        { id: 'e4', source: 'gps', target: 'file_log', sourceHandle: 'lat', targetHandle: 'value2' },
        { id: 'e5', source: 'gps', target: 'file_log', sourceHandle: 'lng', targetHandle: 'value3' },
        { id: 'e6', source: 'edge_detect', target: 'notify', sourceHandle: 'triggered', targetHandle: 'trigger' },
      ],
      viewport: { x: 0, y: 0, zoom: 0.85 },
    },
  },

  // ─── Auto RTL on Low Battery ─────────────────────────────────
  {
    id: 'auto-rtl-battery',
    name: 'Auto RTL on Low Battery',
    description: 'Automatically switch to RTL flight mode when battery drops below a critical threshold.',
    category: 'Safety',
    graph: {
      version: 1,
      name: 'Auto RTL on Low Battery',
      description: 'Switch to RTL when battery is critically low',
      runIntervalMs: 1000,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      nodes: [
        {
          id: 'comment_sense',
          type: 'flow-comment',
          position: { x: 40, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 1',
            category: 'flow',
            propertyValues: { text: 'Monitor battery remaining percentage' },
          },
        },
        {
          id: 'comment_decide',
          type: 'flow-comment',
          position: { x: 400, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 2',
            category: 'flow',
            propertyValues: { text: 'Is battery below critical level?' },
          },
        },
        {
          id: 'comment_act',
          type: 'flow-comment',
          position: { x: 740, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 3',
            category: 'flow',
            propertyValues: { text: 'Force return-to-launch and warn pilot' },
          },
        },
        {
          id: 'battery',
          type: 'sensor-battery',
          position: { x: 60, y: 100 },
          data: {
            definitionType: 'sensor-battery',
            label: 'Battery',
            category: 'sensors',
            propertyValues: { instance: 0 },
          },
        },
        {
          id: 'threshold',
          type: 'var-constant',
          position: { x: 200, y: 280 },
          data: {
            definitionType: 'var-constant',
            label: 'Critical % (20)',
            category: 'variables',
            propertyValues: { type: 'number', value: '20' },
          },
        },
        {
          id: 'compare',
          type: 'logic-compare',
          position: { x: 420, y: 110 },
          data: {
            definitionType: 'logic-compare',
            label: 'Below 20%?',
            category: 'logic',
            propertyValues: { operator: '<' },
          },
        },
        {
          id: 'debounce',
          type: 'timing-debounce',
          position: { x: 620, y: 115 },
          data: {
            definitionType: 'timing-debounce',
            label: 'Debounce 3s',
            category: 'timing',
            propertyValues: { delay_ms: 3000 },
          },
        },
        {
          id: 'set_rtl',
          type: 'action-set-mode',
          position: { x: 830, y: 100 },
          data: {
            definitionType: 'action-set-mode',
            label: 'Set RTL Mode',
            category: 'actions',
            propertyValues: { mode_num: 11 },
          },
        },
        {
          id: 'warn',
          type: 'action-gcs-text',
          position: { x: 830, y: 230 },
          data: {
            definitionType: 'action-gcs-text',
            label: 'Critical Warning',
            category: 'actions',
            propertyValues: { message: 'CRITICAL: Battery low, RTL activated!', severity: 2 },
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'battery', target: 'compare', sourceHandle: 'remaining_pct', targetHandle: 'a' },
        { id: 'e2', source: 'threshold', target: 'compare', sourceHandle: 'value', targetHandle: 'b' },
        { id: 'e3', source: 'compare', target: 'debounce', sourceHandle: 'result', targetHandle: 'input' },
        { id: 'e4', source: 'debounce', target: 'set_rtl', sourceHandle: 'output', targetHandle: 'trigger' },
        { id: 'e5', source: 'debounce', target: 'warn', sourceHandle: 'output', targetHandle: 'trigger' },
      ],
      viewport: { x: 0, y: 0, zoom: 0.85 },
    },
  },

  // ─── Payload Drop ────────────────────────────────────────────
  {
    id: 'payload-drop',
    name: 'Payload Drop',
    description: 'Release a servo-actuated payload when an RC aux switch is flipped to HIGH.',
    category: 'Automation',
    graph: {
      version: 1,
      name: 'Payload Drop',
      description: 'Servo-actuated payload release via RC aux switch',
      runIntervalMs: 200,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      nodes: [
        {
          id: 'comment_trigger',
          type: 'flow-comment',
          position: { x: 40, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Trigger',
            category: 'flow',
            propertyValues: { text: 'Pilot flips aux switch to release' },
          },
        },
        {
          id: 'comment_branch',
          type: 'flow-comment',
          position: { x: 400, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Branch',
            category: 'flow',
            propertyValues: { text: 'Switch HIGH = release, LOW = hold' },
          },
        },
        {
          id: 'comment_action',
          type: 'flow-comment',
          position: { x: 730, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Actuate',
            category: 'flow',
            propertyValues: { text: 'Move servo to release or hold position' },
          },
        },
        {
          id: 'aux_switch',
          type: 'sensor-rc-aux-switch',
          position: { x: 60, y: 110 },
          data: {
            definitionType: 'sensor-rc-aux-switch',
            label: 'Drop Switch',
            category: 'sensors',
            propertyValues: { aux_fn: 301 },
          },
        },
        {
          id: 'branch',
          type: 'logic-if-else',
          position: { x: 420, y: 120 },
          data: {
            definitionType: 'logic-if-else',
            label: 'Switch HIGH?',
            category: 'logic',
            propertyValues: {},
          },
        },
        // TRUE path — release
        {
          id: 'release_pwm',
          type: 'var-constant',
          position: { x: 600, y: 40 },
          data: {
            definitionType: 'var-constant',
            label: 'Release PWM',
            category: 'variables',
            propertyValues: { type: 'number', value: '1100' },
          },
        },
        {
          id: 'release_servo',
          type: 'action-set-servo',
          position: { x: 750, y: 100 },
          data: {
            definitionType: 'action-set-servo',
            label: 'Release Payload',
            category: 'actions',
            propertyValues: { servo_num: 10 },
          },
        },
        {
          id: 'release_msg',
          type: 'action-gcs-text',
          position: { x: 980, y: 105 },
          data: {
            definitionType: 'action-gcs-text',
            label: 'Drop Confirmed',
            category: 'actions',
            propertyValues: { message: 'PAYLOAD RELEASED', severity: 5 },
          },
        },
        // FALSE path — hold
        {
          id: 'hold_pwm',
          type: 'var-constant',
          position: { x: 600, y: 280 },
          data: {
            definitionType: 'var-constant',
            label: 'Hold PWM',
            category: 'variables',
            propertyValues: { type: 'number', value: '1900' },
          },
        },
        {
          id: 'hold_servo',
          type: 'action-set-servo',
          position: { x: 750, y: 310 },
          data: {
            definitionType: 'action-set-servo',
            label: 'Hold Payload',
            category: 'actions',
            propertyValues: { servo_num: 10 },
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'aux_switch', target: 'branch', sourceHandle: 'is_high', targetHandle: 'condition' },
        // TRUE → release
        { id: 'e2', source: 'branch', target: 'release_servo', sourceHandle: 'true_out', targetHandle: 'trigger' },
        { id: 'e3', source: 'release_pwm', target: 'release_servo', sourceHandle: 'value', targetHandle: 'pwm' },
        { id: 'e4', source: 'branch', target: 'release_msg', sourceHandle: 'true_out', targetHandle: 'trigger' },
        // FALSE → hold
        { id: 'e5', source: 'branch', target: 'hold_servo', sourceHandle: 'false_out', targetHandle: 'trigger' },
        { id: 'e6', source: 'hold_pwm', target: 'hold_servo', sourceHandle: 'value', targetHandle: 'pwm' },
      ],
      viewport: { x: 0, y: 0, zoom: 0.85 },
    },
  },

  // ─── Speed Limit Warning ─────────────────────────────────────
  {
    id: 'speed-limit-warning',
    name: 'Speed Limit Warning',
    description: 'Send periodic GCS warnings when ground speed exceeds a configurable limit.',
    category: 'Safety',
    graph: {
      version: 1,
      name: 'Speed Limit Warning',
      description: 'Warn pilot when ground speed exceeds limit',
      runIntervalMs: 500,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      nodes: [
        {
          id: 'comment_sense',
          type: 'flow-comment',
          position: { x: 40, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 1',
            category: 'flow',
            propertyValues: { text: 'Read current ground speed' },
          },
        },
        {
          id: 'comment_check',
          type: 'flow-comment',
          position: { x: 380, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 2',
            category: 'flow',
            propertyValues: { text: 'Compare against speed limit' },
          },
        },
        {
          id: 'comment_warn',
          type: 'flow-comment',
          position: { x: 700, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 3',
            category: 'flow',
            propertyValues: { text: 'Rate-limited warning to GCS' },
          },
        },
        {
          id: 'speed',
          type: 'sensor-groundspeed',
          position: { x: 60, y: 110 },
          data: {
            definitionType: 'sensor-groundspeed',
            label: 'Ground Speed',
            category: 'sensors',
            propertyValues: {},
          },
        },
        {
          id: 'limit',
          type: 'var-constant',
          position: { x: 160, y: 270 },
          data: {
            definitionType: 'var-constant',
            label: 'Speed Limit (m/s)',
            category: 'variables',
            propertyValues: { type: 'number', value: '25' },
          },
        },
        {
          id: 'compare',
          type: 'logic-compare',
          position: { x: 400, y: 115 },
          data: {
            definitionType: 'logic-compare',
            label: 'Over Limit?',
            category: 'logic',
            propertyValues: { operator: '>' },
          },
        },
        {
          id: 'rate_limit',
          type: 'timing-run-every',
          position: { x: 600, y: 120 },
          data: {
            definitionType: 'timing-run-every',
            label: 'Every 5s',
            category: 'timing',
            propertyValues: { interval_ms: 5000 },
          },
        },
        {
          id: 'warning',
          type: 'action-gcs-text',
          position: { x: 820, y: 120 },
          data: {
            definitionType: 'action-gcs-text',
            label: 'Speed Warning',
            category: 'actions',
            propertyValues: { message: 'WARNING: Speed limit exceeded!', severity: 4 },
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'speed', target: 'compare', sourceHandle: 'speed_ms', targetHandle: 'a' },
        { id: 'e2', source: 'limit', target: 'compare', sourceHandle: 'value', targetHandle: 'b' },
        { id: 'e3', source: 'compare', target: 'rate_limit', sourceHandle: 'result', targetHandle: 'trigger' },
        { id: 'e4', source: 'rate_limit', target: 'warning', sourceHandle: 'flow', targetHandle: 'trigger' },
      ],
      viewport: { x: 0, y: 0, zoom: 0.85 },
    },
  },

  // ─── Flight Data Logger ──────────────────────────────────────
  {
    id: 'flight-data-logger',
    name: 'Flight Data Logger',
    description: 'Periodically log GPS position, altitude, and speed to a CSV file on the SD card.',
    category: 'Data Logging',
    graph: {
      version: 1,
      name: 'Flight Data Logger',
      description: 'Periodic GPS + altitude + speed logging to CSV',
      runIntervalMs: 500,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      nodes: [
        {
          id: 'comment_timer',
          type: 'flow-comment',
          position: { x: 40, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Timing',
            category: 'flow',
            propertyValues: { text: 'Log a data point every 2 seconds' },
          },
        },
        {
          id: 'comment_data',
          type: 'flow-comment',
          position: { x: 370, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Data Sources',
            category: 'flow',
            propertyValues: { text: 'Read GPS, altitude, and speed' },
          },
        },
        {
          id: 'comment_log',
          type: 'flow-comment',
          position: { x: 740, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Storage',
            category: 'flow',
            propertyValues: { text: 'Append to CSV file on SD card' },
          },
        },
        {
          id: 'timer',
          type: 'timing-run-every',
          position: { x: 60, y: 120 },
          data: {
            definitionType: 'timing-run-every',
            label: 'Every 2s',
            category: 'timing',
            propertyValues: { interval_ms: 2000 },
          },
        },
        {
          id: 'gps',
          type: 'sensor-gps',
          position: { x: 390, y: 110 },
          data: {
            definitionType: 'sensor-gps',
            label: 'GPS Position',
            category: 'sensors',
            propertyValues: {},
          },
        },
        {
          id: 'speed',
          type: 'sensor-groundspeed',
          position: { x: 390, y: 260 },
          data: {
            definitionType: 'sensor-groundspeed',
            label: 'Ground Speed',
            category: 'sensors',
            propertyValues: {},
          },
        },
        {
          id: 'log_gps',
          type: 'action-log-to-file',
          position: { x: 760, y: 110 },
          data: {
            definitionType: 'action-log-to-file',
            label: 'Log Position',
            category: 'actions',
            propertyValues: { filename: 'flight_log.csv', separator: ',' },
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'timer', target: 'log_gps', sourceHandle: 'flow', targetHandle: 'trigger' },
        { id: 'e2', source: 'gps', target: 'log_gps', sourceHandle: 'lat', targetHandle: 'value1' },
        { id: 'e3', source: 'gps', target: 'log_gps', sourceHandle: 'lng', targetHandle: 'value2' },
        { id: 'e4', source: 'speed', target: 'log_gps', sourceHandle: 'speed_ms', targetHandle: 'value3' },
      ],
      viewport: { x: 0, y: 0, zoom: 0.85 },
    },
  },
];
