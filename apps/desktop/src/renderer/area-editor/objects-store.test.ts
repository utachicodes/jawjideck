/**
 * Tests for objects-store.ts — the object-based Area Editor state.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { LatLng } from '../components/survey/survey-types';
import { useObjectsStore } from './objects-store';
import { makeRectangle, objectWorldRing } from './area-object';
import { distanceLatLng } from '../components/survey/geo-math';

const CENTER: LatLng = { lat: 42, lng: 19 };

function poly(n: number): LatLng[] {
  return Array.from({ length: n }, (_, i) => ({ lat: 42 + i * 0.001, lng: 19 + i * 0.001 }));
}

beforeEach(() => {
  useObjectsStore.setState({
    objects: [], selectedId: null, tool: 'select',
    draftPoints: [], draftType: null, selectedVertex: null,
    measurePoints: [], measureDone: false, selectedMeasure: false,
    corridorWidthM: 60, nameSeq: 0, contextMenu: null, past: [], future: [],
  });
});

describe('tool + draft', () => {
  it('selecting the polygon tool starts a draft', () => {
    useObjectsStore.getState().setTool('polygon');
    const s = useObjectsStore.getState();
    expect(s.tool).toBe('polygon');
    expect(s.draftType).toBe('polygon');
    expect(s.draftPoints).toEqual([]);
  });

  it('finishing a polygon draft (>=3 pts) creates and selects an object', () => {
    const st = useObjectsStore.getState();
    st.setTool('polygon');
    poly(4).forEach((p) => st.addDraftPoint(p));
    st.finishDraft();
    const s = useObjectsStore.getState();
    expect(s.objects).toHaveLength(1);
    expect(s.objects[0]!.type).toBe('polygon');
    expect(s.selectedId).toBe(s.objects[0]!.id);
    expect(s.tool).toBe('select');
    expect(s.draftType).toBeNull();
  });

  it('the hole tool cuts an inner ring into the selected area', () => {
    const st = useObjectsStore.getState();
    st.setTool('polygon');
    poly(4).forEach((p) => st.addDraftPoint(p));
    st.finishDraft();
    const areaId = useObjectsStore.getState().objects[0]!.id;

    st.setTool('hole');
    expect(useObjectsStore.getState().draftType).toBe('polygon');
    [{ lat: 42.0002, lng: 19.0002 }, { lat: 42.0008, lng: 19.0002 }, { lat: 42.0005, lng: 19.0008 }]
      .forEach((p) => st.addDraftPoint(p));
    st.finishHole();
    const s = useObjectsStore.getState();
    expect(s.objects).toHaveLength(1); // no new object created
    expect(s.objects[0]!.id).toBe(areaId);
    expect(s.objects[0]!.holes).toHaveLength(1);
    expect(s.objects[0]!.holes[0]!.length).toBe(3);
    expect(s.tool).toBe('select');
  });

  it('cutting a hole with no selection or <3 points is a no-op', () => {
    const st = useObjectsStore.getState();
    st.setTool('hole');
    [{ lat: 42.0002, lng: 19.0002 }, { lat: 42.0008, lng: 19.0002 }].forEach((p) => st.addDraftPoint(p));
    st.finishHole();
    expect(useObjectsStore.getState().objects).toHaveLength(0);
  });

  it('a corridor finishes at 2 points and carries the width', () => {
    const st = useObjectsStore.getState();
    st.setCorridorWidth(80);
    st.setTool('corridor');
    poly(2).forEach((p) => st.addDraftPoint(p));
    st.finishDraft();
    const obj = useObjectsStore.getState().objects[0]!;
    expect(obj.type).toBe('corridor');
    expect(obj.corridorWidthM).toBe(80);
  });

  it('an under-sized draft is discarded', () => {
    const st = useObjectsStore.getState();
    st.setTool('polygon');
    poly(2).forEach((p) => st.addDraftPoint(p));
    st.finishDraft();
    expect(useObjectsStore.getState().objects).toHaveLength(0);
  });

  it('switching tools cancels an in-progress draft', () => {
    const st = useObjectsStore.getState();
    st.setTool('polygon');
    poly(2).forEach((p) => st.addDraftPoint(p));
    st.setTool('select');
    expect(useObjectsStore.getState().draftPoints).toEqual([]);
    expect(useObjectsStore.getState().draftType).toBeNull();
  });
});

describe('addObject + transforms', () => {
  it('addObject pushes, selects, and returns to select tool', () => {
    const rect = makeRectangle(CENTER, 100, 100, 'R');
    useObjectsStore.getState().addObject(rect);
    const s = useObjectsStore.getState();
    expect(s.objects).toHaveLength(1);
    expect(s.selectedId).toBe(rect.id);
    expect(s.tool).toBe('select');
  });

  it('translateSelected moves the selected object', () => {
    const rect = makeRectangle(CENTER, 50, 50, 'R');
    const st = useObjectsStore.getState();
    st.addObject(rect);
    st.translateSelected(0.001, 0);
    expect(useObjectsStore.getState().objects[0]!.center.lat).toBeCloseTo(42.001);
  });

  it('rotateSelected accumulates rotation', () => {
    const rect = makeRectangle(CENTER, 50, 50, 'R');
    const st = useObjectsStore.getState();
    st.addObject(rect);
    st.rotateSelected(30);
    st.rotateSelected(15);
    expect(useObjectsStore.getState().objects[0]!.rotationDeg).toBeCloseTo(45);
  });

  it('scaleSelected resizes about the anchor', () => {
    const rect = makeRectangle(CENTER, 100, 100, 'R');
    const st = useObjectsStore.getState();
    st.addObject(rect);
    st.scaleSelected(2, 2, { x: -50, y: -50 });
    const ring = objectWorldRing(useObjectsStore.getState().objects[0]!);
    // far corner now ~200m diagonal-ish from anchor; just assert it grew
    const span = distanceLatLng(ring[0]!, ring[2]!);
    expect(span).toBeGreaterThan(200);
  });
});

describe('object list ops', () => {
  it('rename / toggleVisible / delete', () => {
    const r = makeRectangle(CENTER, 10, 10, 'R');
    const st = useObjectsStore.getState();
    st.addObject(r);
    st.renameObject(r.id, 'Field A');
    expect(useObjectsStore.getState().objects[0]!.name).toBe('Field A');
    st.toggleVisible(r.id);
    expect(useObjectsStore.getState().objects[0]!.visible).toBe(false);
    st.deleteObject(r.id);
    expect(useObjectsStore.getState().objects).toHaveLength(0);
    expect(useObjectsStore.getState().selectedId).toBeNull();
  });

  it('reorder swaps with the neighbor', () => {
    const a = makeRectangle(CENTER, 10, 10, 'A');
    const b = makeRectangle(CENTER, 10, 10, 'B');
    const st = useObjectsStore.getState();
    st.addObject(a);
    st.addObject(b);
    st.reorderObject(b.id, -1); // move B up
    expect(useObjectsStore.getState().objects[0]!.id).toBe(b.id);
  });

  it('splits an area the line crosses even with nothing selected', () => {
    const sq = makeRectangle(CENTER, 200, 200, 'Sq');
    const st = useObjectsStore.getState();
    st.addObject(sq);
    st.selectObject(null); // no selection
    st.splitSelectedByLine({ lat: 42.01, lng: 19 }, { lat: 41.99, lng: 19 });
    expect(useObjectsStore.getState().objects).toHaveLength(2);
  });

  it('convertSelectedToPolygon changes the type', () => {
    const r = makeRectangle(CENTER, 10, 10, 'R');
    const st = useObjectsStore.getState();
    st.addObject(r);
    st.convertSelectedToPolygon();
    expect(useObjectsStore.getState().objects[0]!.type).toBe('polygon');
  });
});

describe('vertex editing', () => {
  it('moves, inserts, and deletes vertices on the selected object', () => {
    const st = useObjectsStore.getState();
    st.setTool('polygon');
    poly(4).forEach((p) => st.addDraftPoint(p));
    st.finishDraft();
    const id = useObjectsStore.getState().selectedId!;
    const before = useObjectsStore.getState().objects[0]!.base.length;

    st.insertVertexAfter(0, { lat: 42.0005, lng: 19.0005 });
    expect(useObjectsStore.getState().objects[0]!.base.length).toBe(before + 1);

    st.deleteVertex(0);
    expect(useObjectsStore.getState().objects[0]!.base.length).toBe(before);

    // moving a vertex keeps the count, changes geometry
    const ringBefore = objectWorldRing(useObjectsStore.getState().objects[0]!);
    st.moveVertex(0, { lat: 42.01, lng: 19.01 });
    const ringAfter = objectWorldRing(useObjectsStore.getState().objects[0]!);
    expect(distanceLatLng(ringBefore[0]!, ringAfter[0]!)).toBeGreaterThan(1);
    expect(id).toBeTruthy();
  });

  it('will not delete below the minimum vertex count', () => {
    const st = useObjectsStore.getState();
    st.setTool('polygon');
    poly(3).forEach((p) => st.addDraftPoint(p));
    st.finishDraft();
    st.deleteVertex(0);
    expect(useObjectsStore.getState().objects[0]!.base.length).toBe(3);
  });
});

describe('measure + width', () => {
  it('only records measure points while the measure tool is active', () => {
    const st = useObjectsStore.getState();
    st.addMeasurePoint({ lat: 42, lng: 19 });
    expect(useObjectsStore.getState().measurePoints).toHaveLength(0);
    st.setTool('measure');
    st.addMeasurePoint({ lat: 42, lng: 19 });
    expect(useObjectsStore.getState().measurePoints).toHaveLength(1);
    st.clearMeasure();
    expect(useObjectsStore.getState().measurePoints).toHaveLength(0);
  });

  it('moveMeasurePoint relocates one point of the measurement', () => {
    const st = useObjectsStore.getState();
    st.setTool('measure');
    st.addMeasurePoint({ lat: 42, lng: 19 });
    st.addMeasurePoint({ lat: 42.001, lng: 19.001 });
    st.moveMeasurePoint(0, { lat: 42.5, lng: 19.5 });
    const pts = useObjectsStore.getState().measurePoints;
    expect(pts[0]).toEqual({ lat: 42.5, lng: 19.5 });
    expect(pts[1]).toEqual({ lat: 42.001, lng: 19.001 });
  });

  it('editMeasurement re-enters the measure tool to extend', () => {
    const st = useObjectsStore.getState();
    st.setTool('measure');
    st.addMeasurePoint({ lat: 42, lng: 19 });
    st.addMeasurePoint({ lat: 42.001, lng: 19.001 });
    st.endMeasure();
    st.setTool('select');
    st.selectMeasure();
    st.editMeasurement();
    const s = useObjectsStore.getState();
    expect(s.tool).toBe('measure');
    expect(s.measureDone).toBe(false);
    expect(s.measurePoints).toHaveLength(2); // existing points kept
  });

  it('setCorridorWidth clamps and updates a selected corridor', () => {
    const st = useObjectsStore.getState();
    st.setTool('corridor');
    poly(2).forEach((p) => st.addDraftPoint(p));
    st.finishDraft();
    st.setCorridorWidth(0);
    expect(useObjectsStore.getState().corridorWidthM).toBe(1);
    expect(useObjectsStore.getState().objects[0]!.corridorWidthM).toBe(1);
  });
});

describe('undo / redo', () => {
  it('undo reverts a delete and redo re-applies it', () => {
    const r = makeRectangle(CENTER, 10, 10, 'R');
    const st = useObjectsStore.getState();
    st.addObject(r);
    st.deleteObject(r.id);
    expect(useObjectsStore.getState().objects).toHaveLength(0);

    st.undo();
    expect(useObjectsStore.getState().objects).toHaveLength(1);
    expect(useObjectsStore.getState().objects[0]!.id).toBe(r.id);

    st.redo();
    expect(useObjectsStore.getState().objects).toHaveLength(0);
  });

  it('undo with empty history is a no-op', () => {
    useObjectsStore.getState().undo();
    expect(useObjectsStore.getState().objects).toHaveLength(0);
  });

  it('a new edit clears the redo stack', () => {
    const a = makeRectangle(CENTER, 10, 10, 'A');
    const b = makeRectangle(CENTER, 10, 10, 'B');
    const st = useObjectsStore.getState();
    st.addObject(a);
    st.undo(); // a removed, future has the add
    expect(useObjectsStore.getState().future.length).toBe(1);
    st.addObject(b); // a fresh edit
    expect(useObjectsStore.getState().future.length).toBe(0);
  });

  it('undo returns to the select tool (never stranded in a draw/cut tool)', () => {
    const r = makeRectangle(CENTER, 10, 10, 'R');
    const st = useObjectsStore.getState();
    st.addObject(r);
    st.setTool('hole'); // e.g. just picked "Cut hole" from the context menu
    st.undo();
    const s = useObjectsStore.getState();
    expect(s.tool).toBe('select');
    expect(s.draftType).toBeNull();
    expect(s.contextMenu).toBeNull();
  });

  it('rename is undoable', () => {
    const r = makeRectangle(CENTER, 10, 10, 'R');
    const st = useObjectsStore.getState();
    st.addObject(r);
    st.renameObject(r.id, 'Renamed');
    expect(useObjectsStore.getState().objects[0]!.name).toBe('Renamed');
    st.undo();
    expect(useObjectsStore.getState().objects[0]!.name).toBe('R');
  });
});

describe('duplicate', () => {
  it('clones the object under a new id, offsets it, and selects the copy', () => {
    const r = makeRectangle(CENTER, 40, 40, 'Field');
    const st = useObjectsStore.getState();
    st.addObject(r);
    st.duplicateObject(r.id);
    const s = useObjectsStore.getState();
    expect(s.objects).toHaveLength(2);
    const copy = s.objects[1]!;
    expect(copy.id).not.toBe(r.id);
    expect(copy.name).toBe('Field copy');
    expect(s.selectedId).toBe(copy.id);
    // offset, so the centers are not identical
    expect(copy.center.lat === r.center.lat && copy.center.lng === r.center.lng).toBe(false);
    // duplicate is undoable
    st.undo();
    expect(useObjectsStore.getState().objects).toHaveLength(1);
  });
});

describe('measure selection + context menu', () => {
  it('selectMeasure marks the ruler selected and clears object selection', () => {
    const r = makeRectangle(CENTER, 10, 10, 'R');
    const st = useObjectsStore.getState();
    st.addObject(r);
    st.selectMeasure();
    const s = useObjectsStore.getState();
    expect(s.selectedMeasure).toBe(true);
    expect(s.selectedId).toBeNull();
  });

  it('selecting an object clears the measure selection', () => {
    const r = makeRectangle(CENTER, 10, 10, 'R');
    const st = useObjectsStore.getState();
    st.addObject(r);
    st.selectMeasure();
    st.selectObject(r.id);
    expect(useObjectsStore.getState().selectedMeasure).toBe(false);
  });

  it('open/close context menu sets and clears the menu state', () => {
    const st = useObjectsStore.getState();
    st.openContextMenu({ x: 10, y: 20, target: { kind: 'empty' } });
    expect(useObjectsStore.getState().contextMenu).toEqual({ x: 10, y: 20, target: { kind: 'empty' } });
    st.closeContextMenu();
    expect(useObjectsStore.getState().contextMenu).toBeNull();
  });
});

describe('loadWorldRings + reset', () => {
  it('loads rings as objects and reset clears them', () => {
    const st = useObjectsStore.getState();
    st.loadWorldRings([{ ring: poly(4) }, { ring: poly(3), type: 'polygon' }]);
    expect(useObjectsStore.getState().objects).toHaveLength(2);
    st.reset();
    expect(useObjectsStore.getState().objects).toHaveLength(0);
    expect(useObjectsStore.getState().selectedId).toBeNull();
  });
});
