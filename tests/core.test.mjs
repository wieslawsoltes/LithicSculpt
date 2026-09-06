import test from 'node:test';
import assert from 'node:assert/strict';
import { Mesh, icosphere, rayTriangle } from '../src/mesh.js';
import { Camera, dot, sub, norm } from '../src/math.js';
import { brushSamples, deformCPU, falloff, Stroke, History } from '../src/sculpt.js';
import { subdivide, remesh } from '../src/topology.js';
import { SculptObject, createPrimitive } from '../src/model.js';
import { importOBJ, exportOBJ, importGLTF, exportGLTF, serializeProject, deserializeProject } from '../src/io.js';
const settings = { radius: .5, strength: .6, pressure: 1, sign: 1, symmetry: [false, false, false], frontOnly: true };
function samples(mesh, center = [0, 0, 1], extra = {}) { const hit = mesh.bvh.ray([center[0], center[1], 3], [0, 0, -1]); assert.ok(hit); return brushSamples(mesh, hit, { ...settings, ...extra }); }
function apply(m, data, mode) { const out = deformCPU(data.records, mode); for (let i = 0; i < data.ids.length; i++)
    m.v.set(out.subarray(i * 4, i * 4 + 4), data.ids[i] * 8); m.modified(data.ids); return out; }
function coords(m) { const out = []; for (let i = 0; i < m.count; i++)
    out.push(...m.v.subarray(i * 8, i * 8 + 4)); return new Float32Array(out); }
test('icosphere has compact manifold adjacency and outward unit normals', () => { const m = icosphere(3); assert.equal(m.count, 642); assert.equal(m.faces, 1280); assert.equal(m.diagnostics.boundaryEdges, 0); assert.equal(m.diagnostics.nonManifoldEdges, 0); for (let i = 0; i < m.count; i++) {
    assert.ok(Math.abs(Math.hypot(...m.normal(i)) - 1) < 1e-6);
    assert.ok(dot(m.normal(i), m.pos(i)) > .99);
    for (let k = m.neighborOffsets[i]; k < m.neighborOffsets[i + 1]; k++) {
        const j = m.neighbors[k];
        assert.ok(m.neighbors.subarray(m.neighborOffsets[j], m.neighborOffsets[j + 1]).includes(i));
    }
} });
test('input validation rejects non-finite positions and invalid indices', () => { assert.throws(() => new Mesh([NaN, 0, 0], [0, 0, 0]), /non-finite/); assert.throws(() => new Mesh([0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 3]), /range/); assert.throws(() => new Mesh([0, 0], [0, 0, 0]), /length/); });
test('BVH ray queries agree with brute-force triangle intersection', () => { const m = icosphere(2); for (let i = 0; i < 15; i++) {
    const o = [Math.sin(i) * 3, Math.cos(i * .7) * 2, 3], d = norm(o.map(v => -v));
    const hit = m.bvh.ray(o, d);
    let nearest = Infinity;
    for (let f = 0; f < m.faces; f++) {
        const a = m.indices.subarray(f * 3, f * 3 + 3);
        const h = rayTriangle(o, d, ...Array.from(a, i => m.pos(i)));
        if (h)
            nearest = Math.min(nearest, h.t);
    }
    assert.ok(Math.abs(hit.t - nearest) < 1e-7);
} });
test('spatial hash remains exact after localized vertex relocation', () => { const m = icosphere(2), ids = [0, 1, 2]; for (const i of ids)
    m.v[i * 8] += 2; m.modified(ids); for (const c of [[0, 0, 1], [2, 1, 0], [0, 0, 0]]) {
    const radius = .8, actual = m.hash.query(c, radius).sort((a, b) => a - b), expected = [];
    for (let i = 0; i < m.count; i++)
        if (Math.hypot(...sub(m.pos(i), c)) <= radius)
            expected.push(i);
    assert.deepEqual(actual, expected);
} });
test('draw, clay, smooth, inflate, pinch, flatten, grab and mask have distinct real effects', () => { for (let mode = 0; mode < 8; mode++) {
    const m = icosphere(3), s = samples(m);
    if (mode === 6)
        for (let i = 0; i < s.ids.length; i++)
            s.records.set([.2, .05, 0], i * 24 + 20);
    const out = deformCPU(s.records, mode);
    let delta = 0;
    for (let i = 0; i < s.ids.length; i++)
        for (let j = 0; j < 4; j++)
            delta += Math.abs(out[i * 4 + j] - m.v[s.ids[i] * 8 + j]);
    assert.ok(delta > 1e-6, `brush ${mode} did not deform`);
    assert.ok(out.every(Number.isFinite));
} });
test('fully masked positions are invariant under every geometric brush', () => { const m = icosphere(2); for (let i = 0; i < m.count; i++)
    m.v[i * 8 + 3] = 1; for (let mode = 0; mode < 7; mode++) {
    const s = samples(m), out = deformCPU(s.records, mode);
    for (let i = 0; i < s.ids.length; i++)
        assert.deepEqual(Array.from(out.subarray(i * 4, i * 4 + 3)), m.pos(s.ids[i]));
} });
test('zero pressure produces no displacement, and draw pressure is linear', () => { const m = icosphere(3), a = samples(m, [0, 0, 1], { pressure: 0 }), b = samples(m, [0, 0, 1], { pressure: .5 }), c = samples(m, [0, 0, 1], { pressure: 1 }), za = deformCPU(a.records, 0), hb = deformCPU(b.records, 0), fc = deformCPU(c.records, 0); for (let i = 0; i < a.ids.length; i++)
    for (let j = 0; j < 3; j++) {
        const p = m.v[a.ids[i] * 8 + j];
        assert.equal(za[i * 4 + j], p);
        assert.ok(Math.abs((hb[i * 4 + j] - p) * 2 - (fc[i * 4 + j] - p)) < 2e-7);
    } });
