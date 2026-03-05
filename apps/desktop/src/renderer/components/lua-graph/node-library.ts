/**
 * Node library — defines every available node type for the Lua Graph Editor.
 */
import type { NodeDefinition } from './lua-graph-types';

// ── Sensors ─────────────────────────────────────────────────────

const sensorNodes: NodeDefinition[] = [
  {
    type: 'sensor-gps',
    label: 'GPS Position',
    description: 'Current GPS coordinates from the flight controller',
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'lat', label: 'Latitude', type: 'number', direction: 'output' },
      { id: 'lng', label: 'Longitude', type: 'number', direction: 'output' },
      { id: 'alt', label: 'Altitude (m)', type: 'number', direction: 'output' },
    ],
    properties: [],
    luaTemplate: 'gps:location(0)',
  },
  {
    type: 'sensor-baro-alt',
    label: 'Baro Altitude',
    description: 'Barometric altitude in meters',
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'alt_m', label: 'Altitude (m)', type: 'number', direction: 'output' },
    ],
    properties: [],
    luaTemplate: 'baro:get_altitude()',
  },
  {
    type: 'sensor-battery',
    label: 'Battery',
    description: 'Battery voltage, current, and remaining percentage',
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'voltage', label: 'Voltage', type: 'number', direction: 'output' },
      { id: 'current', label: 'Current (A)', type: 'number', direction: 'output' },
      { id: 'remaining_pct', label: 'Remaining %', type: 'number', direction: 'output' },
    ],
    properties: [
      { id: 'instance', label: 'Battery Instance', type: 'number', defaultValue: 0, min: 0, max: 3 },
    ],
    luaTemplate: 'battery',
  },
  {
    type: 'sensor-airspeed',
    label: 'Airspeed',
    description: 'Measured airspeed in m/s',
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'airspeed_ms', label: 'Airspeed (m/s)', type: 'number', direction: 'output' },
    ],
    properties: [],
    luaTemplate: 'ahrs:airspeed_estimate()',
  },
  {
    type: 'sensor-rc-channel',
    label: 'RC Channel',
    description: 'Read a specific RC channel value (1-16)',
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'value_us', label: 'Value (us)', type: 'number', direction: 'output' },
    ],
    properties: [
      { id: 'channel', label: 'Channel', type: 'channel', defaultValue: 1, min: 1, max: 16 },
    ],
    luaTemplate: 'rc:get_pwm(CH)',
  },
  {
    type: 'sensor-rangefinder',
    label: 'Rangefinder',
    description: 'Rangefinder distance in meters',
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'distance_m', label: 'Distance (m)', type: 'number', direction: 'output' },
    ],
    properties: [
      { id: 'instance', label: 'Instance', type: 'number', defaultValue: 0, min: 0, max: 3 },
    ],
    luaTemplate: 'rangefinder:distance_cm(INST) / 100.0',
  },
  {
    type: 'sensor-attitude',
    label: 'Attitude',
    description: 'Current vehicle attitude (roll, pitch, yaw) in degrees',
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'roll', label: 'Roll (deg)', type: 'number', direction: 'output' },
      { id: 'pitch', label: 'Pitch (deg)', type: 'number', direction: 'output' },
      { id: 'yaw', label: 'Yaw (deg)', type: 'number', direction: 'output' },
    ],
    properties: [],
    luaTemplate: 'ahrs:get_roll/pitch/yaw()',
  },
  {
    type: 'sensor-groundspeed',
    label: 'Ground Speed',
    description: 'GPS ground speed in m/s',
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'speed_ms', label: 'Speed (m/s)', type: 'number', direction: 'output' },
    ],
    properties: [],
    luaTemplate: 'ahrs:groundspeed_vector()',
  },
  {
    type: 'sensor-rc-aux-switch',
    label: 'RC Aux Switch',
    description: 'Read an RC aux switch position (Low / Mid / High)',
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'state', label: 'State (0-2)', type: 'number', direction: 'output' },
      { id: 'is_high', label: 'Is High', type: 'boolean', direction: 'output' },
      { id: 'is_mid', label: 'Is Mid', type: 'boolean', direction: 'output' },
    ],
    properties: [
      { id: 'aux_fn', label: 'Aux Function', type: 'number', defaultValue: 300, min: 0, max: 999 },
    ],
    luaTemplate: 'rc:get_aux_cached(FN)',
  },
  {
    type: 'sensor-rangefinder-orient',
    label: 'Rangefinder (Oriented)',
    description: 'Rangefinder distance with orientation (e.g. 25 = downward for boats)',
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'distance_m', label: 'Distance (m)', type: 'number', direction: 'output' },
    ],
    properties: [
      {
        id: 'orientation', label: 'Orientation', type: 'select', defaultValue: 25,
        options: [
          { label: '0 Forward', value: 0 },
          { label: '25 Down', value: 25 },
          { label: '24 Up', value: 24 },
        ],
      },
    ],
    luaTemplate: 'rangefinder:distance_cm_orient(ORIENT) / 100.0',
  },
];

