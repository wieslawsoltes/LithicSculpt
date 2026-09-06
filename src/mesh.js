import { clamp, sub, add, mul, dot, cross, norm } from './math.js';
let meshID = 0;
export class Mesh {
    constructor(positions, indices, packed = false) {
        this.uid = ++meshID;
        this.version = 0;
        this.topologyVersion = 0;
        if (positions.length % (packed ? 8 : 3) || indices.length % 3)
            throw Error('Mesh arrays have invalid lengths.');
        const n = positions.length / (packed ? 8 : 3);
        if (n > 1000000 || indices.length > 6000000)
            throw Error('Mesh exceeds the 1M vertex / 2M triangle safety limit.');
        this.v = new Float32Array(n * 8);
        if (packed)
            this.v.set(positions);
        else
            for (let i = 0; i < n; i++)
                this.v.set(positions.slice(i * 3, i * 3 + 3), i * 8);
        for (let i = 0; i < this.v.length; i++)
            if (!Number.isFinite(this.v[i]))
                throw Error('Mesh contains a non-finite value.');
        for (const i of indices)
            if (!Number.isInteger(i) || i < 0 || i >= n)
                throw Error('Mesh index is out of range.');
        this.indices = new Uint32Array(indices);
        this.buildAdjacency();
        this.updateNormals();
        this.bvh = new BVH(this);
        this.hash = new SpatialHash(this);
        this.dirty = null;
    }
    get count() { return this.v.length / 8; }
    get faces() { return this.indices.length / 3; }
    pos(i) { const k = i * 8; return [this.v[k], this.v[k + 1], this.v[k + 2]]; }
    normal(i) { const k = i * 8 + 4; return [this.v[k], this.v[k + 1], this.v[k + 2]]; }
    buildAdjacency() {
        const n = this.count, idx = this.indices, c = new Uint32Array(n), offset = new Uint32Array(n + 1);
        for (const i of idx)
            c[i]++;
        for (let i = 0; i < n; i++)
            offset[i + 1] = offset[i] + c[i];
        this.faceOffsets = offset;
        this.faceIDs = new Uint32Array(idx.length);
        c.fill(0);
        for (let f = 0; f < this.faces; f++)
            for (let j = 0; j < 3; j++) {
                const i = idx[f * 3 + j];
                this.faceIDs[offset[i] + c[i]++] = f;
            }
        const lists = [], seen = new Int32Array(n).fill(-1), no = new Uint32Array(n + 1);
        this.boundary = new Uint8Array(n);
        let nonmanifold = 0, boundaries = 0;
        for (let i = 0; i < n; i++) {
            const counts = new Map();
            for (let a = offset[i]; a < offset[i + 1]; a++) {
                const f = this.faceIDs[a] * 3;
                for (let j = 0; j < 3; j++) {
                    const k = idx[f + j];
                    if (k !== i) {
                        counts.set(k, (counts.get(k) || 0) + 1);
                        if (seen[k] !== i) {
                            seen[k] = i;
                            lists.push(k);
                        }
                    }
                }
            }
            for (const [j, count] of counts) {
                if (count === 1) {
                    this.boundary[i] = 1;
                    if (j > i)
                        boundaries++;
                }
                if (count > 2 && j > i)
                    nonmanifold++;
            }
            no[i + 1] = lists.length;
        }
        this.neighborOffsets = no;
        this.neighbors = new Uint32Array(lists);
        this.diagnostics = { boundaryEdges: boundaries, nonManifoldEdges: nonmanifold, degenerateFaces: 0 };
        this.faceNormals = new Float32Array(this.faces * 3);
        this.normalMarks = new Uint32Array(n);
        this.faceMarks = new Uint32Array(this.faces);
        this.epoch = 0;
    }
    updateNormals(changed = null) {
        const idx = this.indices, v = this.v, fn = this.faceNormals;
        let faces, verts;
        if (!changed) {
            faces = Array.from({ length: this.faces }, (_, i) => i);
            verts = Array.from({ length: this.count }, (_, i) => i);
        }
        else {
            const e = ++this.epoch;
            faces = [];
            verts = [];
            for (const i of changed)
                for (let j = this.faceOffsets[i]; j < this.faceOffsets[i + 1]; j++) {
                    const f = this.faceIDs[j];
                    if (this.faceMarks[f] !== e) {
                        this.faceMarks[f] = e;
                        faces.push(f);
                        for (let k = 0; k < 3; k++) {
                            const q = idx[f * 3 + k];
                            if (this.normalMarks[q] !== e) {
                                this.normalMarks[q] = e;
                                verts.push(q);
                            }
                        }
                    }
                }
        }
        let degenerates = 0;
        for (const f of faces) {
            const a = idx[f * 3] * 8, b = idx[f * 3 + 1] * 8, c = idx[f * 3 + 2] * 8;
            const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2], vx = v[c] - v[a], vy = v[c + 1] - v[a + 1], vz = v[c + 2] - v[a + 2];
            const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
            fn[f * 3] = x;
            fn[f * 3 + 1] = y;
            fn[f * 3 + 2] = z;
            if (x * x + y * y + z * z < 1e-24)
                degenerates++;
        }
        for (const i of verts) {
            let x = 0, y = 0, z = 0;
            for (let j = this.faceOffsets[i]; j < this.faceOffsets[i + 1]; j++) {
                const f = this.faceIDs[j] * 3;
                x += fn[f];
                y += fn[f + 1];
                z += fn[f + 2];
            }
            const len = Math.hypot(x, y, z);
            const k = i * 8;
            v[k + 4] = len > 1e-18 ? x / len : 0;
            v[k + 5] = len > 1e-18 ? y / len : 1;
            v[k + 6] = len > 1e-18 ? z / len : 0;
        }
        for (const i of verts) {
            const k = i * 8;
            let x = 0, y = 0, z = 0, c = 0, edge = 0;
            for (let j = this.neighborOffsets[i]; j < this.neighborOffsets[i + 1]; j++) {
                const q = this.neighbors[j] * 8, dx = v[q] - v[k], dy = v[q + 1] - v[k + 1], dz = v[q + 2] - v[k + 2];
                x += dx;
                y += dy;
                z += dz;
                edge += Math.hypot(dx, dy, dz);
                c++;
            }
            v[k + 7] = c ? clamp((x * v[k + 4] + y * v[k + 5] + z * v[k + 6]) / (edge || 1) * 5, -1, 1) : 0;
        }
        if (!changed)
            this.diagnostics.degenerateFaces = degenerates;
        return verts;
    }
    modified(ids = null) { const dirty = this.updateNormals(ids); if (this.bvh) {
        if (ids)
            this.bvh.refit(ids);
        else
            this.bvh.rebuild();
    } if (this.hash) {
        if (ids)
            this.hash.update(ids);
        else
            this.hash.rebuild();
    } this.version++; if (!ids)
        this.dirty = null;
    else if (this.dirty !== null) {
        for (const i of ids)
            this.dirty.add(i);
        for (const i of dirty)
            this.dirty.add(i);
    } return dirty; }
    markUploaded() { this.dirty = new Set(); }
    clone() { return new Mesh(this.v, this.indices, true); }
    bounds() { const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]; for (let i = 0; i < this.count; i++)
        for (let j = 0; j < 3; j++) {
            min[j] = Math.min(min[j], this.v[i * 8 + j]);
            max[j] = Math.max(max[j], this.v[i * 8 + j]);
        } return { min, max }; }
}
export class SpatialHash {
    constructor(mesh) { this.mesh = mesh; this.rebuild(); }
    key(i) { const v = this.mesh.v, k = i * 8, h = this.cell; return `${Math.floor(v[k] / h)},${Math.floor(v[k + 1] / h)},${Math.floor(v[k + 2] / h)}`; }
    rebuild() { const { min, max } = this.mesh.bounds(); this.cell = Math.max(1e-5, Math.max(...sub(max, min)) / 28); this.cells = new Map(); this.keys = new Array(this.mesh.count); for (let i = 0; i < this.mesh.count; i++)
        this.insert(i); }
    insert(i) { const k = this.key(i); let s = this.cells.get(k); if (!s)
        this.cells.set(k, s = new Set()); s.add(i); this.keys[i] = k; }
    update(ids) { for (const i of ids) {
        const k = this.key(i), old = this.keys[i];
        if (k === old)
            continue;
        const cell = this.cells.get(old);
        cell?.delete(i);
        if (cell && !cell.size)
            this.cells.delete(old);
        this.insert(i);
    } }
    query(p, r) { const out = [], h = this.cell, r2 = r * r, v = this.mesh.v, lo = p.map(x => Math.floor((x - r) / h)), hi = p.map(x => Math.floor((x + r) / h)); const test = i => { const k = i * 8, dx = v[k] - p[0], dy = v[k + 1] - p[1], dz = v[k + 2] - p[2]; if (dx * dx + dy * dy + dz * dz <= r2)
        out.push(i); }; if ((hi[0] - lo[0] + 1) * (hi[1] - lo[1] + 1) * (hi[2] - lo[2] + 1) > 20000) {
        for (const cell of this.cells.values())
            for (const i of cell)
                test(i);
    }
    else
        for (let z = lo[2]; z <= hi[2]; z++)
            for (let y = lo[1]; y <= hi[1]; y++)
                for (let x = lo[0]; x <= hi[0]; x++) {
                    const s = this.cells.get(`${x},${y},${z}`);
                    if (s)
                        for (const i of s)
                            test(i);
                } return out; }
}
export function rayTriangle(o, d, a, b, c) { const e1 = sub(b, a), e2 = sub(c, a), p = cross(d, e2), det = dot(e1, p); if (Math.abs(det) < 1e-12)
    return null; const inv = 1 / det, tv = sub(o, a), u = dot(tv, p) * inv; if (u < -1e-9 || u > 1 + 1e-9)
    return null; const q = cross(tv, e1), w = dot(d, q) * inv; if (w < -1e-9 || u + w > 1 + 1e-9)
    return null; const t = dot(e2, q) * inv; return t > 1e-8 ? { t, u, w } : null; }
