import { clamp, add, sub, mul, dot, norm } from './math.js';
export const BRUSHES = ['draw', 'clay', 'smooth', 'inflate', 'pinch', 'flatten', 'grab', 'mask'];
export function falloff(t, kind = 0) { t = clamp(t); return kind === 1 ? t * t : kind === 2 ? Math.sqrt(Math.max(0, 2 * t - t * t)) : t * t * (3 - 2 * t); }
/** Same arithmetic and record ABI as the WGSL kernel; deterministic CPU fallback. */
export function deformCPU(records, mode, kind = 0) {
    const out = new Float32Array(records.length / 6);
    for (let i = 0; i < records.length / 24; i++) {
        const b = i * 24, k = i * 4, p = records.subarray(b, b + 3), r = records[b + 15], center = records.subarray(b + 12, b + 15), n = records.subarray(b + 16, b + 19), sign = records[b + 19], strength = records[b + 23], dist = Math.hypot(p[0] - center[0], p[1] - center[1], p[2] - center[2]);
        const f = falloff(1 - dist / r, kind), mask = records[b + 3], s = strength * f * (1 - mask);
        let x = p[0], y = p[1], z = p[2], w = mask;
        const plane = (p[0] - center[0]) * n[0] + (p[1] - center[1]) * n[1] + (p[2] - center[2]) * n[2];
        if (mode === 7)
            w = clamp(w + sign * strength * f * .3);
        else if (mode === 0) {
            const h = r * .115 * s * sign;
            x += n[0] * h;
            y += n[1] * h;
            z += n[2] * h;
        }
        else if (mode === 1) {
            const h = sign > 0 ? Math.max(0, r * .12 - plane) : Math.min(0, -r * .12 - plane);
            x += n[0] * h * s * .65;
            y += n[1] * h * s * .65;
            z += n[2] * h * s * .65;
        }
        else if (mode === 2) {
            const a = s * .55 * (1 - records[b + 11]);
            x += (records[b + 8] - x) * a;
            y += (records[b + 9] - y) * a;
            z += (records[b + 10] - z) * a;
        }
        else if (mode === 3) {
            const h = r * .11 * s * sign;
            x += records[b + 4] * h;
            y += records[b + 5] * h;
            z += records[b + 6] * h;
        }
        else if (mode === 4) {
            const a = s * .22 * sign;
            x += (center[0] - x + n[0] * plane) * a;
            y += (center[1] - y + n[1] * plane) * a;
            z += (center[2] - z + n[2] * plane) * a;
        }
        else if (mode === 5) {
            const a = -plane * s * .65;
            x += n[0] * a;
            y += n[1] * a;
            z += n[2] * a;
        }
        else if (mode === 6) {
            x += records[b + 20] * s;
            y += records[b + 21] * s;
            z += records[b + 22] * s;
        }
        out[k] = x;
        out[k + 1] = y;
        out[k + 2] = z;
        out[k + 3] = w;
    }
    return out;
}
export const DEFORM_WGSL = `
struct Sample { p:vec4f,n:vec4f,average:vec4f,center:vec4f,normal:vec4f,delta:vec4f }
struct Params { count:u32,mode:u32,falloff:u32,pad:u32 }
@group(0) @binding(0) var<storage,read> samples:array<Sample>;
@group(0) @binding(1) var<storage,read_write> result:array<vec4f>;
@group(0) @binding(2) var<uniform> params:Params;
@compute @workgroup_size(128) fn main(@builtin(global_invocation_id) invocation:vec3u){
 let i=invocation.x;if(i>=params.count){return;}let a=samples[i];let t=clamp(1.0-distance(a.p.xyz,a.center.xyz)/a.center.w,0.0,1.0);
 var f=t*t*(3.0-2.0*t);if(params.falloff==1u){f=t*t;}if(params.falloff==2u){f=sqrt(max(0.0,2.0*t-t*t));}
 let s=a.delta.w*f*(1.0-a.p.w);let sign=a.normal.w;let n=a.normal.xyz;let r=a.center.w;let plane=dot(a.p.xyz-a.center.xyz,n);var p=a.p.xyz;var mask=a.p.w;
 switch params.mode {
 case 0u:{p+=n*r*0.115*s*sign;}
 case 1u:{var h=max(0.0,r*0.12-plane);if(sign<0.0){h=min(0.0,-r*0.12-plane);}p+=n*h*s*0.65;}
 case 2u:{p+=(a.average.xyz-p)*s*0.55*(1.0-a.average.w);}
 case 3u:{p+=a.n.xyz*r*0.11*s*sign;}
 case 4u:{p+=(a.center.xyz-p+n*plane)*s*0.22*sign;}
 case 5u:{p-=n*plane*s*0.65;}
 case 6u:{p+=a.delta.xyz*s;}
 case 7u:{mask=clamp(mask+sign*a.delta.w*f*0.3,0.0,1.0);}
 default:{}
 }result[i]=vec4f(p,mask);
}`;
/** Restrict Euclidean candidates to a connected, front-facing surface patch. */
export function connectedPatch(mesh, center, radius, normal, seedFace = -1, frontOnly = true) {
    const candidates = mesh.hash.query(center, radius), allowed = new Set();
    let best = Infinity, seed = -1;
    for (const i of candidates) {
        if (frontOnly && dot(mesh.normal(i), normal) < -.1)
            continue;
        allowed.add(i);
        const d = sub(mesh.pos(i), center), ds = dot(d, d);
        if (ds < best) {
            best = ds;
            seed = i;
        }
    }
    if (seedFace >= 0)
        for (let j = 0; j < 3; j++) {
            const i = mesh.indices[seedFace * 3 + j];
            if (allowed.has(i)) {
                seed = i;
                break;
            }
        }
    if (seed < 0)
        return [];
    const out = [seed];
    allowed.delete(seed);
    for (let q = 0; q < out.length; q++) {
        const i = out[q];
        for (let j = mesh.neighborOffsets[i]; j < mesh.neighborOffsets[i + 1]; j++) {
            const k = mesh.neighbors[j];
            if (allowed.delete(k))
                out.push(k);
        }
    }
    return out;
}
export function brushSamples(mesh, hit, settings, delta = [0, 0, 0], origin = [0, 0, 0]) {
    const centers = [{ point: hit.point, normal: hit.normal, delta, face: hit.face }];
    for (let axis = 0; axis < 3; axis++)
        if (settings.symmetry[axis]) {
            const copy = [...centers];
            for (const c of copy) {
                const p = [...c.point], n = [...c.normal], d = [...c.delta];
                p[axis] = 2 * origin[axis] - p[axis];
                n[axis] *= -1;
                d[axis] *= -1;
                centers.push({ point: p, normal: n, delta: d, face: -1 });
            }
        }
    const selected = new Map();
    for (const c of centers) {
        const patch = connectedPatch(mesh, c.point, settings.radius, c.normal, c.face, settings.frontOnly);
        for (const i of patch) {
            const distance = Math.hypot(...sub(mesh.pos(i), c.point));
            if (!selected.has(i) || distance < selected.get(i).distance)
                selected.set(i, { ...c, distance });
        }
    }
    const ids = new Uint32Array(selected.size), records = new Float32Array(selected.size * 24);
    let s = 0;
    for (const [i, c] of selected) {
        ids[s] = i;
        const base = s * 24, k = i * 8;
        records.set(mesh.v.subarray(k, k + 8), base);
        let x = 0, y = 0, z = 0, count = 0;
        for (let j = mesh.neighborOffsets[i]; j < mesh.neighborOffsets[i + 1]; j++) {
            const a = mesh.neighbors[j] * 8;
            x += mesh.v[a];
            y += mesh.v[a + 1];
            z += mesh.v[a + 2];
            count++;
        }
        records.set(count ? [x / count, y / count, z / count, mesh.boundary[i]] : [...mesh.pos(i), 1], base + 8);
        records.set([...c.point, settings.radius], base + 12);
        records.set([...c.normal, settings.sign], base + 16);
        records.set([...c.delta, settings.strength * settings.pressure], base + 20);
        s++;
    }
    return { ids, records };
}
export class Stroke {
    constructor(object, label) { this.object = object; this.level = object.level; this.label = label; this.before = new Map(); }
    capture(ids) { const v = this.object.mesh.v; for (const i of ids)
        if (!this.before.has(i))
            this.before.set(i, v.slice(i * 8, i * 8 + 4)); }
    cancel() { const m = this.object.levels[this.level]; for (const [i, p] of this.before)
        m.v.set(p, i * 8); m.modified([...this.before.keys()]); }
    finish() {
        const m = this.object.levels[this.level], ids = [], before = [], after = [];
        for (const [i, p] of this.before) {
            const q = m.v.subarray(i * 8, i * 8 + 4);
            if (p.some((x, j) => x !== q[j])) {
                ids.push(i);
                before.push(...p);
                after.push(...q);
            }
        }
        if (!ids.length)
            return null;
        const patches = [{ level: this.level, ids: new Uint32Array(ids), before: new Float32Array(before), after: new Float32Array(after) }];
        // Prolongate low-level deltas through Loop stencils without discarding high-level detail.
        for (let level = this.level + 1; level < this.object.levels.length; level++) {
            const prev = patches.at(-1), tr = this.object.transitions[level - 1], mesh = this.object.levels[level];
            if (!tr)
                break;
            const deltas = new Map();
            for (let j = 0; j < prev.ids.length; j++) {
                const b = j * 4;
                deltas.set(prev.ids[j], [prev.after[b] - prev.before[b], prev.after[b + 1] - prev.before[b + 1], prev.after[b + 2] - prev.before[b + 2], prev.after[b + 3] - prev.before[b + 3]]);
            }
            const ci = [], cb = [], ca = [];
            for (let i = 0; i < mesh.count; i++) {
                const d = [0, 0, 0, 0];
                let touched = false;
                for (let j = tr.offsets[i]; j < tr.offsets[i + 1]; j++) {
                    const v = deltas.get(tr.ids[j]);
                    if (v) {
                        touched = true;
                        for (let k = 0; k < 4; k++)
                            d[k] += v[k] * tr.weights[j];
                    }
                }
                if (touched) {
                    const k = i * 8;
                    ci.push(i);
                    cb.push(...mesh.v.subarray(k, k + 4));
                    for (let j = 0; j < 3; j++)
                        mesh.v[k + j] += d[j];
                    mesh.v[k + 3] = clamp(mesh.v[k + 3] + d[3]);
                    ca.push(...mesh.v.subarray(k, k + 4));
                }
            }
            mesh.modified(ci);
            patches.push({ level, ids: new Uint32Array(ci), before: new Float32Array(cb), after: new Float32Array(ca) });
        }
        const object = this.object;
        return { label: this.label, bytes: patches.reduce((n, p) => n + p.ids.byteLength + p.before.byteLength + p.after.byteLength, 0), patches, apply(forward) { for (const p of patches) {
                const mesh = object.levels[p.level], values = forward ? p.after : p.before;
                for (let j = 0; j < p.ids.length; j++)
                    mesh.v.set(values.subarray(j * 4, j * 4 + 4), p.ids[j] * 8);
                mesh.modified(p.ids);
            } object.level = patches[0].level; } };
    }
}
export class History {
    constructor(limit = 128 * 1024 * 1024) { this.limit = limit; this.past = []; this.future = []; this.bytes = 0; }
    push(command) { if (!command)
        return; this.future = []; this.bytes = this.past.reduce((n, c) => n + c.bytes, 0); if (command.bytes > this.limit) {
        this.past = [];
        this.bytes = 0;
        this.overflow = true;
        return false;
    } this.overflow = false; this.past.push(command); this.bytes += command.bytes; while (this.bytes > this.limit && this.past.length) {
        this.bytes -= this.past.shift().bytes;
    } return true; }
    undo() { const c = this.past.pop(); if (c) {
        c.apply(false);
        this.future.push(c);
    } return c; }
    redo() { const c = this.future.pop(); if (c) {
        c.apply(true);
        this.past.push(c);
    } return c; }
    clear() { this.past = []; this.future = []; this.bytes = 0; }
}
