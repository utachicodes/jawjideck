/**
 * Lua Compiler — converts a node graph into ArduPilot-compatible Lua script.
 *
 * Pipeline: Graph → Topological Sort → Variable Assignment → Code Generation
 */
import type { Node, Edge } from '@xyflow/react';
import type { GraphNodeData, GraphEdgeData } from './lua-graph-types';
import { getNodeDefinition } from './node-library';

// ── Types ───────────────────────────────────────────────────────

interface CompileContext {
  /** Map node+port → Lua variable name */
  varMap: Map<string, string>;
  /** Lines of code emitted so far */
  lines: string[];
  /** Indentation level */
  indent: number;
  /** Variables that need state tracking between runs */
  stateVars: Map<string, string>;
  /** Named user variables (Get/Set Variable nodes) */
  userVars: Set<string>;
  /** Timing entry interval */
  entryInterval: number;
  /** Counter for generating unique variable names */
  varCounter: number;
}

export interface CompileResult {
  success: boolean;
  code: string;
  errors: string[];
  nodeCount: number;
  estimatedMemoryBytes: number;
}

// ── Helpers ─────────────────────────────────────────────────────

function varKey(nodeId: string, portId: string): string {
  return `${nodeId}::${portId}`;
}

function sanitizeVarName(s: string): string {
  return s.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&');
}

function emit(ctx: CompileContext, line: string) {
  const pad = '  '.repeat(ctx.indent);
  ctx.lines.push(pad + line);
}

function emitBlank(ctx: CompileContext) {
  ctx.lines.push('');
}

function nextVar(ctx: CompileContext, hint: string): string {
  ctx.varCounter += 1;
  return `${sanitizeVarName(hint)}_${ctx.varCounter}`;
}

// ── Topological Sort ────────────────────────────────────────────

function topoSort(
  nodes: Node<GraphNodeData>[],
  edges: Edge<GraphEdgeData>[],
): { sorted: Node<GraphNodeData>[]; errors: string[] } {
  const errors: string[] = [];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Build adjacency: for each node, which nodes feed into it
  const inDegree = new Map<string, number>();
  const downstream = new Map<string, string[]>(); // source → targets
  for (const n of nodes) {
    inDegree.set(n.id, 0);
    downstream.set(n.id, []);
  }

  for (const e of edges) {
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
    downstream.get(e.source)?.push(e.target);
  }

  // Kahn's algorithm
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted: Node<GraphNodeData>[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = nodeMap.get(id);
    if (node) sorted.push(node);
    for (const targetId of downstream.get(id) ?? []) {
      const newDeg = (inDegree.get(targetId) ?? 1) - 1;
      inDegree.set(targetId, newDeg);
      if (newDeg === 0) queue.push(targetId);
    }
  }

  if (sorted.length !== nodes.length) {
    errors.push('Graph contains a cycle — cannot compile');
  }

  return { sorted, errors };
}

// ── Code Generation per Node ────────────────────────────────────

function resolveInput(
  ctx: CompileContext,
  nodeId: string,
  portId: string,
  edges: Edge<GraphEdgeData>[],
  defaultVal: string,
): string {
  // Find edge leading into this port
  const edge = edges.find((e) => e.target === nodeId && e.targetHandle === portId);
  if (edge) {
    const key = varKey(edge.source, edge.sourceHandle ?? '');
    return ctx.varMap.get(key) ?? defaultVal;
  }
  return defaultVal;
}

