import { Mesh } from './mesh.js';
import { SculptObject, MATERIALS } from './model.js';
import { identity, mmul, compose, transform, sub, cross, dot } from './math.js';
export function toBase64(array) { const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength); if (typeof Buffer !== 'undefined')
    return Buffer.from(bytes).toString('base64'); let s = ''; for (let i = 0; i < bytes.length; i += 16384)
    s += String.fromCharCode(...bytes.subarray(i, i + 16384)); return btoa(s); }
export function fromBase64(text, Type = Float32Array) { if (typeof text !== 'string' || text.length > 180000000)
    throw Error('Invalid or oversized binary project field.'); const raw = typeof Buffer !== 'undefined' ? Uint8Array.from(Buffer.from(text, 'base64')) : Uint8Array.from(atob(text), c => c.charCodeAt(0)); if (raw.byteLength % Type.BYTES_PER_ELEMENT)
    throw Error('Misaligned binary data.'); return new Type(raw.buffer); }
export function download(data, name, type = 'application/octet-stream') { const blob = data instanceof Blob ? data : new Blob([data], { type }), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 20000); }
function triangulate(face, positions) {
    if (face.length === 3)
        return face;
    const p = face.map(i => positions[i]);
    let n = [0, 0, 0];
    for (let i = 0; i < p.length; i++) {
        const a = p[i], b = p[(i + 1) % p.length];
        n[0] += (a[1] - b[1]) * (a[2] + b[2]);
        n[1] += (a[2] - b[2]) * (a[0] + b[0]);
        n[2] += (a[0] - b[0]) * (a[1] + b[1]);
    }
    const axis = n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs))), axes = [0, 1, 2].filter(i => i !== axis), q = p.map(v => axes.map(j => v[j]));
    const area = q.reduce((s, a, i) => { const b = q[(i + 1) % q.length]; return s + a[0] * b[1] - a[1] * b[0]; }, 0), sign = area >= 0 ? 1 : -1, turn = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]), remaining = face.map((_, i) => i), out = [];
    while (remaining.length > 3) {
        let found = false;
        for (let j = 0; j < remaining.length; j++) {
            const a = remaining[(j + remaining.length - 1) % remaining.length], b = remaining[j], c = remaining[(j + 1) % remaining.length];
            if (turn(q[a], q[b], q[c]) * sign <= 1e-13)
                continue;
            let blocked = false;
            for (const k of remaining) {
                if (k === a || k === b || k === c)
                    continue;
                if (turn(q[a], q[b], q[k]) * sign >= -1e-13 && turn(q[b], q[c], q[k]) * sign >= -1e-13 && turn(q[c], q[a], q[k]) * sign >= -1e-13) {
                    blocked = true;
                    break;
                }
            }
            if (blocked)
                continue;
            out.push(face[a], face[b], face[c]);
            remaining.splice(j, 1);
            found = true;
            break;
        }
        if (!found)
            throw Error('OBJ polygon is degenerate, self-intersecting, or cannot be triangulated.');
    }
    out.push(...remaining.map(i => face[i]));
    return out;
}
export function cleanedMesh(positions, indices) { const n = positions.length / 3; if (!n || positions.length % 3 || n > 1000000)
    throw Error('Invalid mesh size.'); const welded = [], map = new Uint32Array(n), lookup = new Map(); for (let i = 0; i < n; i++) {
    const p = [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
    if (!p.every(Number.isFinite))
        throw Error('Non-finite imported position.');
    const key = p.join(',');
    let k = lookup.get(key);
    if (k === undefined) {
        k = welded.length / 3;
        lookup.set(key, k);
        welded.push(...p);
    }
    map[i] = k;
} const out = [], seen = new Set(); for (let f = 0; f < indices.length; f += 3) {
    const original = [indices[f], indices[f + 1], indices[f + 2]];
    if (!original.every(i => Number.isInteger(i) && i >= 0 && i < n))
        throw Error('Imported index exceeds the position accessor.');
    const [a, b, c] = original.map(i => map[i]);
    if (a === b || b === c || a === c)
        continue;
    const pa = welded.slice(a * 3, a * 3 + 3), pb = welded.slice(b * 3, b * 3 + 3), pc = welded.slice(c * 3, c * 3 + 3), nn = cross(sub(pb, pa), sub(pc, pa));
    if (dot(nn, nn) < 1e-24)
        continue;
    const key = [a, b, c].sort((a, b) => a - b).join(':');
    if (seen.has(key))
        continue;
    seen.add(key);
    out.push(a, b, c);
} if (!out.length)
    throw Error('File contains no nondegenerate triangles.'); return new Mesh(welded, out); }
export function importOBJ(text) {
    const positions = [], groups = [];
    let current = { name: 'Imported mesh', faces: [] };
    groups.push(current);
    for (const line of text.split(/\r?\n/)) {
        const a = line.split('#')[0].trim().split(/\s+/);
        if (a[0] === 'v') {
            if (positions.length >= 1000000)
                throw Error('OBJ exceeds 1M input vertices.');
            positions.push(a.slice(1, 4).map(Number));
        }
        else if ((a[0] === 'o' || a[0] === 'g') && a.length > 1) {
            if (!current.faces.length)
                current.name = a.slice(1).join(' ');
            else {
                current = { name: a.slice(1).join(' '), faces: [] };
                groups.push(current);
            }
        }
        else if (a[0] === 'f') {
            const face = a.slice(1).filter(s => s && !s.startsWith('#')).map(s => { const n = Number(s.split('/')[0]); if (!Number.isInteger(n) || !n)
                throw Error('Invalid OBJ face index.'); const i = n < 0 ? positions.length + n : n - 1; if (i < 0 || i >= positions.length)
                throw Error('OBJ face references a missing vertex.'); return i; });
            if (face.length < 3)
                throw Error('OBJ face needs at least 3 vertices.');
            current.faces.push(...triangulate(face, positions));
            if (current.faces.length > 6000000)
                throw Error('OBJ exceeds 2M triangles.');
        }
    }
    const objects = [];
    for (const group of groups) {
        if (!group.faces.length)
            continue;
        const map = new Map(), p = [], idx = [];
        for (const i of group.faces) {
            if (!map.has(i)) {
                map.set(i, p.length / 3);
                p.push(...positions[i]);
            }
            idx.push(map.get(i));
        }
        objects.push(new SculptObject(group.name, cleanedMesh(p, idx)));
    }
    if (!objects.length)
        throw Error('OBJ contains no polygon faces.');
    return objects;
}
export function exportOBJ(objects) { const lines = ['# Lithic Sculpt · geometry-only OBJ; Y up, right handed', 's 1']; let offset = 1; for (const o of objects) {
    if (!o.visible)
        continue;
    const m = o.mesh;
    lines.push('o ' + o.name.replace(/[\r\n]/g, ' '));
    for (let i = 0; i < m.count; i++)
        lines.push(`v ${m.pos(i).map(v => v.toPrecision(8)).join(' ')}`);
    for (let i = 0; i < m.count; i++)
        lines.push(`vn ${m.normal(i).map(v => v.toPrecision(7)).join(' ')}`);
    for (let f = 0; f < m.indices.length; f += 3)
        lines.push('f ' + [0, 1, 2].map(k => { const n = m.indices[f + k] + offset; return `${n}//${n}`; }).join(' '));
    offset += m.count;
} return lines.join('\n'); }
export function exportGLTF(objects, binary = false) {
    const json = { asset: { version: '2.0', generator: 'Lithic Sculpt 1.0' }, scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], materials: [], buffers: [{ byteLength: 0 }], bufferViews: [], accessors: [] }, chunks = [];
    let offset = 0;
    const accessor = (data, type, componentType, target, min, max) => { const view = json.bufferViews.length; json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.byteLength, target }); const a = { bufferView: view, componentType, count: data.length / (type === 'VEC3' ? 3 : 1), type }; if (min) {
        a.min = min;
        a.max = max;
    } json.accessors.push(a); chunks.push(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)); offset += data.byteLength; return json.accessors.length - 1; };
    for (const o of objects) {
        if (!o.visible)
            continue;
        const m = o.mesh, p = new Float32Array(m.count * 3), n = new Float32Array(m.count * 3);
        for (let i = 0; i < m.count; i++) {
            p.set(m.v.subarray(i * 8, i * 8 + 3), i * 3);
            n.set(m.v.subarray(i * 8 + 4, i * 8 + 7), i * 3);
        }
        const b = m.bounds(), pa = accessor(p, 'VEC3', 5126, 34962, b.min, b.max), na = accessor(n, 'VEC3', 5126, 34962), ia = accessor(m.indices, 'SCALAR', 5125, 34963), mat = o.customMaterial || MATERIALS[o.material] || MATERIALS[0];
        const material = json.materials.length;
        json.materials.push({ name: mat.name || o.name, pbrMetallicRoughness: { baseColorFactor: [...mat.color, 1], metallicFactor: mat.metallic, roughnessFactor: mat.roughness }, doubleSided: true });
        json.scenes[0].nodes.push(json.nodes.length);
        json.nodes.push({ name: o.name, mesh: json.meshes.length });
        json.meshes.push({ name: o.name, primitives: [{ attributes: { POSITION: pa, NORMAL: na }, indices: ia, material, mode: 4 }] });
    }
    const bytes = new Uint8Array(offset);
    let at = 0;
    for (const c of chunks) {
        bytes.set(c, at);
        at += c.length;
    }
    json.buffers[0].byteLength = offset;
    if (!binary) {
        json.buffers[0].uri = 'data:application/octet-stream;base64,' + toBase64(bytes);
        return JSON.stringify(json);
    }
    const text = new TextEncoder().encode(JSON.stringify(json)), jsonLength = (text.length + 3) & ~3, binLength = (bytes.length + 3) & ~3, total = 12 + 8 + jsonLength + 8 + binLength, buffer = new ArrayBuffer(total), dv = new DataView(buffer), out = new Uint8Array(buffer);
    dv.setUint32(0, 0x46546c67, true);
    dv.setUint32(4, 2, true);
    dv.setUint32(8, total, true);
    dv.setUint32(12, jsonLength, true);
    dv.setUint32(16, 0x4e4f534a, true);
    out.fill(32, 20, 20 + jsonLength);
    out.set(text, 20);
    dv.setUint32(20 + jsonLength, binLength, true);
    dv.setUint32(24 + jsonLength, 0x004e4942, true);
    out.set(bytes, 28 + jsonLength);
    return buffer;
}
export async function importGLTF(data, files = new Map()) {
    let json, bin = null;
    if (typeof data === 'string')
        json = JSON.parse(data);
    else {
        const dv = new DataView(data);
        if (dv.byteLength < 20 || dv.getUint32(0, true) !== 0x46546c67 || dv.getUint32(4, true) !== 2 || dv.getUint32(8, true) !== dv.byteLength)
            throw Error('Invalid glTF binary header.');
        for (let at = 12; at < dv.byteLength;) {
            if (at + 8 > dv.byteLength)
                throw Error('Truncated GLB chunk.');
            const len = dv.getUint32(at, true), type = dv.getUint32(at + 4, true);
            at += 8;
            if (at + len > dv.byteLength)
                throw Error('GLB chunk exceeds file length.');
            const chunk = data.slice(at, at + len);
            if (type === 0x4e4f534a)
                json = JSON.parse(new TextDecoder().decode(chunk));
            if (type === 0x004e4942)
                bin = chunk;
            at += len;
        }
    }
    if (json?.asset?.version !== '2.0')
        throw Error('Only glTF 2.0 is supported.');
    if (json.extensionsRequired?.length)
        throw Error('Required glTF extensions are unsupported: ' + json.extensionsRequired.join(', '));
    if (json.skins?.length || json.animations?.length)
        throw Error('Import a static/baked glTF mesh; skeletal animation is not evaluated.');
    const buffers = await Promise.all((json.buffers || []).map(async (b, i) => { let ab; if (!b.uri) {
        if (i !== 0 || !bin)
            throw Error('Missing GLB binary chunk.');
        ab = bin;
    }
    else if (b.uri.startsWith('data:')) {
        const comma = b.uri.indexOf(',');
        if (!b.uri.slice(0, comma).endsWith(';base64'))
            throw Error('Only base64 data-URI buffers are supported.');
        ab = fromBase64(b.uri.slice(comma + 1), Uint8Array).buffer;
    }
    else {
        const name = decodeURIComponent(b.uri), file = files.get(name) || files.get(name.split('/').at(-1));
        if (!file)
            throw Error(`Select the external buffer “${name}” together with the .gltf file.`);
        ab = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
    } if (ab.byteLength < b.byteLength)
        throw Error('glTF buffer is truncated.'); return ab; }));
    const readAccessor = index => {
        const a = json.accessors?.[index];
        if (!a)
            throw Error('Missing glTF accessor.');
        const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type], info = { 5120: [1, 'getInt8', 127], 5121: [1, 'getUint8', 255], 5122: [2, 'getInt16', 32767], 5123: [2, 'getUint16', 65535], 5125: [4, 'getUint32', 4294967295], 5126: [4, 'getFloat32', 1] }[a.componentType];
        if (!components || !info || !Number.isInteger(a.count) || a.count < 0 || a.count > 6000000)
            throw Error('Invalid or oversized glTF accessor.');
        const [size, get, max] = info, out = new Float32Array(a.count * components);
        const read = (viewID, byteOffset, count, comp, compType, put) => { const bv = json.bufferViews?.[viewID], buffer = buffers[bv?.buffer]; if (!bv || !buffer)
            throw Error('Missing glTF buffer view.'); const inf = { 5120: [1, 'getInt8'], 5121: [1, 'getUint8'], 5122: [2, 'getInt16'], 5123: [2, 'getUint16'], 5125: [4, 'getUint32'], 5126: [4, 'getFloat32'] }[compType]; if (!inf)
            throw Error('Unsupported component type.'); const [sz, method] = inf, stride = bv.byteStride || comp * sz, start = (bv.byteOffset || 0) + (byteOffset || 0); if (stride < comp * sz || start < 0 || start + (count ? count - 1 : 0) * stride + comp * sz > (bv.byteOffset || 0) + bv.byteLength || start + (count ? count - 1 : 0) * stride + comp * sz > buffer.byteLength)
            throw Error('Accessor reads outside its buffer view.'); const dv = new DataView(buffer); for (let i = 0; i < count; i++)
            for (let j = 0; j < comp; j++)
                put(i, j, dv[method](start + i * stride + j * sz, true)); };
        const convert = v => a.normalized && a.componentType !== 5126 ? Math.max(-1, v / max) : v;
        if (a.bufferView !== undefined)
            read(a.bufferView, a.byteOffset, a.count, components, a.componentType, (i, j, v) => out[i * components + j] = convert(v));
        if (a.sparse) {
            const s = a.sparse;
            if (s.count > a.count)
                throw Error('Sparse count exceeds accessor.');
            const ids = [];
            read(s.indices.bufferView, s.indices.byteOffset, s.count, 1, s.indices.componentType, (i, j, v) => { if (v >= a.count)
                throw Error('Sparse index out of range.'); ids[i] = v; });
            read(s.values.bufferView, s.values.byteOffset, s.count, components, a.componentType, (i, j, v) => out[ids[i] * components + j] = convert(v));
        }
        return { data: out, accessor: a };
    };
    const objects = [], path = new Set();
    const visit = (index, parent) => {
        const node = json.nodes?.[index];
        if (!node)
            throw Error('Missing glTF node.');
        if (path.has(index))
            throw Error('Cyclic glTF node hierarchy.');
        path.add(index);
        const matrix = mmul(parent, compose(node));
        if (node.mesh !== undefined) {
            const mesh = json.meshes?.[node.mesh];
            if (!mesh)
                throw Error('Missing glTF mesh.');
            for (let j = 0; j < mesh.primitives.length; j++) {
                const prim = mesh.primitives[j];
                if ((prim.mode ?? 4) !== 4)
                    throw Error('Only triangle-list glTF primitives are supported.');
                if (prim.targets?.length || node.weights)
                    throw Error('Bake morph targets before importing.');
                const attr = readAccessor(prim.attributes.POSITION);
                if (attr.accessor.type !== 'VEC3')
                    throw Error('POSITION must be VEC3.');
                const pos = attr.data, n = pos.length / 3;
                for (let i = 0; i < n; i++)
                    pos.set(transform(matrix, pos.subarray(i * 3, i * 3 + 3)), i * 3);
                let idx;
                if (prim.indices === undefined)
                    idx = Uint32Array.from({ length: n }, (_, i) => i);
                else {
                    const a = readAccessor(prim.indices);
                    if (a.accessor.type !== 'SCALAR' || ![5121, 5123, 5125].includes(a.accessor.componentType))
                        throw Error('Triangle indices must be unsigned scalar integers.');
                    idx = Array.from(a.data);
                }
                if (idx.length % 3)
                    throw Error('Triangle index count is not divisible by three.');
                const det = matrix[0] * (matrix[5] * matrix[10] - matrix[6] * matrix[9]) - matrix[4] * (matrix[1] * matrix[10] - matrix[2] * matrix[9]) + matrix[8] * (matrix[1] * matrix[6] - matrix[2] * matrix[5]);
                if (det < 0)
                    for (let i = 0; i < idx.length; i += 3)
                        [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
                const o = new SculptObject((node.name || mesh.name || 'Imported mesh') + (mesh.primitives.length > 1 ? ` · ${j + 1}` : ''), cleanedMesh(pos, idx));
                const mat = json.materials?.[prim.material], pbr = mat?.pbrMetallicRoughness;
                if (pbr)
                    o.customMaterial = { name: mat.name || 'Imported material', color: (pbr.baseColorFactor || [1, 1, 1, 1]).slice(0, 3), roughness: pbr.roughnessFactor ?? 1, metallic: pbr.metallicFactor ?? 1 };
                objects.push(o);
            }
        }
        for (const child of node.children || [])
            visit(child, matrix);
        path.delete(index);
    };
    let roots = json.scenes?.[json.scene ?? 0]?.nodes;
    if (!roots) {
        const children = new Set((json.nodes || []).flatMap(n => n.children || []));
        roots = (json.nodes || []).map((_, i) => i).filter(i => !children.has(i));
    }
    for (const root of roots)
        visit(root, identity());
    if (!objects.length)
        throw Error('glTF scene has no triangle meshes.');
    return objects;
}
export function serializeProject(objects, camera, settings, title) { return { format: 'lithic-sculpt', version: 1, title, createdWith: '1.0.0', camera: { target: camera.target, yaw: camera.yaw, pitch: camera.pitch, distance: camera.distance, fov: camera.fov, ortho: camera.ortho }, settings, objects: objects.map(o => ({ id: o.id, name: o.name, material: o.material, customMaterial: o.customMaterial, visible: o.visible, origin: o.origin, level: o.level, levels: o.levels.map(m => ({ vertices: toBase64(m.v), indices: toBase64(m.indices) })), transitions: o.transitions.map(t => ({ offsets: toBase64(t.offsets), ids: toBase64(t.ids), weights: toBase64(t.weights) })) })) }; }
function validatedMaterial(m) { if (m == null)
    return undefined; if (!Array.isArray(m.color) || m.color.length !== 3 || !m.color.every(v => Number.isFinite(v) && v >= 0 && v <= 1) || !Number.isFinite(m.roughness) || m.roughness < 0 || m.roughness > 1 || !Number.isFinite(m.metallic) || m.metallic < 0 || m.metallic > 1)
    throw Error('Invalid preview material.'); return { name: String(m.name || 'Imported material').slice(0, 200), color: [...m.color], roughness: m.roughness, metallic: m.metallic }; }