test('brush falloff has bounded monotonic support and fixed endpoints', () => { for (let kind = 0; kind < 3; kind++) {
    assert.equal(falloff(0, kind), 0);
    assert.equal(falloff(1, kind), 1);
    let last = 0;
    for (let i = 0; i <= 100; i++) {
        const y = falloff(i / 100, kind);
        assert.ok(y >= last && y <= 1);
        last = y;
    }
} });
test('symmetry unions shared vertices without double-applying the center seam', () => { const m = icosphere(3), a = samples(m), b = samples(m, [0, 0, 1], { symmetry: [true, false, false] }); assert.equal(new Set(b.ids).size, b.ids.length); assert.equal(a.ids.length, b.ids.length); const oa = deformCPU(a.records, 0), ob = deformCPU(b.records, 0), map = new Map(Array.from(a.ids, (id, i) => [id, oa.slice(i * 4, i * 4 + 4)])); for (let i = 0; i < b.ids.length; i++)
    assert.deepEqual(ob.slice(i * 4, i * 4 + 4), map.get(b.ids[i])); });
test('connected patch does not leak onto a nearby disconnected shell', () => { const a = icosphere(2), v = Array.from(a.v), idx = Array.from(a.indices); for (let i = 0; i < a.count; i++) {
    const p = Array.from(a.v.subarray(i * 8, i * 8 + 8));
    p[2] += .05;
    v.push(...p);
} for (const i of a.indices)
    idx.push(i + a.count); const m = new Mesh(v, idx, true); const s = samples(m); assert.ok(s.ids.every(i => i >= a.count)); });
test('sparse stroke undo/redo restores exact float32 positions and masks', () => { const o = new SculptObject('sphere', icosphere(3)), before = coords(o.mesh), s = new Stroke(o, 'Draw'), data = samples(o.mesh); s.capture(data.ids); apply(o.mesh, data, 0); const after = coords(o.mesh), command = s.finish(); assert.ok(command.bytes < o.mesh.v.byteLength); assert.notDeepEqual(before, after); command.apply(false); assert.deepEqual(coords(o.mesh), before); command.apply(true); assert.deepEqual(coords(o.mesh), after); });
test('Loop subdivision preserves topology and affine stencil sums', () => { const m = icosphere(2), r = subdivide(m); assert.equal(r.mesh.faces, m.faces * 4); assert.equal(r.mesh.count, 4 * m.count - 6); assert.equal(r.mesh.diagnostics.boundaryEdges, 0); for (let i = 0; i < r.mesh.count; i++) {
    let sum = 0;
    for (let j = r.transition.offsets[i]; j < r.transition.offsets[i + 1]; j++)
        sum += r.transition.weights[j];
    assert.ok(Math.abs(sum - 1) < 1e-6);
} });
test('coarse-level edits prolongate while retaining high-level detail, with exact undo', () => { const o = new SculptObject('sphere', icosphere(2)), r = subdivide(o.mesh); o.levels.push(r.mesh); o.transitions.push(r.transition); r.mesh.v[2] += .027; r.mesh.modified(); const highBefore = coords(r.mesh), lowBefore = coords(o.mesh); const s = new Stroke(o, 'low'), data = samples(o.mesh); s.capture(data.ids); apply(o.mesh, data, 0); const command = s.finish(), highAfter = coords(r.mesh); assert.notDeepEqual(highBefore, highAfter); command.apply(false); assert.deepEqual(coords(o.mesh), lowBefore); assert.deepEqual(coords(r.mesh), highBefore); command.apply(true); assert.deepEqual(coords(r.mesh), highAfter); });
test('history honors byte budget and invalidates redo on branching edits', () => { const h = new History(30); let value = 0; for (let i = 0; i < 3; i++)
    h.push({ label: 'x', bytes: 12, apply: f => value += f ? 1 : -1 }); assert.equal(h.past.length, 2); h.undo(); assert.equal(h.future.length, 1); h.push({ label: 'new', bytes: 12, apply() { } }); assert.equal(h.future.length, 0); assert.ok(h.bytes <= 30); h.undo(); h.redo(); assert.equal(h.past.length, 2); });