// ── Logic ───────────────────────────────────────────────────────

const logicNodes: NodeDefinition[] = [
  {
    type: 'logic-compare',
    label: 'Compare',
    description: 'Compare two numbers with a selected operator',
    category: 'logic',
    inputs: [
      { id: 'a', label: 'A', type: 'number', direction: 'input', defaultValue: 0 },
      { id: 'b', label: 'B', type: 'number', direction: 'input', defaultValue: 0 },
    ],
    outputs: [
      { id: 'result', label: 'Result', type: 'boolean', direction: 'output' },
    ],
    properties: [
      {
        id: 'operator', label: 'Operator', type: 'select', defaultValue: '>',
        options: [
          { label: '> Greater than', value: '>' },
          { label: '< Less than', value: '<' },
          { label: '== Equal to', value: '==' },
          { label: '!= Not equal to', value: '~=' },
          { label: '>= Greater or equal', value: '>=' },
          { label: '<= Less or equal', value: '<=' },
        ],
      },
    ],
  },
  {
    type: 'logic-if-else',
    label: 'If / Else',
    description: 'Branch execution based on a boolean condition',
    category: 'logic',
    inputs: [
      { id: 'condition', label: 'Condition', type: 'boolean', direction: 'input' },
    ],
    outputs: [
      { id: 'true_out', label: 'True', type: 'boolean', direction: 'output' },
      { id: 'false_out', label: 'False', type: 'boolean', direction: 'output' },
    ],
    properties: [],
  },
  {
    type: 'logic-and',
    label: 'AND',
    description: 'Logical AND — true only if both inputs are true',
    category: 'logic',
    inputs: [
      { id: 'a', label: 'A', type: 'boolean', direction: 'input' },
      { id: 'b', label: 'B', type: 'boolean', direction: 'input' },
    ],
    outputs: [
      { id: 'result', label: 'Result', type: 'boolean', direction: 'output' },
    ],
    properties: [],
  },
  {
    type: 'logic-or',
    label: 'OR',
    description: 'Logical OR — true if either input is true',
    category: 'logic',
    inputs: [
      { id: 'a', label: 'A', type: 'boolean', direction: 'input' },
      { id: 'b', label: 'B', type: 'boolean', direction: 'input' },
    ],
    outputs: [
      { id: 'result', label: 'Result', type: 'boolean', direction: 'output' },
    ],
    properties: [],
  },
  {
    type: 'logic-not',
    label: 'NOT',
    description: 'Invert a boolean value',
    category: 'logic',
    inputs: [
      { id: 'input', label: 'Input', type: 'boolean', direction: 'input' },
    ],
    outputs: [
      { id: 'result', label: 'Result', type: 'boolean', direction: 'output' },
    ],
    properties: [],
  },
  {
    type: 'logic-range-check',
    label: 'Range Check',
    description: 'Check if a value is within a min/max range',
    category: 'logic',
    inputs: [
      { id: 'value', label: 'Value', type: 'number', direction: 'input' },
    ],
    outputs: [
      { id: 'in_range', label: 'In Range', type: 'boolean', direction: 'output' },
    ],
    properties: [
      { id: 'min', label: 'Min', type: 'number', defaultValue: 0 },
      { id: 'max', label: 'Max', type: 'number', defaultValue: 100 },
    ],
  },
  {
    type: 'logic-switch',
    label: 'Switch',
    description: 'Multi-branch based on a numeric value',
    category: 'logic',
    inputs: [
      { id: 'value', label: 'Value', type: 'number', direction: 'input' },
    ],
    outputs: [
      { id: 'case_0', label: 'Case 0', type: 'boolean', direction: 'output' },
      { id: 'case_1', label: 'Case 1', type: 'boolean', direction: 'output' },
      { id: 'case_2', label: 'Case 2', type: 'boolean', direction: 'output' },
      { id: 'default', label: 'Default', type: 'boolean', direction: 'output' },
    ],
    properties: [
      { id: 'case0_val', label: 'Case 0 Value', type: 'number', defaultValue: 0 },
      { id: 'case1_val', label: 'Case 1 Value', type: 'number', defaultValue: 1 },
      { id: 'case2_val', label: 'Case 2 Value', type: 'number', defaultValue: 2 },
    ],
  },
];