export function deserializeProject(p) {
    if (p?.format !== 'lithic-sculpt' || p.version !== 1 || !Array.isArray(p.objects) || !p.objects.length || p.objects.length > 100)
        throw Error('Not a supported Lithic Sculpt project.');
    let total = 0;
    const objects = p.objects.map(o => {
        if (!o.levels?.length || o.levels.length > 8)
            throw Error('Invalid subdivision hierarchy.');
        const levels = o.levels.map(l => { const v = fromBase64(l.vertices), idx = fromBase64(l.indices, Uint32Array); total += v.byteLength + idx.byteLength; if (total > 256 * 1024 * 1024)
            throw Error('Project exceeds the 256MB mesh budget.'); return new Mesh(v, idx, true); });
        const obj = new SculptObject(String(o.name || 'Sculpt object').slice(0, 200), levels[0], Number.isInteger(o.material) ? o.material : 0);
        obj.levels = levels;
        obj.id = String(o.id || obj.id);
        obj.visible = o.visible !== false;
        obj.origin = Array.isArray(o.origin) && o.origin.length === 3 && o.origin.every(Number.isFinite) ? o.origin : [0, 0, 0];
        obj.level = Number.isInteger(o.level) && o.level >= 0 && o.level < levels.length ? o.level : 0;
        obj.customMaterial = validatedMaterial(o.customMaterial);
        obj.transitions = (o.transitions || []).map((t, i) => { const offsets = fromBase64(t.offsets, Uint32Array), ids = fromBase64(t.ids, Uint32Array), weights = fromBase64(t.weights); if (!levels[i + 1] || offsets.length !== levels[i + 1].count + 1 || ids.length !== weights.length || offsets[0] !== 0 || offsets.at(-1) !== ids.length)
            throw Error('Invalid subdivision stencil dimensions.'); for (let j = 0; j < offsets.length - 1; j++) {
            if (offsets[j] > offsets[j + 1])
                throw Error('Nonmonotonic stencil offsets.');
            let sum = 0;
            for (let k = offsets[j]; k < offsets[j + 1]; k++) {
                if (ids[k] >= levels[i].count || !Number.isFinite(weights[k]) || weights[k] < 0)
                    throw Error('Invalid subdivision stencil.');
                sum += weights[k];
            }
            if (Math.abs(sum - 1) > 1e-4)
                throw Error('Subdivision stencil is not affine.');
        } return { offsets, ids, weights }; });
        if (obj.transitions.length !== levels.length - 1)
            throw Error('Incomplete subdivision hierarchy.');
        return obj;
    });
    return { objects, camera: p.camera, settings: p.settings || {}, title: String(p.title || 'Untitled sculpt').slice(0, 120) };
}
export async function storage(action, value) { const db = await new Promise((resolve, reject) => { const r = indexedDB.open('lithic-sculpt', 1); r.onupgradeneeded = () => r.result.createObjectStore('projects'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); try {
    return await new Promise((resolve, reject) => { const tx = db.transaction('projects', action === 'get' ? 'readonly' : 'readwrite'), store = tx.objectStore('projects'), request = action === 'get' ? store.get('autosave') : store.put(value, 'autosave'); let result; request.onsuccess = () => result = request.result; tx.oncomplete = () => resolve(result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || Error('Autosave transaction aborted.')); });
}
finally {
    db.close();
} }
