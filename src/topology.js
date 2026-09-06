import { Mesh } from './mesh.js';
import { add, sub, mul, dot, cross, norm, clamp } from './math.js';
export function subdivide(mesh) {
    if (mesh.count * 4 > 1000000 || mesh.faces * 4 > 2000000)
        throw Error('Subdivision would exceed the safety budget (1M vertices / 2M triangles).');
    if (mesh.diagnostics.nonManifoldEdges)
        throw Error('Loop subdivision requires a manifold triangle mesh.');
    const edges = new Map(), idx = mesh.indices, n = mesh.count;
    const edge = (a, b, op) => { const key = Math.min(a, b) + ':' + Math.max(a, b); let e = edges.get(key); if (!e) {
        e = { a, b, op: [], i: n + edges.size };
        edges.set(key, e);
    } e.op.push(op); return e.i; };
    const triangles = [];
    for (let f = 0; f < idx.length; f += 3) {
        const a = idx[f], b = idx[f + 1], c = idx[f + 2], ab = edge(a, b, c), bc = edge(b, c, a), ca = edge(c, a, b);
        triangles.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
    }
    const stencils = Array.from({ length: n + edges.size }, () => []), boundaryNeighbors = Array.from({ length: n }, () => []);
    for (const e of edges.values())
        if (e.op.length === 1) {
            boundaryNeighbors[e.a].push(e.b);
            boundaryNeighbors[e.b].push(e.a);
        }
    for (let i = 0; i < n; i++) {
        const list = stencils[i], bn = boundaryNeighbors[i], neighbors = mesh.neighbors.subarray(mesh.neighborOffsets[i], mesh.neighborOffsets[i + 1]), count = neighbors.length;
        if (bn.length === 2)
            list.push([i, .75], [bn[0], .125], [bn[1], .125]);
        else if (bn.length || !count)
            list.push([i, 1]);
        else {
            const beta = count === 3 ? 3 / 16 : 3 / (8 * count);
            list.push([i, 1 - count * beta]);
            for (const k of neighbors)
                list.push([k, beta]);
        }
    }
    for (const e of edges.values()) {
        const list = stencils[e.i];
        if (e.op.length === 2)
            list.push([e.a, .375], [e.b, .375], [e.op[0], .125], [e.op[1], .125]);
        else
            list.push([e.a, .5], [e.b, .5]);
    }
    const offsets = new Uint32Array(stencils.length + 1), ids = [], weights = [], v = new Float32Array(stencils.length * 8);
    for (let i = 0; i < stencils.length; i++) {
        for (const [j, w] of stencils[i]) {
            ids.push(j);
            weights.push(w);
            for (let k = 0; k < 4; k++)
                v[i * 8 + k] += mesh.v[j * 8 + k] * w;
        }
        offsets[i + 1] = ids.length;
    }
    return { mesh: new Mesh(v, triangles, true), transition: { offsets, ids: new Uint32Array(ids), weights: new Float32Array(weights) } };
}
const TETS = [[0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6]];
const CUBE = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
/** Indexed marching tetrahedra: a consistent body diagonal avoids ambiguous cube faces. */
export function polygonize(field, min, step, nx, ny, nz) {
    const pos = [], idx = [], cache = new Map(), stride = nx * ny, id = (x, y, z) => x + y * nx + z * stride;
    const world = i => [min[0] + (i % nx) * step, min[1] + (Math.floor(i / nx) % ny) * step, min[2] + Math.floor(i / stride) * step];
    const edge = (a, b) => { const key = Math.min(a, b) + ':' + Math.max(a, b); if (cache.has(key))
        return cache.get(key); const fa = field[a], fb = field[b], t = clamp(fa / (fa - fb)), p = world(a), q = world(b), i = pos.length / 3; pos.push(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t); cache.set(key, i); return i; };
    const tri = (a, b, c, direction) => { const p = pos.slice(a * 3, a * 3 + 3), q = pos.slice(b * 3, b * 3 + 3), r = pos.slice(c * 3, c * 3 + 3), n = cross(sub(q, p), sub(r, p)); if (dot(n, n) < 1e-22)
        return; if (dot(n, direction) < 0)
        idx.push(a, c, b);
    else
        idx.push(a, b, c); };
    for (let z = 0; z < nz - 1; z++)
        for (let y = 0; y < ny - 1; y++)
            for (let x = 0; x < nx - 1; x++) {
                const cube = CUBE.map(c => id(x + c[0], y + c[1], z + c[2]));
                for (const tet of TETS) {
                    const verts = tet.map(i => cube[i]), inside = verts.filter(i => field[i] < 0), outside = verts.filter(i => field[i] >= 0);
                    if (!inside.length || !outside.length)
                        continue;
                    const avg = list => mul(list.reduce((p, i) => add(p, world(i)), [0, 0, 0]), 1 / list.length), dir = sub(avg(outside), avg(inside));
                    if (inside.length === 1) {
                        const a = inside[0];
                        tri(edge(a, outside[0]), edge(a, outside[1]), edge(a, outside[2]), dir);
                    }
                    else if (outside.length === 1) {
                        const a = outside[0];
                        tri(edge(a, inside[0]), edge(a, inside[1]), edge(a, inside[2]), dir);
                    }
                    else {
                        const [a, b] = inside, [c, d] = outside, ac = edge(a, c), ad = edge(a, d), bc = edge(b, c), bd = edge(b, d);
                        tri(ac, ad, bc, dir);
                        tri(ad, bd, bc, dir);
                    }
                }
            }
    if (!idx.length)
        throw Error('The remeshing field has no surface.');
    return { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
}
/** Closed-surface SDF resampling. Signed distance is BVH nearest + odd/even ray parity. */
export function remesh(mesh, resolution = 40, onProgress = () => { }) {
    if (mesh.diagnostics.boundaryEdges || mesh.diagnostics.nonManifoldEdges || mesh.diagnostics.degenerateFaces)
        throw Error('SDF remeshing requires a closed, nondegenerate manifold mesh. Inspect topology first.');
    resolution = Math.round(clamp(resolution, 16, 72));
    const bounds = mesh.bounds(), extent = sub(bounds.max, bounds.min), step = Math.max(...extent) / resolution, min = bounds.min.map(v => v - 2.3 * step), size = extent.map(v => Math.ceil(v / step) + 6), [nx, ny, nz] = size, field = new Float32Array(nx * ny * nz), ray = norm([1, .371390676, .529137913]);
    for (let z = 0; z < nz; z++) {
        for (let y = 0; y < ny; y++)
            for (let x = 0; x < nx; x++) {
                const p = [min[0] + x * step, min[1] + y * step, min[2] + z * step], d = mesh.bvh.nearest(p).distance, inside = mesh.bvh.ray(p, ray, true).length % 2;
                field[x + y * nx + z * nx * ny] = (inside ? -1 : 1) * Math.max(1e-9 * step, d);
            }
        onProgress(z / (nz - 1));
    }
    const data = polygonize(field, min, step, nx, ny, nz), out = new Mesh(data.positions, data.indices);
    // Transfer the nearest source triangle's barycentrically interpolated mask.
    for (let i = 0; i < out.count; i++) {
        const q = mesh.bvh.nearest(out.pos(i));
        if (q.face < 0)
            continue;
        const f = q.face * 3, ia = mesh.indices[f], ib = mesh.indices[f + 1], ic = mesh.indices[f + 2], a = mesh.pos(ia), v0 = sub(mesh.pos(ib), a), v1 = sub(mesh.pos(ic), a), v2 = sub(q.point, a), d00 = dot(v0, v0), d01 = dot(v0, v1), d11 = dot(v1, v1), d20 = dot(v2, v0), d21 = dot(v2, v1), den = d00 * d11 - d01 * d01;
        let u = 0, v = 0;
        if (Math.abs(den) > 1e-20) {
            u = (d11 * d20 - d01 * d21) / den;
            v = (d00 * d21 - d01 * d20) / den;
        }
        out.v[i * 8 + 3] = clamp((1 - u - v) * mesh.v[ia * 8 + 3] + u * mesh.v[ib * 8 + 3] + v * mesh.v[ic * 8 + 3]);
    }
    return out;
}