// ── Math ────────────────────────────────────────────────────────

const mathNodes: NodeDefinition[] = [
  {
    type: 'math-add',
    label: 'Add',
    description: 'Add two numbers (A + B)',
    category: 'math',
    inputs: [
      { id: 'a', label: 'A', type: 'number', direction: 'input', defaultValue: 0 },
      { id: 'b', label: 'B', type: 'number', direction: 'input', defaultValue: 0 },
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'number', direction: 'output' }],
    properties: [],
  },
  {
    type: 'math-subtract',
    label: 'Subtract',
    description: 'Subtract two numbers (A - B)',
    category: 'math',
    inputs: [
      { id: 'a', label: 'A', type: 'number', direction: 'input', defaultValue: 0 },
      { id: 'b', label: 'B', type: 'number', direction: 'input', defaultValue: 0 },
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'number', direction: 'output' }],
    properties: [],
  },
  {
    type: 'math-multiply',
    label: 'Multiply',
    description: 'Multiply two numbers (A * B)',
    category: 'math',
    inputs: [
      { id: 'a', label: 'A', type: 'number', direction: 'input', defaultValue: 0 },
      { id: 'b', label: 'B', type: 'number', direction: 'input', defaultValue: 0 },
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'number', direction: 'output' }],
    properties: [],
  },
  {
    type: 'math-divide',
    label: 'Divide',
    description: 'Divide two numbers (A / B) with zero-division protection',
    category: 'math',
    inputs: [
      { id: 'a', label: 'A', type: 'number', direction: 'input', defaultValue: 0 },
      { id: 'b', label: 'B', type: 'number', direction: 'input', defaultValue: 1 },
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'number', direction: 'output' }],
    properties: [],
  },
  {
    type: 'math-clamp',
    label: 'Clamp',
    description: 'Constrain a value to a min/max range',
    category: 'math',
    inputs: [
      { id: 'value', label: 'Value', type: 'number', direction: 'input', defaultValue: 0 },
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'number', direction: 'output' }],
    properties: [
      { id: 'min', label: 'Min', type: 'number', defaultValue: 0 },
      { id: 'max', label: 'Max', type: 'number', defaultValue: 100 },
    ],
  },
  {
    type: 'math-map-range',
    label: 'Map Range',
    description: 'Linear interpolation from one range to another',
    category: 'math',
    inputs: [
      { id: 'value', label: 'Value', type: 'number', direction: 'input', defaultValue: 0 },
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'number', direction: 'output' }],
    properties: [
      { id: 'in_min', label: 'Input Min', type: 'number', defaultValue: 0 },
      { id: 'in_max', label: 'Input Max', type: 'number', defaultValue: 100 },
      { id: 'out_min', label: 'Output Min', type: 'number', defaultValue: 0 },
      { id: 'out_max', label: 'Output Max', type: 'number', defaultValue: 1 },
    ],
  },
  {
    type: 'math-abs',
    label: 'Abs',
    description: 'Absolute value of a number',
    category: 'math',
    inputs: [
      { id: 'value', label: 'Value', type: 'number', direction: 'input', defaultValue: 0 },
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'number', direction: 'output' }],
    properties: [],
  },
  {
    type: 'math-min',
    label: 'Min',
    description: 'Minimum of two values',
    category: 'math',
    inputs: [
      { id: 'a', label: 'A', type: 'number', direction: 'input', defaultValue: 0 },
      { id: 'b', label: 'B', type: 'number', direction: 'input', defaultValue: 0 },
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'number', direction: 'output' }],
    properties: [],
  },
  {
    type: 'math-max',
    label: 'Max',
    description: 'Maximum of two values',
    category: 'math',
    inputs: [
      { id: 'a', label: 'A', type: 'number', direction: 'input', defaultValue: 0 },
      { id: 'b', label: 'B', type: 'number', direction: 'input', defaultValue: 0 },
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'number', direction: 'output' }],
    properties: [],
  },
];