function compileNode(
  node: Node<GraphNodeData>,
  edges: Edge<GraphEdgeData>[],
  ctx: CompileContext,
) {
  const def = getNodeDefinition(node.data.definitionType);
  if (!def) return;

  const props = node.data.propertyValues;
  const type = node.data.definitionType;

  // Helper to get property or default
  const prop = (id: string): number | boolean | string => {
    const val = props[id];
    const propDef = def.properties.find((p) => p.id === id);
    return val ?? propDef?.defaultValue ?? 0;
  };

  // Helper to resolve an input or fall back to property/default
  const input = (portId: string, fallback: string): string => {
    return resolveInput(ctx, node.id, portId, edges, fallback);
  };

  // Assign output variables
  const setOutput = (portId: string, expr: string) => {
    const varName = nextVar(ctx, portId);
    ctx.varMap.set(varKey(node.id, portId), varName);
    emit(ctx, `local ${varName} = ${expr}`);
  };

  // ── Sensors ─────────────────────────────────────────────

  if (type === 'sensor-gps') {
    const locVar = nextVar(ctx, 'gps_loc');
    emit(ctx, `local ${locVar} = ahrs:get_location()`);
    const latVar = nextVar(ctx, 'lat');
    const lngVar = nextVar(ctx, 'lng');
    const altVar = nextVar(ctx, 'alt');
    emit(ctx, `local ${latVar} = ${locVar} and ${locVar}:lat() * 1.0e-7 or 0`);
    emit(ctx, `local ${lngVar} = ${locVar} and ${locVar}:lng() * 1.0e-7 or 0`);
    emit(ctx, `local ${altVar} = ${locVar} and ${locVar}:alt() * 0.01 or 0`);
    ctx.varMap.set(varKey(node.id, 'lat'), latVar);
    ctx.varMap.set(varKey(node.id, 'lng'), lngVar);
    ctx.varMap.set(varKey(node.id, 'alt'), altVar);
    return;
  }

  if (type === 'sensor-baro-alt') {
    setOutput('alt_m', 'baro:get_altitude()');
    return;
  }

  if (type === 'sensor-battery') {
    const inst = String(prop('instance'));
    setOutput('voltage', `battery:voltage(${inst})`);
    setOutput('current', `battery:current_amps(${inst})`);
    setOutput('remaining_pct', `battery:capacity_remaining_pct(${inst})`);
    return;
  }

  if (type === 'sensor-airspeed') {
    const v = nextVar(ctx, 'airspeed');
    emit(ctx, `local ${v} = ahrs:airspeed_estimate()`);
    emit(ctx, `${v} = ${v} or 0`);
    ctx.varMap.set(varKey(node.id, 'airspeed_ms'), v);
    return;
  }

  if (type === 'sensor-rc-channel') {
    const ch = String(prop('channel'));
    setOutput('value_us', `rc:get_pwm(${ch})`);
    return;
  }

  if (type === 'sensor-rangefinder') {
    const inst = String(prop('instance'));
    setOutput('distance_m', `rangefinder:distance_cm(${inst}) / 100.0`);
    return;
  }

  if (type === 'sensor-attitude') {
    setOutput('roll', 'math.deg(ahrs:get_roll())');
    setOutput('pitch', 'math.deg(ahrs:get_pitch())');
    setOutput('yaw', 'math.deg(ahrs:get_yaw())');
    return;
  }

  if (type === 'sensor-groundspeed') {
    const v = nextVar(ctx, 'gs_vec');
    emit(ctx, `local ${v} = ahrs:groundspeed_vector()`);
    setOutput('speed_ms', `${v} and ${v}:length() or 0`);
    return;
  }

  if (type === 'sensor-rc-aux-switch') {
    const fn = String(prop('aux_fn'));
    const stateVar = nextVar(ctx, 'aux_sw');
    emit(ctx, `local ${stateVar} = rc:get_aux_cached(${fn}) or 0`);
    ctx.varMap.set(varKey(node.id, 'state'), stateVar);
    ctx.varMap.set(varKey(node.id, 'is_high'), `(${stateVar} == 2)`);
    ctx.varMap.set(varKey(node.id, 'is_mid'), `(${stateVar} == 1)`);
    return;
  }

  if (type === 'sensor-rangefinder-orient') {
    const orient = String(prop('orientation'));
    const distVar = nextVar(ctx, 'rf_dist');
    emit(ctx, `local ${distVar} = rangefinder:distance_cm_orient(${orient})`);
    emit(ctx, `${distVar} = ${distVar} and (${distVar} / 100.0) or -1`);
    ctx.varMap.set(varKey(node.id, 'distance_m'), distVar);
    return;
  }

  // ── Logic ───────────────────────────────────────────────

  if (type === 'logic-compare') {
    const a = input('a', '0');
    const b = input('b', '0');
    let op = String(prop('operator'));
    // Lua uses ~= for not-equal
    if (op === '!=') op = '~=';
    setOutput('result', `(${a} ${op} ${b})`);
    return;
  }

  if (type === 'logic-if-else') {
    const cond = input('condition', 'false');
    setOutput('true_out', `(${cond} == true)`);
    setOutput('false_out', `(${cond} ~= true)`);
    return;
  }

  if (type === 'logic-and') {
    const a = input('a', 'false');
    const b = input('b', 'false');
    setOutput('result', `(${a} and ${b})`);
    return;
  }

  if (type === 'logic-or') {
    const a = input('a', 'false');
    const b = input('b', 'false');
    setOutput('result', `(${a} or ${b})`);
    return;
  }

  if (type === 'logic-not') {
    const v = input('input', 'false');
    setOutput('result', `(not ${v})`);
    return;
  }

  if (type === 'logic-range-check') {
    const v = input('value', '0');
    const min = String(prop('min'));
    const max = String(prop('max'));
    setOutput('in_range', `(${v} >= ${min} and ${v} <= ${max})`);
    return;
  }

  if (type === 'logic-switch') {
    const v = input('value', '0');
    const c0 = String(prop('case0_val'));
    const c1 = String(prop('case1_val'));
    const c2 = String(prop('case2_val'));
    setOutput('case_0', `(${v} == ${c0})`);
    setOutput('case_1', `(${v} == ${c1})`);
    setOutput('case_2', `(${v} == ${c2})`);
    setOutput('default', `(${v} ~= ${c0} and ${v} ~= ${c1} and ${v} ~= ${c2})`);
    return;
  }

  // ── Math ────────────────────────────────────────────────

  if (type === 'math-add') {
    setOutput('result', `(${input('a', '0')} + ${input('b', '0')})`);
    return;
  }
  if (type === 'math-subtract') {
    setOutput('result', `(${input('a', '0')} - ${input('b', '0')})`);
    return;
  }
  if (type === 'math-multiply') {
    setOutput('result', `(${input('a', '0')} * ${input('b', '0')})`);
    return;
  }
  if (type === 'math-divide') {
    const b = input('b', '1');
    setOutput('result', `(${b} ~= 0 and (${input('a', '0')} / ${b}) or 0)`);
    return;
  }
  if (type === 'math-clamp') {
    const v = input('value', '0');
    const min = String(prop('min'));
    const max = String(prop('max'));
    setOutput('result', `math.max(${min}, math.min(${max}, ${v}))`);
    return;
  }
  if (type === 'math-map-range') {
    const v = input('value', '0');
    const iMin = String(prop('in_min'));
    const iMax = String(prop('in_max'));
    const oMin = String(prop('out_min'));
    const oMax = String(prop('out_max'));
    setOutput(
      'result',
      `(${oMin} + (${v} - ${iMin}) * (${oMax} - ${oMin}) / (${iMax} - ${iMin}))`,
    );
    return;
  }
  if (type === 'math-abs') {
    setOutput('result', `math.abs(${input('value', '0')})`);
    return;
  }
  if (type === 'math-min') {
    setOutput('result', `math.min(${input('a', '0')}, ${input('b', '0')})`);
    return;
  }
  if (type === 'math-max') {
    setOutput('result', `math.max(${input('a', '0')}, ${input('b', '0')})`);
    return;
  }

  // ── Actions ─────────────────────────────────────────────

  if (type === 'action-gcs-text') {
    const trigger = input('trigger', 'true');
    const sev = String(prop('severity'));
    const msg = String(prop('message'));
    emit(ctx, `if ${trigger} then`);
    ctx.indent += 1;
    emit(ctx, `gcs:send_text(${sev}, "${msg.replace(/"/g, '\\"')}")`);
    ctx.indent -= 1;
    emit(ctx, 'end');
    return;
  }

  if (type === 'action-set-servo') {
    const trigger = input('trigger', 'true');
    const pwm = input('pwm', '1500');
    const servoNum = String(prop('servo_num'));
    emit(ctx, `if ${trigger} then`);
    ctx.indent += 1;
    emit(ctx, `SRV_Channels:set_output_pwm(${servoNum}, ${pwm})`);
    ctx.indent -= 1;
    emit(ctx, 'end');
    return;
  }

  if (type === 'action-set-mode') {
    const trigger = input('trigger', 'true');
    const mode = String(prop('mode_num'));
    emit(ctx, `if ${trigger} then`);
    ctx.indent += 1;
    emit(ctx, `vehicle:set_mode(${mode})`);
    ctx.indent -= 1;
    emit(ctx, 'end');
    return;
  }

  if (type === 'action-set-param') {
    const trigger = input('trigger', 'true');
    const val = input('value', '0');
    const name = String(prop('param_name'));
    emit(ctx, `if ${trigger} then`);
    ctx.indent += 1;
    emit(ctx, `param:set_and_save("${name}", ${val})`);
    ctx.indent -= 1;
    emit(ctx, 'end');
    return;
  }

  if (type === 'action-relay') {
    const trigger = input('trigger', 'true');
    const relayNum = String(prop('relay_num'));
    const state = String(prop('state'));
    emit(ctx, `if ${trigger} then`);
    ctx.indent += 1;
    emit(ctx, state === '1' ? `relay:on(${relayNum})` : `relay:off(${relayNum})`);
    ctx.indent -= 1;
    emit(ctx, 'end');
    return;
  }

  if (type === 'action-log-to-file') {
    const trigger = input('trigger', 'true');
    const v1 = input('value1', '""');
    const v2 = input('value2', '""');
    const v3 = input('value3', '""');
    const filename = String(prop('filename'));
    const sep = String(prop('separator'));
    const sepLua = sep === '\t' ? '\\t' : sep;
    emit(ctx, `if ${trigger} then`);
    ctx.indent += 1;
    emit(ctx, `local _f = io.open("${filename.replace(/"/g, '\\"')}", "a")`);
    emit(ctx, 'if _f then');
    ctx.indent += 1;
    emit(ctx, `_f:write(tostring(${v1}) .. "${sepLua}" .. tostring(${v2}) .. "${sepLua}" .. tostring(${v3}) .. "\\n")`);
    emit(ctx, '_f:close()');
    ctx.indent -= 1;
    emit(ctx, 'end');
    ctx.indent -= 1;
    emit(ctx, 'end');
    return;
  }

  if (type === 'action-set-led') {
    const trigger = input('trigger', 'true');
    const r = input('r', '0');
    const g = input('g', '0');
    const b = input('b', '0');
    const inst = String(prop('instance'));
    emit(ctx, `if ${trigger} then`);
    ctx.indent += 1;
    emit(ctx, `serialLED:set_RGB(${inst}, -1, ${r}, ${g}, ${b})`);
    emit(ctx, 'serialLED:send()');
    ctx.indent -= 1;
    emit(ctx, 'end');
    return;
  }

  // ── Timing ──────────────────────────────────────────────

  if (type === 'timing-run-every') {
    const timerVar = `_timer_${sanitizeVarName(node.id)}`;
    const intervalMs = Number(prop('interval_ms')) || 5000;
    ctx.stateVars.set(timerVar, '0');
    const trigger = input('trigger', 'true');
    emit(ctx, `${timerVar} = ${timerVar} + ${ctx.entryInterval}`);
    const shouldRun = nextVar(ctx, 'should_run');
    emit(ctx, `local ${shouldRun} = ${trigger} and ${timerVar} >= ${intervalMs}`);
    emit(ctx, `if ${shouldRun} then ${timerVar} = 0 end`);
    ctx.varMap.set(varKey(node.id, 'flow'), shouldRun);
    return;
  }

  if (type === 'timing-debounce') {
    const inp = input('input', 'false');
    const stableVar = `_debounce_${sanitizeVarName(node.id)}`;
    const counterVar = `_debounce_cnt_${sanitizeVarName(node.id)}`;
    const delayMs = Number(prop('delay_ms')) || 500;
    const ticks = Math.max(1, Math.round(delayMs / ctx.entryInterval));
    ctx.stateVars.set(stableVar, 'false');
    ctx.stateVars.set(counterVar, '0');
    emit(ctx, `if ${inp} then`);
    ctx.indent += 1;
    emit(ctx, `${counterVar} = ${counterVar} + 1`);
    ctx.indent -= 1;
    emit(ctx, 'else');
    ctx.indent += 1;
    emit(ctx, `${counterVar} = 0`);
    ctx.indent -= 1;
    emit(ctx, 'end');
    emit(ctx, `${stableVar} = ${counterVar} >= ${ticks}`);
    ctx.varMap.set(varKey(node.id, 'output'), stableVar);
    return;
  }

  if (type === 'timing-on-change') {
    const val = input('value', '0');
    const prevVar = `_prev_${sanitizeVarName(node.id)}`;
    ctx.stateVars.set(prevVar, 'nil');
    const changedVar = nextVar(ctx, 'changed');
    emit(ctx, `local ${changedVar} = (${prevVar} ~= nil and ${prevVar} ~= ${val})`);
    emit(ctx, `${prevVar} = ${val}`);
    ctx.varMap.set(varKey(node.id, 'changed'), changedVar);
    return;
  }

  if (type === 'timing-rising-edge') {
    const inp = input('input', 'false');
    const prevVar = `_edge_${sanitizeVarName(node.id)}`;
    ctx.stateVars.set(prevVar, 'false');
    const trigVar = nextVar(ctx, 'edge_trig');
    emit(ctx, `local ${trigVar} = (${inp} and not ${prevVar})`);
    emit(ctx, `${prevVar} = ${inp}`);
    ctx.varMap.set(varKey(node.id, 'triggered'), trigVar);
    return;
  }

  // ── Variables ───────────────────────────────────────────

  if (type === 'var-constant') {
    const valType = String(prop('type'));
    const rawVal = String(prop('value'));
    let luaVal = rawVal;
    if (valType === 'string') luaVal = `"${rawVal.replace(/"/g, '\\"')}"`;
    if (valType === 'boolean') luaVal = rawVal === 'true' ? 'true' : 'false';
    ctx.varMap.set(varKey(node.id, 'value'), luaVal);
    return;
  }

  if (type === 'var-get') {
    const name = sanitizeVarName(String(prop('name')));
    ctx.userVars.add(name);
    ctx.varMap.set(varKey(node.id, 'value'), name);
    return;
  }

  if (type === 'var-set') {
    const trigger = input('trigger', 'true');
    const val = input('value', '0');
    const name = sanitizeVarName(String(prop('name')));
    ctx.userVars.add(name);
    emit(ctx, `if ${trigger} then`);
    ctx.indent += 1;
    emit(ctx, `${name} = ${val}`);
    ctx.indent -= 1;
    emit(ctx, 'end');
    return;
  }

  // ── Flow (Comment nodes produce Lua comments) ───────────

  if (type === 'flow-comment') {
    const text = String(prop('text'));
    emit(ctx, `-- ${text}`);
    return;
  }
}

