export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = a => mul(a, 1 / (Math.hypot(...a) || 1));
export const identity = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
export function mmul(a, b) { const r = new Float32Array(16); for (let c = 0; c < 4; c++)
    for (let row = 0; row < 4; row++)
        for (let k = 0; k < 4; k++)
            r[c * 4 + row] += a[k * 4 + row] * b[c * 4 + k]; return r; }
export function transform(m, p) { const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15]; return [(m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w, (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w, (m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]) / w]; }
export function inverse(m) { const a = Array.from({ length: 4 }, (_, i) => Array.from({ length: 8 }, (_, j) => j < 4 ? m[j * 4 + i] : (j - 4 === i ? 1 : 0))); for (let i = 0; i < 4; i++) {
    let p = i;
    for (let j = i + 1; j < 4; j++)
        if (Math.abs(a[j][i]) > Math.abs(a[p][i]))
            p = j;
    if (Math.abs(a[p][i]) < 1e-14)
        throw Error('Singular transform');
    [a[i], a[p]] = [a[p], a[i]];
    const d = a[i][i];
    for (let k = 0; k < 8; k++)
        a[i][k] /= d;
    for (let j = 0; j < 4; j++)
        if (j !== i) {
            const t = a[j][i];
            for (let k = 0; k < 8; k++)
                a[j][k] -= t * a[i][k];
        }
} return new Float32Array(Array.from({ length: 16 }, (_, i) => a[i % 4][4 + Math.floor(i / 4)])); }
export function compose(n) { if (n.matrix)
    return new Float32Array(n.matrix); const [x, y, z, w] = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1], t = n.translation || [0, 0, 0]; return new Float32Array([(1 - 2 * (y * y + z * z)) * s[0], 2 * (x * y + w * z) * s[0], 2 * (x * z - w * y) * s[0], 0, 2 * (x * y - w * z) * s[1], (1 - 2 * (x * x + z * z)) * s[1], 2 * (y * z + w * x) * s[1], 0, 2 * (x * z + w * y) * s[2], 2 * (y * z - w * x) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0, ...t, 1]); }
export class Camera {
    constructor() { this.target = [0, -.05, 0]; this.yaw = .28; this.pitch = .06; this.distance = 6; this.fov = .55; this.ortho = false; this.aspect = 1; }
    update(w, h, webgpu = true) { this.aspect = w / h; const cp = Math.cos(this.pitch); this.eye = add(this.target, [Math.sin(this.yaw) * cp * this.distance, Math.sin(this.pitch) * this.distance, Math.cos(this.yaw) * cp * this.distance]); this.back = norm(sub(this.eye, this.target)); this.right = norm(cross([0, 1, 0], this.back)); this.up = cross(this.back, this.right); const r = this.right, u = this.up, b = this.back, e = this.eye; this.view = new Float32Array([r[0], u[0], b[0], 0, r[1], u[1], b[1], 0, r[2], u[2], b[2], 0, -dot(r, e), -dot(u, e), -dot(b, e), 1]); const n = .01, f = 1000, p = new Float32Array(16), t = Math.tan(this.fov / 2); if (this.ortho) {
        const hh = this.distance * t;
        p[0] = 1 / (hh * this.aspect);
        p[5] = 1 / hh;
        p[10] = webgpu ? 1 / (n - f) : 2 / (n - f);
        p[14] = webgpu ? n / (n - f) : (n + f) / (n - f);
        p[15] = 1;
    }
    else {
        p[0] = 1 / (t * this.aspect);
        p[5] = 1 / t;
        p[10] = webgpu ? f / (n - f) : (f + n) / (n - f);
        p[11] = -1;
        p[14] = webgpu ? f * n / (n - f) : 2 * f * n / (n - f);
    } this.vp = mmul(p, this.view); this.invVP = inverse(this.vp); return this.vp; }
    ray(x, y, w, h) { const nx = 2 * x / w - 1, ny = 1 - 2 * y / h; const a = transform(this.invVP, [nx, ny, 0]), b = transform(this.invVP, [nx, ny, 1]); return { o: this.ortho ? a : this.eye, d: norm(sub(b, a)) }; }
    worldRadius(px, h, point) { const depth = this.ortho ? this.distance : dot(sub(this.eye, point), this.back); return px * 2 * Math.max(.01, depth) * Math.tan(this.fov / 2) / h; }
    pan(dx, dy, h) { this.target = add(this.target, add(mul(this.right, -dx * this.worldRadius(1, h, this.target)), mul(this.up, dy * this.worldRadius(1, h, this.target)))); }
}