// ── Actions ─────────────────────────────────────────────────────

const actionNodes: NodeDefinition[] = [
  {
    type: 'action-gcs-text',
    label: 'Send GCS Text',
    description: 'Display a message on the ground control station',
    category: 'actions',
    inputs: [
      { id: 'trigger', label: 'Trigger', type: 'boolean', direction: 'input' },
    ],
    outputs: [],
    properties: [
      { id: 'message', label: 'Message', type: 'string', defaultValue: 'Hello from Lua!' },
      {
        id: 'severity', label: 'Severity', type: 'select', defaultValue: 6,
        options: [
          { label: 'Emergency', value: 0 },
          { label: 'Alert', value: 1 },
          { label: 'Critical', value: 2 },
          { label: 'Error', value: 3 },
          { label: 'Warning', value: 4 },
          { label: 'Notice', value: 5 },
          { label: 'Info', value: 6 },
          { label: 'Debug', value: 7 },
        ],
      },
    ],
    luaTemplate: 'gcs:send_text(SEV, MSG)',
  },
  {
    type: 'action-set-servo',
    label: 'Set Servo',
    description: 'Set a servo output to a specific PWM value',
    category: 'actions',
    inputs: [
      { id: 'trigger', label: 'Trigger', type: 'boolean', direction: 'input' },
      { id: 'pwm', label: 'PWM', type: 'number', direction: 'input', defaultValue: 1500 },
    ],
    outputs: [],
    properties: [
      { id: 'servo_num', label: 'Servo Number', type: 'number', defaultValue: 1, min: 1, max: 16 },
    ],
    luaTemplate: 'SRV_Channels:set_output_pwm(CH, PWM)',
  },
  {
    type: 'action-set-mode',
    label: 'Set Flight Mode',
    description: 'Request a flight mode change',
    category: 'actions',
    inputs: [
      { id: 'trigger', label: 'Trigger', type: 'boolean', direction: 'input' },
    ],
    outputs: [],
    properties: [
      { id: 'mode_num', label: 'Mode Number', type: 'number', defaultValue: 0, min: 0, max: 30 },
    ],
    luaTemplate: 'vehicle:set_mode(MODE)',
  },
  {
    type: 'action-set-param',
    label: 'Set Parameter',
    description: 'Change a flight controller parameter value',
    category: 'actions',
    inputs: [
      { id: 'trigger', label: 'Trigger', type: 'boolean', direction: 'input' },
      { id: 'value', label: 'Value', type: 'number', direction: 'input', defaultValue: 0 },
    ],
    outputs: [],
    properties: [
      { id: 'param_name', label: 'Parameter Name', type: 'string', defaultValue: 'RC1_MIN' },
    ],
    luaTemplate: 'param:set(NAME, VAL)',
  },
  {
    type: 'action-relay',
    label: 'Trigger Relay',
    description: 'Toggle a relay on or off',
    category: 'actions',
    inputs: [
      { id: 'trigger', label: 'Trigger', type: 'boolean', direction: 'input' },
    ],
    outputs: [],
    properties: [
      { id: 'relay_num', label: 'Relay Number', type: 'number', defaultValue: 0, min: 0, max: 5 },
      {
        id: 'state', label: 'State', type: 'select', defaultValue: 1,
        options: [{ label: 'ON', value: 1 }, { label: 'OFF', value: 0 }],
      },
    ],
    luaTemplate: 'relay:on/off(NUM)',
  },
  {
    type: 'action-log-to-file',
    label: 'Log to File',
    description: 'Append a line of data to a CSV/text file on the SD card',
    category: 'actions',
    inputs: [
      { id: 'trigger', label: 'Trigger', type: 'boolean', direction: 'input' },
      { id: 'value1', label: 'Value 1', type: 'any', direction: 'input' },
      { id: 'value2', label: 'Value 2', type: 'any', direction: 'input' },
      { id: 'value3', label: 'Value 3', type: 'any', direction: 'input' },
    ],
    outputs: [],
    properties: [
      { id: 'filename', label: 'File Name', type: 'string', defaultValue: 'log.csv' },
      {
        id: 'separator', label: 'Separator', type: 'select', defaultValue: ',',
        options: [
          { label: 'Comma (CSV)', value: ',' },
          { label: 'Semicolon', value: ';' },
          { label: 'Tab', value: '\t' },
        ],
      },
    ],
    luaTemplate: 'io.open/write/close',
  },
  {
    type: 'action-set-led',
    label: 'Set LED',
    description: 'Control NeoPixel / ProfiLED colors',
    category: 'actions',
    inputs: [
      { id: 'trigger', label: 'Trigger', type: 'boolean', direction: 'input' },
      { id: 'r', label: 'Red', type: 'number', direction: 'input', defaultValue: 0 },
      { id: 'g', label: 'Green', type: 'number', direction: 'input', defaultValue: 0 },
      { id: 'b', label: 'Blue', type: 'number', direction: 'input', defaultValue: 0 },
    ],
    outputs: [],
    properties: [
      { id: 'instance', label: 'LED Instance', type: 'number', defaultValue: 0, min: 0, max: 15 },
    ],
    luaTemplate: 'serialLED:set_RGB(INST, LED, R, G, B)',
  },
];