// ── Main Compiler ───────────────────────────────────────────────

export function compileGraph(
  nodes: Node<GraphNodeData>[],
  edges: Edge<GraphEdgeData>[],
  graphName: string,
  runIntervalMs = 1000,
): CompileResult {
  if (nodes.length === 0) {
    return { success: true, code: '-- Empty graph\n', errors: [], nodeCount: 0, estimatedMemoryBytes: 0 };
  }

  const { sorted, errors: sortErrors } = topoSort(nodes, edges);

  if (sortErrors.length > 0) {
    return { success: false, code: '', errors: sortErrors, nodeCount: nodes.length, estimatedMemoryBytes: 0 };
  }

  const ctx: CompileContext = {
    varMap: new Map(),
    lines: [],
    indent: 0,
    stateVars: new Map(),
    userVars: new Set(),
    entryInterval: runIntervalMs,
    varCounter: 0,
  };

  // Generate body code into a separate buffer
  const bodyCtx: CompileContext = { ...ctx, lines: [], indent: 1 };

  for (const node of sorted) {
    compileNode(node, edges, bodyCtx);
  }

  // Now assemble the full script
  const out: string[] = [];
  out.push(`-- ${graphName}`);
  out.push('-- Generated by ArduDeck Lua Graph Editor');
  out.push('');

  // State variables
  if (bodyCtx.stateVars.size > 0 || bodyCtx.userVars.size > 0) {
    for (const name of bodyCtx.userVars) {
      out.push(`local ${name} = nil`);
    }
    for (const [name, init] of bodyCtx.stateVars) {
      out.push(`local ${name} = ${init}`);
    }
    out.push('');
  }

  // update() function
  out.push('function update()');
  out.push(...bodyCtx.lines);
  out.push('');
  out.push(`  return update, ${ctx.entryInterval}`);
  out.push('end');
  out.push('');
  out.push('return update()');
  out.push('');

  const code = out.join('\n');
  const estimatedMemoryBytes = code.length * 2; // rough estimate

  return {
    success: true,
    code,
    errors: [],
    nodeCount: nodes.length,
    estimatedMemoryBytes,
  };
}