function rayBox(o, d, min, max, limit = Infinity) { let lo = 0, hi = limit; for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-14) {
        if (o[i] < min[i] || o[i] > max[i])
            return false;
        continue;
    }
    let a = (min[i] - o[i]) / d[i], b = (max[i] - o[i]) / d[i];
    if (a > b)
        [a, b] = [b, a];
    lo = Math.max(lo, a);
    hi = Math.min(hi, b);
    if (hi < lo)
        return false;
} return true; }
export function closestTriangle(p, a, b, c) {
    const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap);
    if (d1 <= 0 && d2 <= 0)
        return a;
    const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
    if (d3 >= 0 && d4 <= d3)
        return b;
    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0)
        return add(a, mul(ab, d1 / (d1 - d3)));
    const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
    if (d6 >= 0 && d5 <= d6)
        return c;
    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0)
        return add(a, mul(ac, d2 / (d2 - d6)));
    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0)
        return add(b, mul(sub(c, b), (d4 - d3) / (d4 - d3 + d5 - d6)));
    const den = va + vb + vc;
    if (Math.abs(den) < 1e-25)
        return a;
    return add(a, add(mul(ab, vb / den), mul(ac, vc / den)));
}
export class BVH {
    constructor(mesh) { this.mesh = mesh; this.rebuild(); }
    rebuild() {
        const m = this.mesh;
        this.nodes = [];
        this.leaves = new Int32Array(m.faces);
        const centers = new Float32Array(m.faces * 3);
        for (let f = 0; f < m.faces; f++)
            for (let a = 0; a < 3; a++)
                centers[f * 3 + a] = (m.v[m.indices[f * 3] * 8 + a] + m.v[m.indices[f * 3 + 1] * 8 + a] + m.v[m.indices[f * 3 + 2] * 8 + a]) / 3;
        const build = (faces, parent = -1) => { const id = this.nodes.length, node = { parent, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], left: -1, right: -1, faces: null }; this.nodes.push(node); if (faces.length <= 12) {
            node.faces = faces;
            for (const f of faces)
                this.leaves[f] = id;
        }
        else {
            const mi = [Infinity, Infinity, Infinity], ma = [-Infinity, -Infinity, -Infinity];
            for (const f of faces)
                for (let j = 0; j < 3; j++) {
                    mi[j] = Math.min(mi[j], centers[f * 3 + j]);
                    ma[j] = Math.max(ma[j], centers[f * 3 + j]);
                }
            const e = sub(ma, mi), axis = e.indexOf(Math.max(...e));
            faces.sort((a, b) => centers[a * 3 + axis] - centers[b * 3 + axis]);
            const half = faces.length >> 1;
            node.left = build(faces.slice(0, half), id);
            node.right = build(faces.slice(half), id);
        } this.fit(id); return id; };
        build(Array.from({ length: m.faces }, (_, i) => i));
    }
    fit(id) { const n = this.nodes[id], m = this.mesh; n.min.fill(Infinity); n.max.fill(-Infinity); if (n.faces) {
        for (const f of n.faces)
            for (let k = 0; k < 3; k++) {
                const i = m.indices[f * 3 + k] * 8;
                for (let j = 0; j < 3; j++) {
                    n.min[j] = Math.min(n.min[j], m.v[i + j]);
                    n.max[j] = Math.max(n.max[j], m.v[i + j]);
                }
            }
    }
    else
        for (const id of [n.left, n.right])
            for (let j = 0; j < 3; j++) {
                n.min[j] = Math.min(n.min[j], this.nodes[id].min[j]);
                n.max[j] = Math.max(n.max[j], this.nodes[id].max[j]);
            } }
    refit(vertices) { const nodes = new Set(), m = this.mesh; for (const i of vertices)
        for (let j = m.faceOffsets[i]; j < m.faceOffsets[i + 1]; j++) {
            let n = this.leaves[m.faceIDs[j]];
            while (n >= 0 && !nodes.has(n)) {
                nodes.add(n);
                n = this.nodes[n].parent;
            }
        } for (const n of [...nodes].sort((a, b) => b - a))
        this.fit(n); }
    ray(o, d, all = false) { const m = this.mesh, stack = [0], hits = []; let best = Infinity, hit = null; while (stack.length) {
        const n = this.nodes[stack.pop()];
        if (!rayBox(o, d, n.min, n.max, all ? Infinity : best))
            continue;
        if (n.faces) {
            for (const f of n.faces) {
                const a = m.indices[f * 3], b = m.indices[f * 3 + 1], c = m.indices[f * 3 + 2], q = rayTriangle(o, d, m.pos(a), m.pos(b), m.pos(c));
                if (q) {
                    if (all)
                        hits.push(q.t);
                    else if (q.t < best) {
                        best = q.t;
                        hit = { ...q, face: f, point: add(o, mul(d, q.t)), normal: norm(add(mul(m.normal(a), 1 - q.u - q.w), add(mul(m.normal(b), q.u), mul(m.normal(c), q.w)))) };
                    }
                }
            }
        }
        else
            stack.push(n.left, n.right);
    } if (all) {
        hits.sort((a, b) => a - b);
        return hits.filter((t, i) => !i || t - hits[i - 1] > 1e-7);
    } return hit; }
    nearest(p) { const m = this.mesh, stack = [0]; let best = Infinity, point = null, face = -1; const boxdist = n => { let d = 0; for (let i = 0; i < 3; i++) {
        const x = Math.max(n.min[i] - p[i], 0, p[i] - n.max[i]);
        d += x * x;
    } return d; }; while (stack.length) {
        const n = this.nodes[stack.pop()];
        if (boxdist(n) > best)
            continue;
        if (n.faces) {
            for (const f of n.faces) {
                const q = closestTriangle(p, m.pos(m.indices[f * 3]), m.pos(m.indices[f * 3 + 1]), m.pos(m.indices[f * 3 + 2])), s = sub(q, p), d = dot(s, s);
                if (d < best) {
                    best = d;
                    point = q;
                    face = f;
                }
            }
        }
        else {
            const a = n.left, b = n.right;
            if (boxdist(this.nodes[a]) < boxdist(this.nodes[b]))
                stack.push(b, a);
            else
                stack.push(a, b);
        }
    } return { distance: Math.sqrt(best), point, face }; }
}
export function icosphere(level = 4, shape = p => p) { let p = [[-1, (1 + Math.sqrt(5)) / 2, 0], [1, (1 + Math.sqrt(5)) / 2, 0], [-1, -(1 + Math.sqrt(5)) / 2, 0], [1, -(1 + Math.sqrt(5)) / 2, 0], [0, -1, (1 + Math.sqrt(5)) / 2], [0, 1, (1 + Math.sqrt(5)) / 2], [0, -1, -(1 + Math.sqrt(5)) / 2], [0, 1, -(1 + Math.sqrt(5)) / 2], [(1 + Math.sqrt(5)) / 2, 0, -1], [(1 + Math.sqrt(5)) / 2, 0, 1], [-(1 + Math.sqrt(5)) / 2, 0, -1], [-(1 + Math.sqrt(5)) / 2, 0, 1]].map(norm); let idx = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1]; for (let l = 0; l < level; l++) {
    const edges = new Map(), next = [];
    const mid = (a, b) => { const key = Math.min(a, b) + ':' + Math.max(a, b); if (edges.has(key))
        return edges.get(key); const i = p.length; p.push(norm(add(p[a], p[b]))); edges.set(key, i); return i; };
    for (let f = 0; f < idx.length; f += 3) {
        const a = idx[f], b = idx[f + 1], c = idx[f + 2], ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
        next.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
    }
    idx = next;
} return new Mesh(p.flatMap(shape), idx); }
export function lathe(profile, rings = 64, segments = 96) { const pos = [], idx = []; pos.push(0, profile(0)[0], 0); for (let j = 0; j <= rings; j++) {
    const [y, rx, rz] = profile(j / rings);
    for (let i = 0; i < segments; i++) {
        const a = i / segments * Math.PI * 2;
        pos.push(rx * Math.cos(a), y, rz * Math.sin(a));
    }
} const top = pos.length / 3; pos.push(0, profile(1)[0], 0); for (let i = 0; i < segments; i++) {
    const a = 1 + i, b = 1 + (i + 1) % segments;
    idx.push(0, a, b);
    const c = 1 + rings * segments + i, d = 1 + rings * segments + (i + 1) % segments;
    idx.push(top, d, c);
} for (let j = 0; j < rings; j++)
    for (let i = 0; i < segments; i++) {
        const a = 1 + j * segments + i, b = 1 + j * segments + (i + 1) % segments, c = a + segments, d = b + segments;
        idx.push(a, c, b, b, c, d);
    } return new Mesh(pos, idx); }