// ── Timing ──────────────────────────────────────────────────────

const timingNodes: NodeDefinition[] = [
  {
    type: 'timing-run-every',
    label: 'Run Every',
    description: 'Execute downstream at a fixed interval (independent timer)',
    category: 'timing',
    inputs: [
      { id: 'trigger', label: 'Trigger', type: 'boolean', direction: 'input' },
    ],
    outputs: [
      { id: 'flow', label: 'Flow', type: 'boolean', direction: 'output' },
    ],
    properties: [
      { id: 'interval_ms', label: 'Interval (ms)', type: 'number', defaultValue: 5000, min: 100, max: 60000, step: 100 },
    ],
  },
  {
    type: 'timing-debounce',
    label: 'Debounce',
    description: 'Suppress rapid changes — only pass through after value is stable',
    category: 'timing',
    inputs: [
      { id: 'input', label: 'Input', type: 'boolean', direction: 'input' },
    ],
    outputs: [
      { id: 'output', label: 'Output', type: 'boolean', direction: 'output' },
    ],
    properties: [
      { id: 'delay_ms', label: 'Delay (ms)', type: 'number', defaultValue: 500, min: 50, max: 10000 },
    ],
  },
  {
    type: 'timing-on-change',
    label: 'On Change',
    description: 'Trigger when a value changes from its previous value',
    category: 'timing',
    inputs: [
      { id: 'value', label: 'Value', type: 'number', direction: 'input' },
    ],
    outputs: [
      { id: 'changed', label: 'Changed', type: 'boolean', direction: 'output' },
    ],
    properties: [],
  },
  {
    type: 'timing-rising-edge',
    label: 'Rising Edge',
    description: 'Fires once when input transitions from false to true',
    category: 'timing',
    inputs: [
      { id: 'input', label: 'Input', type: 'boolean', direction: 'input' },
    ],
    outputs: [
      { id: 'triggered', label: 'Triggered', type: 'boolean', direction: 'output' },
    ],
    properties: [],
  },
];