test('SDF remeshing creates a closed surface approximating the input sphere', () => { const m = icosphere(2), out = remesh(m, 16); assert.equal(out.diagnostics.nonManifoldEdges, 0); assert.equal(out.diagnostics.boundaryEdges, 0); assert.ok(out.count > m.count); let maxError = 0; for (let i = 0; i < out.count; i++)
    maxError = Math.max(maxError, Math.abs(Math.hypot(...out.pos(i)) - 1)); assert.ok(maxError < .05, `radial error ${maxError}`); });
test('open surfaces are rejected by closed-surface remeshing', () => { const m = new Mesh([0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]); assert.throws(() => remesh(m), /closed/); });
test('OBJ importer supports negative indices and concave polygon triangulation', () => { const o = importOBJ('o concave\nv 0 0 0\nv 2 0 0\nv 2 2 0\nv 1 1 0\nv 0 2 0\nf -5 -4 -3 -2 -1'); assert.equal(o[0].mesh.faces, 3); let area = 0; for (let i = 0; i < o[0].mesh.faces; i++)
    area += Math.hypot(...o[0].mesh.faceNormals.subarray(i * 3, i * 3 + 3)) * .5; assert.ok(Math.abs(area - 3) < 1e-7); });
test('OBJ geometry round-trip preserves vertex and face counts', () => { const o = createPrimitive('sphere'), out = importOBJ(exportOBJ(o)); assert.equal(out[0].mesh.count, o[0].mesh.count); assert.equal(out[0].mesh.faces, o[0].mesh.faces); });
test('embedded glTF and GLB round-trip exact geometry for multiple objects', async () => { const a = new SculptObject('A', icosphere(1)), b = new SculptObject('B', icosphere(2), 3); for (const binary of [false, true]) {
    const out = await importGLTF(exportGLTF([a, b], binary));
    assert.equal(out.length, 2);
    assert.deepEqual(coords(out[0].mesh), coords(a.mesh));
    assert.deepEqual(out[1].mesh.indices, b.mesh.indices);
    assert.deepEqual(out.map(o => o.name), ['A', 'B']);
} });
test('project round-trip preserves masks, IDs, levels, and stencils', () => { const o = new SculptObject('A', icosphere(2)), r = subdivide(o.mesh); o.mesh.v[3] = .75; o.levels.push(r.mesh); o.transitions.push(r.transition); o.level = 1; const p = serializeProject([o], new Camera(), { brush: 'clay' }, 'Test'), out = deserializeProject(JSON.parse(JSON.stringify(p))); assert.equal(out.objects[0].id, o.id); assert.equal(out.objects[0].level, 1); assert.equal(out.objects[0].levels[0].v[3], .75); assert.deepEqual(out.objects[0].transitions[0].ids, o.transitions[0].ids); assert.deepEqual(coords(out.objects[0].mesh), coords(o.mesh)); });
test('malformed project stencil references are rejected', () => { const o = new SculptObject('A', icosphere(1)), r = subdivide(o.mesh); o.levels.push(r.mesh); o.transitions.push(r.transition); const p = serializeProject([o], new Camera(), {}, 'Test'); p.objects[0].transitions = []; assert.throws(() => deserializeProject(p), /Incomplete/); });
test('torus primitive is manifold with outward-facing normals', () => { const m = createPrimitive('torus')[0].mesh; assert.equal(m.diagnostics.boundaryEdges, 0); for (let i = 0; i < m.count; i += 31) {
    const p = m.pos(i), r = Math.hypot(p[0], p[2]), tube = norm([p[0] * (1 - .72 / r), p[1], p[2] * (1 - .72 / r)]);
    assert.ok(dot(tube, m.normal(i)) > .95);
} });
