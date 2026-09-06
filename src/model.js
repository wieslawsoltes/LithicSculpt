import { Mesh, icosphere, lathe } from './mesh.js';
import { clamp } from './math.js';
export const MATERIALS = [
    { name: 'Warm clay', color: [.30, .135, .068], roughness: .65, metallic: 0, swatch: '#ae7a59' },
    { name: 'Porcelain', color: [.69, .72, .7], roughness: .23, metallic: 0, swatch: '#d8dbd6' },
    { name: 'Graphite', color: [.075, .09, .105], roughness: .38, metallic: .25, swatch: '#606770' },
    { name: 'Bronze', color: [.38, .225, .075], roughness: .29, metallic: .78, swatch: '#b58c42' },
    { name: 'Red wax', color: [.43, .065, .045], roughness: .48, metallic: 0, swatch: '#a84236' },
    { name: 'Silver', color: [.63, .66, .69], roughness: .19, metallic: .95, swatch: '#a7b5c3' }
];
export class SculptObject {
    constructor(name, mesh, material = 0) { this.id = globalThis.crypto?.randomUUID?.() || `object-${Date.now()}-${Math.random().toString(36).slice(2)}`; this.name = name; this.levels = [mesh]; this.transitions = []; this.level = 0; this.material = material; this.visible = true; this.origin = [0, 0, 0]; }
    get mesh() { return this.levels[this.level]; }
}
const g = (x, y, cx, cy, sx, sy) => Math.exp(-1 * ((x - cx) / sx) ** 2 - ((y - cy) / sy) ** 2);
export function createDemo() {
    const head = icosphere(6, p => {
        let [u, v, w] = p;
        let x = u * (.80 - .14 * Math.exp(-1 * ((v + .54) / .35) ** 2)), y = v * 1.08 + .48, z = w * .66;
        const front = clamp(w / .45);
        let d = 0;
        for (const side of [-1, 1]) {
            d -= .15 * g(x, y, side * .32, .63, .205, .128);
            const ex = (x - side * .32) / .18, ey = (y - .63) / .086, ring = Math.sqrt(ex * ex + ey * ey);
            d += .037 * Math.exp(-1 * ((ring - 1) / .22) ** 2);
            d += .125 * g(x, y, side * .32, .80 + Math.abs(x) * .06, .28, .09);
            d += .092 * g(x, y, side * .47, .40, .20, .21);
            d -= .052 * g(x, y, side * .47, .15, .15, .19);
            d += .075 * g(x, y, side * .105, .32, .09, .062);
            d -= .053 * g(x, y, side * .09, .285, .047, .026);
            d -= .032 * g(x, y, side * .23, .19, .04, .13);
        }
        d += .15 * g(x, y, 0, .58, .087, .28) + .27 * g(x, y, 0, .35, .095, .095);
        d += .08 * g(x, y, 0, .175, .235, .038) + .073 * g(x, y, 0, .082, .21, .045);
        const lip = .122 - .035 * (x / .25) ** 2;
        d -= .06 * g(x, y, 0, lip, .25, .018);
        d -= .032 * g(x, y, 0, .225, .042, .068);
        d += .13 * g(x, y, 0, -.12, .26, .13);
        d += .0012 * Math.sin(x * 90 + y * 37) * Math.sin(y * 70) * g(x, y, 0, .35, .70, .85);
        z += d * front;
        return [x, y, z];
    });
    const neck = lathe(t => { const y = -1.69 + t * 1.35; const rx = .28 + .89 * Math.exp(-1 * ((t - .25) / .32) ** 2), rz = .275 + .15 * Math.exp(-1 * ((t - .23) / .36) ** 2); return [y, rx, rz]; }, 64, 128);
    for (let i = 0; i < neck.count; i++) {
        const k = i * 8, x = neck.v[k], y = neck.v[k + 1], z = neck.v[k + 2];
        if (z > 0) {
            neck.v[k + 2] += .06 * Math.exp(-1 * ((Math.abs(x) - (.2 + .28 * (-y - .4))) / .065) ** 2) * Math.exp(-1 * ((y + .82) / .5) ** 2);
            neck.v[k + 2] -= .04 * g(x, y, 0, -1.10, .1, .25);
            neck.v[k + 2] += .045 * g(x, y, 0, -1.32, .85, .05);
        }
    }
    neck.modified();
    const pedestal = lathe(t => [-1.91 + t * .21, .82 + .015 * Math.cos(t * Math.PI * 4), .57 + .01 * Math.cos(t * Math.PI * 4)], 8, 128);
    const objects = [new SculptObject('Sentinel · head', head), new SculptObject('Shoulders & neck', neck), new SculptObject('Oval plinth', pedestal)];
    for (const s of [-1, 1]) {
        const ear = icosphere(4, p => { let x = s * (.741 + p[0] * .118), y = .51 + p[1] * .229, z = .005 + p[2] * .13; if (p[2] > 0)
            z -= .087 * g(p[0], p[1], 0, 0, .66, .7); return [x, y, z]; });
        objects.push(new SculptObject(s < 0 ? 'Ear · left' : 'Ear · right', ear));
        const eye = icosphere(4, p => [s * .318 + p[0] * .122, .63 + p[1] * .074, .497 + p[2] * .111]);
        objects.push(new SculptObject(s < 0 ? 'Eye · left' : 'Eye · right', eye));
    }
    return objects;
}
export function createPrimitive(kind = 'sphere') {
    if (kind === 'bust')
        return createDemo();
    let mesh;
    if (kind === 'torus') {
        const p = [], idx = [], nu = 96, nv = 48;
        for (let j = 0; j < nv; j++)
            for (let i = 0; i < nu; i++) {
                const u = i / nu * Math.PI * 2, v = j / nv * Math.PI * 2, r = .72 + .28 * Math.cos(v);
                p.push(r * Math.cos(u), .28 * Math.sin(v), r * Math.sin(u));
            }
        for (let j = 0; j < nv; j++)
            for (let i = 0; i < nu; i++) {
                const a = j * nu + i, b = j * nu + (i + 1) % nu, c = ((j + 1) % nv) * nu + i, d = ((j + 1) % nv) * nu + (i + 1) % nu;
                idx.push(a, c, b, b, c, d);
            }
        mesh = new Mesh(p, idx);
    }
    else if (kind === 'cube') {
        mesh = icosphere(5, p => { const m = Math.max(...p.map(Math.abs)); return p.map(v => v * (.92 / m * .86 + .14)); });
    }
    else
        mesh = icosphere(5);
    return [new SculptObject(kind[0].toUpperCase() + kind.slice(1), mesh)];
}
export function objectBytes(o) { return o.levels.reduce((n, m) => n + m.v.byteLength + m.indices.byteLength, 0) + o.transitions.reduce((n, t) => n + t.offsets.byteLength + t.ids.byteLength + t.weights.byteLength, 0); }
export function captureTopology(o) { return { levels: [...o.levels], transitions: [...o.transitions], level: o.level }; }
export function topologyCommand(o, before, label) { const after = captureTopology(o); return { label, bytes: [...new Set([...before.levels, ...after.levels])].reduce((n, m) => n + m.v.byteLength + m.indices.byteLength, 0), apply(forward) { Object.assign(o, forward ? after : before); } }; }