// ── Variables ───────────────────────────────────────────────────

const variableNodes: NodeDefinition[] = [
  {
    type: 'var-constant',
    label: 'Constant',
    description: 'A fixed value (number, string, or boolean)',
    category: 'variables',
    inputs: [],
    outputs: [
      { id: 'value', label: 'Value', type: 'any', direction: 'output' },
    ],
    properties: [
      {
        id: 'type', label: 'Type', type: 'select', defaultValue: 'number',
        options: [
          { label: 'Number', value: 'number' },
          { label: 'String', value: 'string' },
          { label: 'Boolean', value: 'boolean' },
        ],
      },
      { id: 'value', label: 'Value', type: 'string', defaultValue: '0' },
    ],
  },
  {
    type: 'var-get',
    label: 'Get Variable',
    description: 'Read a named variable',
    category: 'variables',
    inputs: [],
    outputs: [
      { id: 'value', label: 'Value', type: 'any', direction: 'output' },
    ],
    properties: [
      { id: 'name', label: 'Variable Name', type: 'string', defaultValue: 'myVar' },
    ],
  },
  {
    type: 'var-set',
    label: 'Set Variable',
    description: 'Write a named variable',
    category: 'variables',
    inputs: [
      { id: 'trigger', label: 'Trigger', type: 'boolean', direction: 'input' },
      { id: 'value', label: 'Value', type: 'any', direction: 'input' },
    ],
    outputs: [],
    properties: [
      { id: 'name', label: 'Variable Name', type: 'string', defaultValue: 'myVar' },
    ],
  },
];

// ── Flow ────────────────────────────────────────────────────────

const flowNodes: NodeDefinition[] = [
  {
    type: 'flow-comment',
    label: 'Comment',
    description: 'A text comment for documentation purposes — no effect on code',
    category: 'flow',
    inputs: [],
    outputs: [],
    properties: [
      { id: 'text', label: 'Comment', type: 'string', defaultValue: 'Add a description here...' },
    ],
  },
];

// ── Registry ────────────────────────────────────────────────────

export const NODE_LIBRARY: NodeDefinition[] = [
  ...sensorNodes,
  ...logicNodes,
  ...mathNodes,
  ...actionNodes,
  ...timingNodes,
  ...variableNodes,
  ...flowNodes,
];

/** Lookup map: type → definition */
const definitionMap = new Map<string, NodeDefinition>();
for (const def of NODE_LIBRARY) {
  definitionMap.set(def.type, def);
}

export function getNodeDefinition(type: string): NodeDefinition | undefined {
  return definitionMap.get(type);
}

/** Get all nodes in a given category */
export function getNodesByCategory(category: string): NodeDefinition[] {
  return NODE_LIBRARY.filter((n) => n.category === category);
}
