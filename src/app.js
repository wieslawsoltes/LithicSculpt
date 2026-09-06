import { clamp, Camera, add, sub, mul, dot, norm, transform } from './math.js';
import { Mesh, icosphere } from './mesh.js';
import { BRUSHES, brushSamples, deformCPU, Stroke, History, falloff } from './sculpt.js';
import { subdivide } from './topology.js';
import { MATERIALS, SculptObject, createDemo, createPrimitive, objectBytes, captureTopology, topologyCommand } from './model.js';
import { Renderer } from './render.js';
import { download, importOBJ, exportOBJ, importGLTF, exportGLTF, serializeProject, deserializeProject, storage } from './io.js';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICONS = { save: 'M5 3h12l4 4v14H3V3h2zm2 0v6h10V3M7 21v-8h10v8', export: 'M12 15V3m-4 4 4-4 4 4M5 12v8h14v-8', import: 'M12 3v12m-4-4 4 4 4-4M5 16v5h14v-5', brush: 'm14 3 7 7-9 9-7-7 9-9zM5 12c-5 2 1 6-3 9 7 0 7-2 10-3', move: 'M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3', chip: 'M7 7h10v10H7zM9 2v5m6-5v5M9 17v5m6-5v5M2 9h5m-5 6h5m10-6h5m-5 6h5', search: 'M17 17l5 5M19 10a9 9 0 1 1-18 0 9 9 0 0 1 18 0', sculpture: 'M9 3h6l3 4-2 8 4 3v3H4v-3l4-3-2-8 3-4zM9 9h1m4 0h1m-5 3h4', expand: 'M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6', frame: 'M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5M8 8h8v8H8z', orbit: 'M21 12a9 9 0 0 1-9 9M3 12a9 9 0 0 1 9-9M18 8l3 4 2-4M6 16l-3-4-2 4M8 12a4 4 0 1 0 8 0 4 4 0 0 0-8 0', hand: 'M6 12V7a2 2 0 0 1 4 0V4a2 2 0 0 1 4 0v3a2 2 0 0 1 4 0v2a2 2 0 0 1 4 0v6c0 5-3 7-7 7-5 0-6-2-8-5l-3-4c-1-2 1-3 3-1l2 2', wire: 'm12 2 10 6v9l-10 5L2 17V8l10-6zM2 8l10 6 10-6M12 14v8M12 2v12M2 17l10-3 10 3', grid: 'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18', play: 'm8 4 12 8-12 8V4z', pause: 'M8 4v16M16 4v16', info: 'M12 11v7m0-12v2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0', copy: 'M8 8h13v13H8zM16 8V3H3v13h5', solo: 'M3 8V3h5m8 0h5v5M3 16v5h5m8 0h5v-5M8 8h8v8H8z', trash: 'M3 6h18M8 6V3h8v3M5 6l1 15h12l1-15M10 10v7m4-7v7', layers: 'm12 2 10 6-10 6L2 8l10-6zm-10 11 10 6 10-6M2 18l10 5 10-5', subdivide: 'M3 3h18v18H3zM3 12h18M12 3v18M3 3l18 18M3 21 21 3', remesh: 'M4 3h16l2 9-6 10H8L2 12l2-9zM4 3l8 9 8-9M2 12h20M8 22l4-10 4 10', mask: 'M3 5c6-3 12-3 18 0v7c0 6-5 10-9 10S3 18 3 12V5zm3 4 4 2m4 0 4-2M9 16h6', smooth: 'M2 15c5 0 4-8 10-8s5 8 10 8M2 21h20', sun: 'M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0', undo: 'M8 4 2 10l6 6M2 10h12a7 7 0 0 1 7 7v4', redo: 'm16 4 6 6-6 6M22 10H10a7 7 0 0 0-7 7v4', eye: 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12zm15 0a4 4 0 1 1-8 0 4 4 0 0 1 8 0', eyeoff: 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12M3 3l18 18', check: 'm4 12 5 5L21 5' };
function icon(name) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[name] || ICONS.info}"/></svg>`; }
function applyIcons(root = document) { root.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon)); }
function brushArt(name, i) { const paths = { draw: 'M15 29C22 27 24 14 33 17S39 26 46 26', clay: 'M14 28 19 21 22 24 27 15 31 22 37 19 44 27', smooth: 'M12 27C22 24 22 16 31 17S39 26 48 24', inflate: 'M15 29C18 29 19 15 30 15S42 29 46 28', pinch: 'M15 23Q31 24 31 10M47 23Q31 24 31 36', flatten: 'M12 27 21 21H39L48 27', grab: 'M14 30Q29 26 39 12L37 24Q46 28 48 28', mask: 'M18 30C11 20 24 12 33 16S47 29 37 34Z' }; return `<svg class="brush-art" viewBox="0 0 62 43" aria-hidden="true"><defs><radialGradient id="ball-${i}" cx="35%" cy="23%" r="78%"><stop stop-color="#c0c0bc"/><stop offset=".42" stop-color="#878985"/><stop offset=".8" stop-color="#494b49"/><stop offset="1" stop-color="#383b3a"/></radialGradient><filter id="soft-${i}"><feGaussianBlur stdDeviation="1.3"/></filter></defs><ellipse cx="31" cy="37" rx="23" ry="3" fill="#151618" opacity=".35"/><path d="M8 29C7 14 17 5 31 5S55 17 54 29C51 41 12 41 8 29Z" fill="url(#ball-${i})"/><path d="${paths[name]}" stroke="#292c29" fill="${name === 'mask' ? '#313533' : 'none'}" stroke-width="${name === 'clay' ? 6 : 3}" stroke-linejoin="round" filter="url(#soft-${i})"/><path d="${paths[name]}" stroke="${name === 'mask' ? '#39423d' : '#d0d0c5'}" fill="none" stroke-width="1.2" transform="translate(0,-1)" opacity=".65"/></svg>`; }
const KEYS = ['Q', 'W', 'E', 'R', 'T', 'Y', 'G', 'M'];
$('#brush-grid').innerHTML = BRUSHES.map((b, i) => `<button class="brush-card ${i === 0 ? 'active' : ''}" data-brush="${b}" title="${b[0].toUpperCase() + b.slice(1)} brush (${KEYS[i]})"><span class="brush-key">${KEYS[i]}</span>${brushArt(b, i)}<span class="brush-label">${b[0].toUpperCase() + b.slice(1)}</span></button>`).join('');
$('#material-grid').innerHTML = MATERIALS.map((m, i) => `<button data-material="${i}" title="${m.name}" class="${i === 0 ? 'active' : ''}"><span class="material-ball" style="--ball:${m.swatch}"></span></button>`).join('');
applyIcons();
let objects = [], active = null, title = 'Sentinel — clay study', dirty = true, ready = false, modified = false, busy = false, stroke = null, processing = false, ending = false, canceled = false, pending = [], pointerMode = null, navMode = null, turntable = false, soloRestore = null;
const camera = new Camera();
Object.assign(camera, { distance: 7.05, pitch: .035, yaw: .25, target: [0, -.16, 0] });
const settings = { brush: 'draw', radius: 48, intensity: 45, sign: 1, falloff: 0, symmetry: [true, false, false], pressure: true, frontOnly: true, resolution: 36 };
const history = new History(), canvas = $('#canvas'), viewport = $('#viewport'), overlay = $('#overlay');
let toastTimer, saveTimer, operation = null, lastMouse = null, lastInput = null, hover = null, rafTime = 0, metricsTime = 0, space = false, pointerID = null, lastNav = null, gesture = null;
const pointers = new Map();
function toast(text, error = false) { const el = $('#toast'); el.textContent = text; el.className = 'toast visible' + (error ? ' error' : ''); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('visible'), error ? 6500 : 3500); }
const renderer = new Renderer(canvas, (message, error) => { if (error && ready)
    toast(message, true); $('#status-message').textContent = message; });
function format(n) { return n.toLocaleString('en-US'); }
function bytes(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1024).toFixed(1) + ' KB'; }
function changed() { modified = true; $('#unsaved-dot').style.visibility = 'visible'; $('#save-status').textContent = 'Unsaved changes'; dirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(autosave, 1600); }
function commit(command) { if (!command)
    return; const kept = history.push(command); if (kept === false)
    toast('Change applied, but exceeds the 128 MB history budget. Earlier undo history was cleared.', true); changed(); updateUI(); }
function isIdle() { if (!ready)
    return false; if (busy || stroke || processing) {
    toast('Finish the current stroke or topology operation first.');
    return false;
} return true; }
function selectObject(o) { active = o; dirty = true; updateUI(); }
function updateUI() {
    if (!active)
        return;
    $('#project-tab').textContent = title;
    $('#selected-name').textContent = active.name;
    $('#object-count').textContent = objects.length;
    $('#object-list').innerHTML = objects.map(o => `<div class="object-row ${o === active ? 'selected' : ''} ${!o.visible ? 'hidden-object' : ''}" data-object="${esc(o.id)}"><span class="object-thumb"></span><button class="object-select" title="${esc(o.name)} · Double-click to rename" data-select="${esc(o.id)}">${esc(o.name)}</button><span class="object-level">L${o.level + 1}</span><button class="object-visibility" data-visible="${esc(o.id)}" title="${o.visible ? 'Hide' : 'Show'} object">${icon(o.visible ? 'eye' : 'eyeoff')}</button></div>`).join('');
    const m = active.mesh;
    $('#mesh-info').textContent = `${format(m.count)} vertices · ${format(m.faces)} triangles`;
    $('#total-count').textContent = `${format(objects.reduce((n, o) => n + o.mesh.count, 0))} points · ${objects.length} objects`;
    $('#level-number').textContent = `${active.level + 1} / ${active.levels.length}`;
    $('#level-down').disabled = !active.level;
    $('#level-up').disabled = active.level >= active.levels.length - 1;
    $('#level-track i').style.left = (active.levels.length > 1 ? active.level / (active.levels.length - 1) * 96 : 0) + '%';
    $('#history-memory').textContent = bytes(history.bytes);
    $('#history-list').innerHTML = history.past.length ? history.past.slice(-3).map(c => `<div class="history-entry">${esc(c.label)}<small>${bytes(c.bytes)}</small></div>`).join('') : '<span class="history-empty">Your next mark starts here.</span>';
    $('#undo-button').disabled = !history.past.length;
    $('#redo-button').disabled = !history.future.length;
    const d = m.diagnostics;
    $('#topology-status').textContent = d.nonManifoldEdges ? '● Non-manifold edges' : d.boundaryEdges ? '● Open surface' : '● Manifold mesh';
    $('#topology-status').style.color = d.nonManifoldEdges || d.boundaryEdges ? '#d0ad78' : '#9fae96';
    $$('[data-brush]').forEach(el => el.classList.toggle('active', el.dataset.brush === settings.brush));
    $$('[data-material]').forEach(el => el.classList.toggle('active', !active.customMaterial && Number(el.dataset.material) === active.material));
    $('#material-name').textContent = active.customMaterial?.name || MATERIALS[active.material]?.name || 'Warm clay';
    for (let i = 0; i < 3; i++)
        $('#sym-' + ['x', 'y', 'z'][i]).classList.toggle('active', settings.symmetry[i]);
    $('#add-mode').classList.toggle('active', settings.sign === 1);
    $('#sub-mode').classList.toggle('active', settings.sign === -1);
    $('#radius').value = settings.radius;
    $('#radius-value').textContent = settings.radius;
    $('#intensity').value = settings.intensity;
    $('#intensity-value').textContent = settings.intensity;
    $('#falloff').value = settings.falloff;
    $('#pressure').checked = settings.pressure;
    $('#front-only').checked = settings.frontOnly;
    $('#remesh-resolution').value = settings.resolution;
    $('#resolution-value').textContent = settings.resolution;
    $('#wire-button').classList.toggle('active', renderer.wire);
    $('#turntable-button').classList.toggle('active', turntable);
    $('#solo-button').classList.toggle('active', !!soloRestore);
    $('#orbit-button').classList.toggle('active', navMode === 'orbit');
    $('#pan-button').classList.toggle('active', navMode === 'pan');
    $('#gpu-text').textContent = renderer.backend === 'WebGPU' ? (renderer.computeEnabled ? 'WebGPU compute' : 'WebGPU · CPU brush') : 'WebGL2 fallback';
    $('#projection').innerHTML = (camera.ortho ? 'Orthographic' : 'Perspective') + ' <span>⌄</span>';
    $$('input[type=range]').forEach(updateRange);
    renderer.collect(objects);
}
function updateRange(el) { const pct = (el.value - el.min) / (el.max - el.min) * 100; el.style.background = `linear-gradient(90deg,var(--accent) ${pct}%,#444549 ${pct}%)`; }
function setBrush(brush) { if (!BRUSHES.includes(brush))
    return; settings.brush = brush; navMode = null; updateUI(); $('#canvas-help').innerHTML = brush === 'mask' ? '<kbd>Drag</kbd> Mask <span>·</span> <kbd>Alt</kbd> Unmask <span>·</span> <kbd>Ctrl</kbd> Temporary mask' : '<kbd>Drag</kbd> Sculpt <span>·</span> <kbd>Shift</kbd> Smooth <span>·</span> <kbd>Alt</kbd> Subtract'; }
function showDialog(name, html) { $('#dialog-title').textContent = name; $('#dialog-content').innerHTML = html; applyIcons($('#dialog')); $('#dialog').showModal(); }
function closeDialog() { $('#dialog').close(); }
function setTitle(next) { title = next; $('#scene-title').textContent = next.split('—')[0].trim(); $('#scene-subtitle').textContent = 'Digital clay · Studio lighting'; $('#project-tab').textContent = title; }
function frame(all = false) { if (!active)
    return; const list = all ? objects.filter(o => o.visible) : [active], min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]; for (const o of list) {
    const b = o.mesh.bounds();
    for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], b.min[i]);
        max[i] = Math.max(max[i], b.max[i]);
    }
} if (!Number.isFinite(min[0]))
    return; camera.target = mul(add(min, max), .5); const extent = sub(max, min), aspect = canvas.clientWidth / canvas.clientHeight; camera.distance = Math.max(.25, Math.max(extent[1], extent[0] / aspect, extent[2] * .6) * .62 / Math.tan(camera.fov / 2) + extent[2] * .3); dirty = true; }
function pick(x, y, all = true) { const ray = camera.ray(x, y, canvas.clientWidth, canvas.clientHeight); let hit = null, best = Infinity; for (const o of all ? objects : [active]) {
    if (!o?.visible)
        continue;
    const h = o.mesh.bvh.ray(ray.o, ray.d);
    if (h && h.t < best) {
        best = h.t;
        hit = { ...h, object: o };
    }
} return hit; }
function point(e) { const rect = canvas.getBoundingClientRect(); return { x: e.clientX - rect.left, y: e.clientY - rect.top, pressure: e.pointerType === 'pen' && settings.pressure ? clamp(e.pressure, 0, 1) : 1, alt: e.altKey, shift: e.shiftKey, ctrl: e.ctrlKey, pen: e.pointerType === 'pen' }; }
function pointerHover(p) { lastMouse = p; if (busy || navMode || pointerMode === 'orbit' || pointerMode === 'pan') {
    $('#brush-cursor').hidden = true;
    return;
} hover = pick(p.x, p.y); const cursor = $('#brush-cursor'); cursor.hidden = !hover; if (hover) {
    cursor.style.left = p.x + 'px';
    cursor.style.top = p.y + 'px';
    cursor.style.width = cursor.style.height = settings.radius * 2 + 'px';
    cursor.classList.toggle('subtract', p.alt ? settings.sign > 0 : settings.sign < 0);
} drawOverlay(); }
function drawOverlay() { const dpr = Math.min(devicePixelRatio || 1, 2), w = canvas.clientWidth, h = canvas.clientHeight; if (overlay.width !== Math.round(w * dpr) || overlay.height !== Math.round(h * dpr)) {
    overlay.width = Math.round(w * dpr);
    overlay.height = Math.round(h * dpr);
} const ctx = overlay.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h); if (!hover || !lastMouse || busy)
    return; if (settings.symmetry[0]) {
    const p = [...hover.point];
    p[0] = 2 * hover.object.origin[0] - p[0];
    const ndc = transform(camera.vp, p), x = (ndc[0] + 1) * w / 2, y = (1 - ndc[1]) * h / 2;
    if (Math.hypot(x - lastMouse.x, y - lastMouse.y) > 5) {
        ctx.strokeStyle = '#dcb08b65';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.arc(x, y, settings.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
    }
} }
function eventSample(p) { return { ...p, brush: p.shift ? 'smooth' : p.ctrl ? 'mask' : settings.brush }; }
function enqueue(p, first = false) {
    if (!stroke || ending)
        return;
    const sample = eventSample(p);
    if (first || !lastInput) {
        pending.push(sample);
        lastInput = sample;
    }
    else {
        const dx = p.x - lastInput.x, dy = p.y - lastInput.y, dist = Math.hypot(dx, dy), spacing = Math.max(2, settings.radius * .16);
        if (sample.brush === 'grab') {
            pending.splice(0, pending.length, sample);
            lastInput = sample;
        }
        else if (dist >= spacing) {
            const n = Math.min(48, Math.floor(dist / spacing));
            for (let i = 1; i <= n; i++) {
                const t = Math.min(1, i * spacing / dist);
                pending.push({ ...sample, x: lastInput.x + dx * t, y: lastInput.y + dy * t, pressure: lastInput.pressure + (sample.pressure - lastInput.pressure) * t });
            }
            lastInput = pending.at(-1);
            if (pending.length > 128)
                pending = pending.filter((_, i) => i % 2 === 0);
        }
    }
    if (!processing)
        processQueue();
}
async function applyDab(p) {
    if (!stroke)
        return;
    const obj = stroke.object, mesh = obj.mesh;
    const grab = stroke.label === 'Grab stroke';
    let hit = grab ? stroke.anchor : pick(p.x, p.y, true);
    if (!hit || hit.object !== obj)
        return;
    const local = { ...settings, radius: grab ? stroke.radius : camera.worldRadius(settings.radius, canvas.clientHeight, hit.point), strength: settings.intensity / 100, pressure: p.pressure, sign: p.alt ? -settings.sign : settings.sign, frontOnly: settings.frontOnly };
    let data, mode = BRUSHES.indexOf(p.brush);
    if (grab) {
        mode = 6;
        if (!stroke.grab) {
            const initial = brushSamples(mesh, hit, local, [1, 1, 1], obj.origin);
            stroke.grab = initial;
            stroke.grabSigns = initial.records.slice();
            stroke.capture(initial.ids);
        }
        data = stroke.grab;
        const ray = camera.ray(p.x, p.y, canvas.clientWidth, canvas.clientHeight), den = dot(ray.d, stroke.planeNormal);
        if (Math.abs(den) < 1e-8)
            return;
        const distance = dot(sub(hit.point, ray.o), stroke.planeNormal) / den, planePoint = add(ray.o, mul(ray.d, distance)), delta = sub(planePoint, hit.point);
        for (let i = 0; i < data.ids.length; i++) {
            const k = i * 24;
            for (let j = 0; j < 3; j++)
                data.records[k + 20 + j] = stroke.grabSigns[k + 20 + j] * delta[j];
        }
    }
    else {
        data = brushSamples(mesh, hit, local, [0, 0, 0], obj.origin);
        stroke.capture(data.ids);
    }
    if (!data.ids.length)
        return;
    let out;
    try {
        out = await renderer.deform(data.records, mode, settings.falloff);
    }
    catch (error) {
        renderer.computeEnabled = false;
        out = deformCPU(data.records, mode, settings.falloff);
        toast('GPU brush disabled after an error; stroke continued on CPU. ' + error.message, true);
    }
    for (let i = 0; i < data.ids.length; i++) {
        const k = i * 4;
        if (!Number.isFinite(out[k]) || !Number.isFinite(out[k + 1]) || !Number.isFinite(out[k + 2]) || !Number.isFinite(out[k + 3]))
            throw Error('Non-finite deformation rejected.');
    }
    for (let i = 0; i < data.ids.length; i++)
        mesh.v.set(out.subarray(i * 4, i * 4 + 4), data.ids[i] * 8);
    mesh.modified(data.ids);
    dirty = true;
}
async function processQueue() { processing = true; let count = 0; try {
    while (pending.length && !canceled) {
        await applyDab(pending.shift());
        if (++count % 6 === 0)
            await new Promise(requestAnimationFrame);
    }
}
catch (error) {
    toast(error.message, true);
    canceled = true;
}
finally {
    processing = false;
    if (ending || canceled)
        finishStroke();
} }
function finishStroke() { if (processing)
    return; const s = stroke; if (!s)
    return; stroke = null; pending = []; ending = false; if (canceled) {
    s.cancel();
    canceled = false;
    dirty = true;
    toast('Stroke canceled.');
}
else {
    const command = s.finish();
    commit(command);
} pointerMode = null; lastInput = null; updateUI(); }
function endStroke(cancel = false) { if (!stroke)
    return; ending = true; canceled = cancel; if (cancel)
    pending = []; if (!processing)
    finishStroke(); }
function setCameraView(yaw, pitch) { camera.yaw = yaw; camera.pitch = pitch; dirty = true; }
function panZoomGesture() { const values = [...pointers.values()]; if (values.length < 2)
    return; const [a, b] = values, center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance = Math.hypot(a.x - b.x, a.y - b.y); if (gesture) {
    camera.distance = clamp(camera.distance * gesture.distance / Math.max(1, distance), .05, 200);
    camera.pan(center.x - gesture.center.x, center.y - gesture.center.y, canvas.clientHeight);
    dirty = true;
} gesture = { center, distance }; }
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
    if (!ready || busy || $('#dialog').open)
        return;
    const p = point(e);
    pointers.set(e.pointerId, p);
    canvas.setPointerCapture(e.pointerId);
    if (pointers.size > 1) {
        endStroke();
        pointerMode = 'gesture';
        panZoomGesture();
        return;
    }
    if (stroke || processing)
        return;
    pointerID = e.pointerId;
    lastNav = p;
    if (e.button === 2 || e.button === 1 || space || navMode) {
        pointerMode = e.button === 1 || e.shiftKey || navMode === 'pan' ? 'pan' : 'orbit';
        $('#brush-cursor').hidden = true;
        return;
    }
    if (e.button !== 0)
        return;
    const hit = pick(p.x, p.y, true);
    if (!hit) {
        pointerMode = 'orbit';
        return;
    }
    if (hit.object !== active)
        selectObject(hit.object);
    turntable = false;
    const brush = eventSample(p).brush;
    stroke = new Stroke(active, brush[0].toUpperCase() + brush.slice(1) + ' stroke');
    stroke.anchor = hit;
    stroke.radius = camera.worldRadius(settings.radius, canvas.clientHeight, hit.point);
    stroke.planeNormal = [...camera.back];
    pointerMode = 'sculpt';
    ending = false;
    canceled = false;
    lastInput = null;
    enqueue(p, true);
    e.preventDefault();
});
canvas.addEventListener('pointermove', e => {
    if (!ready)
        return;
    const p = point(e);
    if (pointers.has(e.pointerId))
        pointers.set(e.pointerId, p);
    if (pointers.size > 1) {
        panZoomGesture();
        return;
    }
    if (pointerMode === 'orbit' || pointerMode === 'pan') {
        if (lastNav) {
            const dx = p.x - lastNav.x, dy = p.y - lastNav.y;
            if (pointerMode === 'pan')
                camera.pan(dx, dy, canvas.clientHeight);
            else {
                camera.yaw -= dx * .006;
                camera.pitch = clamp(camera.pitch + dy * .006, -1.52, 1.52);
            }
            dirty = true;
        }
        lastNav = p;
        return;
    }
    if (pointerMode === 'sculpt' && stroke) {
        const events = e.getCoalescedEvents?.() || [e];
        for (const coalesced of events.length ? events : [e])
            enqueue(point(coalesced));
    }
    if (!processing || pointerMode !== 'sculpt')
        pointerHover(p);
    else
        lastMouse = p;
});
function pointerEnd(e, cancel = false) { pointers.delete(e.pointerId); if (pointers.size < 2)
    gesture = null; if (e.pointerId === pointerID) {
    endStroke(cancel);
    if (!stroke)
        pointerMode = null;
    pointerID = null;
} if (!pointers.size) {
    if (!stroke)
        pointerMode = null;
    lastNav = null;
    gesture = null;
}
else if (pointerMode === 'gesture') {
    pointerMode = 'orbit';
    lastNav = [...pointers.values()][0];
} try {
    canvas.releasePointerCapture(e.pointerId);
}
catch { } }
canvas.addEventListener('pointerup', e => pointerEnd(e));
canvas.addEventListener('pointercancel', e => pointerEnd(e, true));
canvas.addEventListener('lostpointercapture', e => { if (e.pointerId === pointerID && stroke)
    endStroke(); });
canvas.addEventListener('pointerleave', () => { if (!stroke) {
    hover = null;
    $('#brush-cursor').hidden = true;
    drawOverlay();
} });
canvas.addEventListener('wheel', e => { e.preventDefault(); if (stroke || busy)
    return; camera.distance = clamp(camera.distance * Math.exp(e.deltaY * .001), .05, 200); dirty = true; }, { passive: false });
canvas.addEventListener('dblclick', e => { if (!isIdle())
    return; const p = point(e), h = pick(p.x, p.y); if (h)
    selectObject(h.object); });
function topological(kind) {
    if (!isIdle())
        return;
    const obj = active, m = obj.mesh;
    const before = captureTopology(obj);
    if (kind === 'subdivide' && obj.level < obj.levels.length - 1) {
        obj.level++;
        dirty = true;
        updateUI();
        toast('Existing subdivision level selected.');
        return;
    }
    busy = true;
    $('#operation-progress').hidden = false;
    $('#progress-label').textContent = kind === 'remesh' ? 'Resampling signed-distance surface…' : 'Building Loop subdivision…';
    $('#progress').value = 0;
    $('#brush-cursor').hidden = true;
    let worker, url;
    if (globalThis.__LITHIC_WORKER_SOURCE__) {
        url = URL.createObjectURL(new Blob([globalThis.__LITHIC_WORKER_SOURCE__], { type: 'text/javascript' }));
        worker = new Worker(url);
    }
    else
        worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    const clean = () => { worker.terminate(); if (url)
        URL.revokeObjectURL(url); operation = null; busy = false; $('#operation-progress').hidden = true; dirty = true; };
    operation = { cancel() { clean(); toast('Topology operation canceled; original mesh kept.'); } };
    worker.onmessage = e => { if ('progress' in e.data) {
        $('#progress').value = e.data.progress;
        $('#progress-label').textContent = `Resampling surface · ${Math.round(e.data.progress * 100)}%`;
        return;
    } try {
        if (e.data.error)
            throw Error(e.data.error);
        const result = new Mesh(e.data.vertices, e.data.indices, true);
        if (kind === 'subdivide') {
            obj.levels = [...obj.levels, result];
            obj.transitions = [...obj.transitions, e.data.transition];
            obj.level++;
        }
        else {
            obj.levels = [result];
            obj.transitions = [];
            obj.level = 0;
        }
        commit(topologyCommand(obj, before, kind === 'subdivide' ? 'Loop subdivision' : 'SDF remesh'));
        toast(`${kind === 'subdivide' ? 'Subdivision' : 'Remesh'} complete · ${format(result.count)} vertices`);
    }
    catch (error) {
        toast(error.message, true);
    }
    finally {
        clean();
        updateUI();
    } };
    worker.onerror = e => { clean(); toast('Topology worker failed: ' + e.message, true); };
    worker.postMessage({ id: 1, kind, vertices: m.v, indices: m.indices, resolution: settings.resolution });
}
function changeLevel(delta) { if (!isIdle())
    return; active.level = clamp(active.level + delta, 0, active.levels.length - 1); dirty = true; updateUI(); }
function maskAction(mode) { if (!isIdle())
    return; const s = new Stroke(active, mode === 'clear' ? 'Clear mask' : mode === 'all' ? 'Mask all' : 'Invert mask'), m = active.mesh, ids = Uint32Array.from({ length: m.count }, (_, i) => i); s.capture(ids); for (let i = 0; i < m.count; i++)
    m.v[i * 8 + 3] = mode === 'clear' ? 0 : mode === 'all' ? 1 : 1 - m.v[i * 8 + 3]; m.version++; m.dirty = null; commit(s.finish()); }
async function smoothAll() { if (!isIdle())
    return; busy = true; const obj = active, s = new Stroke(obj, 'Smooth surface'), m = obj.mesh, ids = Uint32Array.from({ length: m.count }, (_, i) => i); s.capture(ids); try {
    for (let pass = 0; pass < 2; pass++) {
        const old = m.v.slice();
        for (let i = 0; i < m.count; i++) {
            if (m.boundary[i])
                continue;
            let x = 0, y = 0, z = 0, n = 0;
            for (let k = m.neighborOffsets[i]; k < m.neighborOffsets[i + 1]; k++) {
                const j = m.neighbors[k] * 8;
                x += old[j];
                y += old[j + 1];
                z += old[j + 2];
                n++;
            }
            if (n) {
                const k = i * 8, a = .45 * (1 - old[k + 3]);
                m.v[k] += (x / n - old[k]) * a;
                m.v[k + 1] += (y / n - old[k + 1]) * a;
                m.v[k + 2] += (z / n - old[k + 2]) * a;
            }
        }
    }
    m.modified();
    commit(s.finish());
    toast('Two mask-aware Jacobi smoothing passes applied.');
}
catch (e) {
    s.cancel();
    toast(e.message, true);
}
finally {
    busy = false;
    dirty = true;
} }
function objectListCommand(before, after, label, oldActive, newActive) { objects = after; active = newActive; return { label, bytes: [...new Set([...before, ...after])].reduce((n, o) => n + objectBytes(o), 0), apply(forward) { objects = forward ? after : before; active = forward ? newActive : oldActive; soloRestore = null; } }; }
function addPrimitive(kind) { if (!isIdle())
    return; if (objects.length >= 100) {
    toast('Object limit reached (100).', true);
    return;
} const list = createPrimitive(kind), o = list[0], maxX = Math.max(...objects.filter(o => o.visible).map(o => o.mesh.bounds().max[0]), 0); const offset = maxX + 1.45; for (const m of o.levels) {
    for (let i = 0; i < m.count; i++)
        m.v[i * 8] += offset;
    m.modified();
} o.origin = [offset, 0, 0]; const before = objects, old = active; commit(objectListCommand(before, [...before, o], 'Add ' + kind, old, o)); frame(true); }
function duplicate() { if (!isIdle())
    return; const o = new SculptObject(active.name + ' copy', active.mesh.clone(), active.material); o.levels = active.levels.map(m => m.clone()); o.transitions = active.transitions.map(t => ({ offsets: t.offsets.slice(), ids: t.ids.slice(), weights: t.weights.slice() })); o.level = active.level; o.customMaterial = active.customMaterial ? structuredClone(active.customMaterial) : undefined; const width = active.mesh.bounds().max[0] - active.mesh.bounds().min[0], dx = width * 1.12; o.origin = add(active.origin, [dx, 0, 0]); for (const m of o.levels) {
    for (let i = 0; i < m.count; i++)
        m.v[i * 8] += dx;
    m.modified();
} commit(objectListCommand(objects, [...objects, o], 'Duplicate object', active, o)); frame(true); }
function deleteObject() { if (!isIdle())
    return; if (objects.length === 1) {
    toast('Keep at least one sculpt object in the project.');
    return;
} const next = objects.filter(o => o !== active); commit(objectListCommand(objects, next, 'Delete object', active, next[0])); }
function solo() { if (!isIdle())
    return; if (soloRestore) {
    for (const o of objects)
        o.visible = soloRestore.get(o.id) ?? true;
    soloRestore = null;
}
else {
    soloRestore = new Map(objects.map(o => [o.id, o.visible]));
    for (const o of objects)
        o.visible = o === active;
} dirty = true; updateUI(); }
function material(index) { if (!isIdle())
    return; const o = active, before = o.material, custom = o.customMaterial; delete o.customMaterial; o.material = index; commit({ label: 'Material · ' + MATERIALS[index].name, bytes: 128, apply(forward) { o.material = forward ? index : before; o.customMaterial = forward ? undefined : custom; } }); }
function transformDialog() { if (!isIdle())
    return; showDialog('Transform sculpt object', `<p>Transforms are baked into every subdivision level. Translation also moves the local symmetry origin. Masks do not constrain whole-object transforms.</p><h3>Translation</h3><div class="transform-grid">${['X', 'Y', 'Z'].map((a, i) => `<label>${a}<input id="tx-${i}" type="number" value="0" step="0.1"></label>`).join('')}</div><h3>Uniform scale</h3><div class="transform-grid"><label>Scale<input id="transform-scale" type="number" value="1" min="0.01" max="100" step="0.1"></label></div><div class="dialog-buttons"><button class="button primary" id="apply-transform">Apply transform</button><button class="button" id="cancel-transform">Cancel</button></div>`); $('#cancel-transform').onclick = closeDialog; $('#apply-transform').onclick = () => { const t = [0, 1, 2].map(i => Number($('#tx-' + i).value)), scale = Number($('#transform-scale').value); if (!t.every(Number.isFinite) || !Number.isFinite(scale) || scale < .01 || scale > 100) {
    toast('Use finite translation and a scale between 0.01 and 100.', true);
    return;
} const o = active, origin = [...o.origin], before = o.levels.map(m => m.v.slice()); for (const m of o.levels) {
    for (let i = 0; i < m.count; i++)
        for (let j = 0; j < 3; j++)
            m.v[i * 8 + j] = origin[j] + (m.v[i * 8 + j] - origin[j]) * scale + t[j];
    m.modified();
} o.origin = add(origin, t); const after = o.levels.map(m => m.v.slice()), newOrigin = [...o.origin]; commit({ label: 'Transform object', bytes: before.reduce((n, v) => n + v.byteLength * 2, 0), apply(forward) { o.levels.forEach((m, i) => { m.v.set((forward ? after : before)[i]); m.modified(); }); o.origin = forward ? newOrigin : origin; } }); closeDialog(); frame(true); }; }
async function autosave() { if (!modified || busy || stroke || processing) {
    if (modified)
        saveTimer = setTimeout(autosave, 1800);
    return;
} try {
    $('#save-status').textContent = 'Saving locally…';
    await storage('put', serializeProject(objects, camera, settings, title));
    $('#save-status').textContent = 'Autosaved on this device';
}
catch (error) {
    $('#save-status').textContent = 'Autosave unavailable';
    toast('Local autosave failed. Save a .lithic project file to retain your work. ' + error.message, true);
} }
function saveProject() { if (!isIdle())
    return; const json = serializeProject(objects, camera, settings, title); download(JSON.stringify(json), filename() + '.lithic', 'application/json'); modified = false; $('#unsaved-dot').style.visibility = 'hidden'; $('#save-status').textContent = 'Project file saved'; storage('put', json).catch(() => { }); toast('Project saved with every object, mask, and subdivision level.'); }
function filename() { return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'lithic-project'; }
function exportDialog() { if (!isIdle())
    return; showDialog('Export your sculpt', `<p>Exports all visible objects at their current subdivision levels. Meshes and normals are computed from your actual sculpt.</p>${[['obj', 'OBJ', 'Geometry + normals · broad compatibility'], ['gltf', 'glTF', 'Embedded geometry + studio materials'], ['glb', 'GLB', 'Binary glTF · single compact file'], ['project', 'LITHIC', 'Editable project · masks + subdivision history']].map(([id, ext, desc]) => `<button class="export-option" data-export="${id}"><span>${ext}</span><div>${id === 'project' ? 'Save complete project' : ext + ' mesh'}<small>${desc}</small></div><span>↗</span></button>`).join('')}<p class="file-note">Geometry interchange only. Sculpt masks, subdivision relationships, UVs, textures, rigs, and animation are not exported to OBJ/glTF. Use .lithic to retain sculpting data.</p>`); $$('[data-export]').forEach(b => b.onclick = async () => { const kind = b.dataset.export; closeDialog(); try {
    if (kind === 'project') {
        saveProject();
        return;
    }
    toast('Preparing ' + kind.toUpperCase() + ' export…');
    await new Promise(requestAnimationFrame);
    if (kind === 'obj')
        download(exportOBJ(objects), filename() + '.obj', 'text/plain');
    else
        download(exportGLTF(objects, kind === 'glb'), filename() + '.' + kind, kind === 'glb' ? 'model/gltf-binary' : 'model/gltf+json');
    toast(kind.toUpperCase() + ' exported.');
}
catch (e) {
    toast(e.message, true);
} }); }
async function importFiles(files) {
    if (!isIdle() || !files.length)
        return;
    busy = true;
    try {
        if (files.reduce((n, f) => n + f.size, 0) > 256 * 1024 * 1024)
            throw Error('Import is limited to 256 MB.');
        const map = new Map(files.map(f => [f.name, f])), main = files.find(f => /\.(obj|gltf|glb|lithic|json)$/i.test(f.name));
        if (!main)
            throw Error('Select an OBJ, glTF, GLB, or .lithic file.');
        toast('Reading ' + main.name + '…');
        await new Promise(requestAnimationFrame);
        const ext = main.name.split('.').at(-1).toLowerCase();
        if (ext === 'lithic' || ext === 'json') {
            const p = deserializeProject(JSON.parse(await main.text()));
            restore(p);
            modified = false;
            $('#unsaved-dot').style.visibility = 'hidden';
            $('#save-status').textContent = 'Project loaded';
            toast('Project restored.');
            return;
        }
        const incoming = ext === 'obj' ? importOBJ(await main.text()) : await importGLTF(ext === 'gltf' ? await main.text() : await main.arrayBuffer(), map);
        for (const o of incoming) {
            const b = o.mesh.bounds();
            o.origin = mul(add(b.min, b.max), .5);
        }
        if (objects.length + incoming.length > 100)
            throw Error('Import exceeds the 100 object limit.');
        commit(objectListCommand(objects, [...objects, ...incoming], 'Import ' + ext.toUpperCase(), active, incoming[0]));
        frame(true);
        toast(`Imported ${incoming.length} mesh object${incoming.length === 1 ? '' : 's'}. UVs/textures are not retained in this geometry workflow.`);
    }
    catch (e) {
        toast(e.message, true);
    }
    finally {
        busy = false;
        dirty = true;
        $('#file-input').value = '';
        updateUI();
    }
}
function restore(p) { objects = p.objects; active = objects[0]; if (p.camera) {
    const c = p.camera;
    if (Array.isArray(c.target) && c.target.length === 3 && c.target.every(Number.isFinite))
        camera.target = c.target;
    for (const k of ['yaw', 'pitch', 'distance', 'fov'])
        if (Number.isFinite(c[k]))
            camera[k] = c[k];
    camera.pitch = clamp(camera.pitch, -1.52, 1.52);
    camera.distance = clamp(camera.distance, .05, 200);
    camera.fov = clamp(camera.fov, .1, 1.8);
    camera.ortho = !!c.ortho;
} if (p.settings) {
    const s = p.settings;
    if (BRUSHES.includes(s.brush))
        settings.brush = s.brush;
    if (Number.isFinite(s.radius))
        settings.radius = clamp(s.radius, 5, 180);
    if (Number.isFinite(s.intensity))
        settings.intensity = clamp(s.intensity, 1, 100);
    if ([0, 1, 2].includes(s.falloff))
        settings.falloff = s.falloff;
    if (Array.isArray(s.symmetry) && s.symmetry.length === 3)
        settings.symmetry = s.symmetry.map(Boolean);
    if ([-1, 1].includes(s.sign))
        settings.sign = s.sign;
    if (typeof s.pressure === 'boolean')
        settings.pressure = s.pressure;
    if (typeof s.frontOnly === 'boolean')
        settings.frontOnly = s.frontOnly;
    if (Number.isFinite(s.resolution))
        settings.resolution = clamp(Math.round(s.resolution), 16, 72);
} setTitle(p.title); history.clear(); soloRestore = null; dirty = true; updateUI(); }
function newDialog() { if (!isIdle())
    return; showDialog('Start a new sculpt', `<p>${modified ? 'Save your current .lithic file before replacing this workspace.' : 'Choose an editable starter mesh. Everything is generated locally.'}</p>${[['bust', 'Sentinel bust', '60.7k vertices · 7 objects'], ['sphere', 'Clay sphere', '10.2k vertices'], ['cube', 'Round cube', '10.2k vertices'], ['torus', 'Torus', '4.6k vertices']].map(([kind, name, desc]) => `<button class="new-choice" data-new="${kind}">${name}<span>${desc}</span></button>`).join('')}<div class="dialog-buttons"><button class="button" id="save-before-new">Save current project</button></div>`); $('#save-before-new').onclick = () => { closeDialog(); saveProject(); }; $$('[data-new]').forEach(b => b.onclick = () => { const kind = b.dataset.new; closeDialog(); objects = createPrimitive(kind); active = objects[0]; history.clear(); soloRestore = null; setTitle(kind === 'bust' ? 'Sentinel — clay study' : kind[0].toUpperCase() + kind.slice(1) + ' — form study'); camera.yaw = .25; camera.pitch = .035; frame(true); changed(); updateUI(); }); }
function addDialog() { if (!isIdle())
    return; showDialog('Add a sculpt object', '<p>New primitives are placed alongside your existing objects.</p>' + ['sphere', 'cube', 'torus'].map(kind => `<button class="new-choice" data-add="${kind}">${kind[0].toUpperCase() + kind.slice(1)}<span>+ Add to scene</span></button>`).join('')); $$('[data-add]').forEach(b => b.onclick = () => { const kind = b.dataset.add; closeDialog(); addPrimitive(kind); }); }
function inspect() { if (!active)
    return; const m = active.mesh, d = m.diagnostics, b = m.bounds(), values = [['Object', active.name], ['Vertices', format(m.count)], ['Triangles', format(m.faces)], ['Boundary edges', format(d.boundaryEdges)], ['Non-manifold edges', format(d.nonManifoldEdges)], ['Degenerate faces (full scan)', String(countDegenerate(m))], ['Vertex + index storage', bytes(m.v.byteLength + m.indices.byteLength)], ['History budget', bytes(history.bytes) + ' / 128 MB'], ['Subdivision levels', active.levels.length], ['Extent XYZ', sub(b.max, b.min).map(n => n.toFixed(3)).join(' × ')], ['Render backend', renderer.backend], ['Last brush footprint', format(renderer.lastCandidates) + ' vertices'], ['Brush compute + readback', renderer.computeMS.toFixed(2) + ' ms']]; showDialog('Mesh & engine diagnostics', `<table class="stats-table">${values.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table><p class="file-note">Normals are area-weighted and refreshed across the affected one-ring. Diagnostics check finite/index validity, edge incidence, and degeneracy—not self-intersection, bow-tie vertices, or global orientation. Closed nondegenerate manifold input is required for signed-distance remeshing.</p>${renderer.errors.length ? '<h3>GPU diagnostics</h3><p>' + esc(renderer.errors.join('\n')) + '</p>' : ''}`); }
function countDegenerate(m) { let n = 0; for (let f = 0; f < m.faces; f++) {
    const k = f * 3;
    if (Math.hypot(m.faceNormals[k], m.faceNormals[k + 1], m.faceNormals[k + 2]) < 1e-12)
        n++;
} return n; }
function help() { showDialog('A studio at your fingertips', `<p>Lithic is an original, local-first sculpting application. Start directly on the model: every brush changes the mesh, and exports contain the resulting geometry.</p><h3>Sculpting & navigation</h3><div class="shortcut-grid">${[['Draw / Clay', 'Q / W'], ['Smooth / Inflate', 'E / R'], ['Pinch / Flatten', 'T / Y'], ['Grab / Mask', 'G / M'], ['Temporary smooth', 'Shift'], ['Temporary mask', 'Ctrl'], ['Subtract / unmask', 'Alt'], ['Brush size', '[ / ]'], ['Orbit', 'Right drag'], ['Pan', 'Middle drag'], ['Touch pan / zoom', 'Two fingers'], ['Zoom', 'Mouse wheel'], ['Frame selected', 'F'], ['X symmetry', 'X'], ['Wireframe', 'L'], ['Focus workspace', 'Tab'], ['Undo', 'Ctrl/Cmd Z'], ['Redo', 'Ctrl/Cmd Shift Z'], ['Subdivision', 'Ctrl/Cmd D'], ['Save project', 'Ctrl/Cmd S'], ['Find brush', 'B'], ['Cancel stroke', 'Esc']].map(([a, b]) => `<div>${a}<kbd>${b}</kbd></div>`).join('')}</div><h3>Engine behavior</h3><p>Spatial hashing and connected surface patches localize brush work. The GPU evaluates brush deformation; compact readback synchronizes the CPU mesh for ray picking, normals, export, and sparse undo. WebGL2 + CPU fallback remains fully editable.</p><p>Loop subdivision stores affine stencils. Low-level edits propagate as deltas while preserving higher-level detail. SDF remeshing resamples a closed surface with BVH distances and indexed marching tetrahedra; it is not quad retopology.</p><p class="file-note">This is a working bounded-scope sculpting engine, not a production-equivalent replacement for ZBrush. No UV painting, skinning, quad retopology, self-intersection prevention, or guaranteed million-polygon interactive performance. Imported geometry is triangulated and exact coincident vertices are welded; UV/texture data is discarded.</p>`); }
const actions = { save: saveProject, export: exportDialog, new: newDialog, add: addDialog, import: () => { if (isIdle())
        $('#file-input').click(); }, open: () => { if (isIdle())
        $('#file-input').click(); }, undo: () => { if (!isIdle())
        return; const c = history.undo(); if (c) {
        changed();
        updateUI();
        toast('Undo · ' + c.label);
    } }, redo: () => { if (!isIdle())
        return; const c = history.redo(); if (c) {
        changed();
        updateUI();
        toast('Redo · ' + c.label);
    } }, subdivide: () => topological('subdivide'), remesh: () => topological('remesh'), duplicate, delete: deleteObject, transform: transformDialog, 'mask-clear': () => maskAction('clear'), 'mask-all': () => maskAction('all'), 'mask-invert': () => maskAction('invert'), 'smooth-all': smoothAll, frame: () => { if (isIdle())
        frame(); }, 'frame-all': () => { if (isIdle())
        frame(true); }, front: () => { if (isIdle())
        setCameraView(0, 0); }, right: () => { if (isIdle())
        setCameraView(Math.PI / 2, 0); }, top: () => { if (isIdle())
        setCameraView(0, 1.50); }, focus: () => { document.body.classList.toggle('focus-mode'); dirty = true; }, inspect, help, sculptmode: () => { navMode = null; updateUI(); }, wire: () => { renderer.wire = !renderer.wire; dirty = true; updateUI(); }, rename: () => { if (!isIdle())
        return; showDialog('Rename project', `<p>Choose a name for the workspace and exported files.</p><input id="project-name-input" value="${esc(title)}" maxlength="120" style="width:100%;padding:9px"><div class="dialog-buttons"><button class="button primary" id="apply-project-name">Rename project</button></div>`); $('#apply-project-name').onclick = () => { setTitle($('#project-name-input').value.trim() || 'Untitled sculpt'); closeDialog(); changed(); }; } };
const MENUS = { file: [['New sculpt', 'new', ''], ['Open project / import mesh', 'import', ''], ['Save project', 'save', 'Ctrl S'], ['Export mesh', 'export', ''], ['Rename project', 'rename', '']], edit: [['Undo', 'undo', 'Ctrl Z'], ['Redo', 'redo', 'Ctrl Shift Z'], ['Duplicate object', 'duplicate', ''], ['Delete object', 'delete', ''], ['Transform object', 'transform', '']], brush: BRUSHES.map((b, i) => [b[0].toUpperCase() + b.slice(1), 'brush:' + b, KEYS[i]]), mesh: [['Subdivide', 'subdivide', 'Ctrl D'], ['Remesh surface', 'remesh', ''], ['Smooth unmasked', 'smooth-all', ''], ['Clear mask', 'mask-clear', ''], ['Inspect topology', 'inspect', '']], view: [['Frame selected', 'frame', 'F'], ['Frame all objects', 'frame-all', ''], ['Front view', 'front', ''], ['Right view', 'right', ''], ['Top view', 'top', ''], ['Wireframe', 'wire', 'L'], ['Focus workspace', 'focus', 'Tab']] };
document.addEventListener('click', e => { const a = e.target.closest('[data-action]'); if (a) {
    $('#menu-popup').hidden = true;
    actions[a.dataset.action]?.();
    return;
} const b = e.target.closest('[data-brush]'); if (b) {
    if (isIdle())
        setBrush(b.dataset.brush);
    return;
} const mat = e.target.closest('[data-material]'); if (mat) {
    material(Number(mat.dataset.material));
    return;
} const prim = e.target.closest('[data-primitive]'); if (prim) {
    addPrimitive(prim.dataset.primitive);
    return;
} const select = e.target.closest('[data-select]'); if (select) {
    if (isIdle())
        selectObject(objects.find(o => o.id === select.dataset.select));
    return;
} const vis = e.target.closest('[data-visible]'); if (vis && isIdle()) {
    const o = objects.find(o => o.id === vis.dataset.visible), before = o.visible;
    o.visible = !before;
    commit({ label: before ? 'Hide object' : 'Show object', bytes: 64, apply(forward) { o.visible = forward ? !before : before; } });
    return;
} const menu = e.target.closest('[data-menu]'); if (menu) {
    const popup = $('#menu-popup'), rect = menu.getBoundingClientRect();
    popup.innerHTML = MENUS[menu.dataset.menu].map(([text, action, key]) => `<button data-menu-action="${action}">${text}<small>${key}</small></button>`).join('');
    popup.style.top = rect.bottom + 5 + 'px';
    popup.style.left = rect.left + 'px';
    popup.hidden = false;
    return;
} const mi = e.target.closest('[data-menu-action]'); if (mi) {
    $('#menu-popup').hidden = true;
    const action = mi.dataset.menuAction;
    if (action.startsWith('brush:')) {
        if (isIdle())
            setBrush(action.slice(6));
    }
    else
        actions[action]?.();
    return;
} if (!e.target.closest('#menu-popup'))
    $('#menu-popup').hidden = true; });
$('#object-list').addEventListener('dblclick', e => { const row = e.target.closest('[data-select]'); if (!row || !isIdle())
    return; const o = objects.find(o => o.id === row.dataset.select); showDialog('Rename sculpt object', `<input id="object-name-input" value="${esc(o.name)}" maxlength="120" style="width:100%;padding:9px"><div class="dialog-buttons"><button class="button primary" id="apply-object-name">Rename</button></div>`); $('#apply-object-name').onclick = () => { const before = o.name, after = $('#object-name-input').value.trim() || 'Sculpt object'; o.name = after; commit({ label: 'Rename object', bytes: 256, apply(forward) { o.name = forward ? after : before; } }); closeDialog(); }; });
$('#radius').oninput = e => { settings.radius = Number(e.target.value); $('#radius-value').textContent = settings.radius; updateRange(e.target); if (lastMouse)
    pointerHover(lastMouse); };
$('#intensity').oninput = e => { settings.intensity = Number(e.target.value); $('#intensity-value').textContent = settings.intensity; updateRange(e.target); };
$('#falloff').onchange = e => { settings.falloff = Number(e.target.value); const points = []; for (let i = 0; i <= 130; i++) {
    const t = 1 - Math.abs(i - 65) / 65;
    points.push(`${i + 5},${30 - falloff(t, settings.falloff) * 27}`);
} $('#falloff-curve').setAttribute('d', 'M' + points.join('L')); };
$('#pressure').onchange = e => settings.pressure = e.target.checked;
$('#front-only').onchange = e => settings.frontOnly = e.target.checked;
$('#add-mode').onclick = () => { settings.sign = 1; updateUI(); };
$('#sub-mode').onclick = () => { settings.sign = -1; updateUI(); };
for (let i = 0; i < 3; i++)
    $('#sym-' + ['x', 'y', 'z'][i]).onclick = () => { settings.symmetry[i] = !settings.symmetry[i]; updateUI(); };
$('#remesh-resolution').oninput = e => { settings.resolution = Number(e.target.value); $('#resolution-value').textContent = settings.resolution; updateRange(e.target); };
$('#level-down').onclick = () => changeLevel(-1);
$('#level-up').onclick = () => changeLevel(1);
$('#solo-button').onclick = solo;
$('#exposure').oninput = e => { renderer.exposure = Number(e.target.value) / 100; $('#exposure-value').textContent = renderer.exposure.toFixed(2); updateRange(e.target); dirty = true; };
$('#cavity').oninput = e => { renderer.cavity = Number(e.target.value) / 100; $('#cavity-value').textContent = e.target.value; updateRange(e.target); dirty = true; };
$('#wire-button').onclick = actions.wire;
$('#grid-button').onclick = () => { $('#floor-grid').hidden = !$('#floor-grid').hidden; $('#grid-button').classList.toggle('active', !$('#floor-grid').hidden); };
$('#projection').onclick = () => { if (isIdle()) {
    camera.ortho = !camera.ortho;
    dirty = true;
    updateUI();
} };
$('#orbit-button').onclick = () => { navMode = navMode === 'orbit' ? null : 'orbit'; updateUI(); };
$('#pan-button').onclick = () => { navMode = navMode === 'pan' ? null : 'pan'; updateUI(); };
$('#turntable-button').onclick = () => { if (isIdle()) {
    turntable = !turntable;
    $('#turntable-button').innerHTML = icon(turntable ? 'pause' : 'play');
    dirty = true;
    updateUI();
} };
$('#zoom-in').onclick = () => { if (isIdle()) {
    camera.distance *= .86;
    dirty = true;
} };
$('#zoom-out').onclick = () => { if (isIdle()) {
    camera.distance *= 1.16;
    dirty = true;
} };
$('#gpu-toggle').onclick = () => { if (!isIdle())
    return; if (renderer.backend !== 'WebGPU') {
    toast('WebGPU is not available in this browser session. The CPU sculpting engine is active.');
    return;
} renderer.computeEnabled = !renderer.computeEnabled; updateUI(); };
$('#brush-search').oninput = e => { $$('[data-brush]').forEach(b => b.hidden = !b.dataset.brush.includes(e.target.value.trim().toLowerCase())); };
$('#scene-tab').onclick = () => { $('.right-panel').classList.add('scene-mode'); $('#scene-tab').classList.add('active'); $('#tool-tab').classList.remove('active'); };
$('#tool-tab').onclick = () => { $('.right-panel').classList.remove('scene-mode'); $('#tool-tab').classList.add('active'); $('#scene-tab').classList.remove('active'); };
$('#close-dialog').onclick = closeDialog;
$('#dialog').addEventListener('click', e => { if (e.target === $('#dialog')) {
    const r = $('#dialog').getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
        closeDialog();
} });
$('#cancel-operation').onclick = () => operation?.cancel();
$('#file-input').onchange = e => importFiles([...e.target.files]);
viewport.addEventListener('dragover', e => e.preventDefault());
viewport.addEventListener('drop', e => { e.preventDefault(); importFiles([...e.dataTransfer.files]); });
document.addEventListener('keydown', e => { if (e.target.matches('input,textarea,select'))
    return; if (e.key === 'Escape') {
    if (operation)
        operation.cancel();
    else if (stroke)
        endStroke(true);
    else {
        navMode = null;
        $('#menu-popup').hidden = true;
    }
    return;
} if ($('#dialog').open)
    return; const key = e.key.toLowerCase(); if (['shift', 'alt', 'control', 'meta'].includes(key))
    return; if (e.code === 'Space') {
    space = true;
    e.preventDefault();
    return;
} if (e.metaKey || e.ctrlKey) {
    if (key === 'z') {
        e.preventDefault();
        (e.shiftKey ? actions.redo : actions.undo)();
    }
    else if (key === 'y') {
        e.preventDefault();
        actions.redo();
    }
    else if (key === 's') {
        e.preventDefault();
        actions.save();
    }
    else if (key === 'd') {
        e.preventDefault();
        actions.subdivide();
    }
    else if (key === 'o') {
        e.preventDefault();
        actions.import();
    }
    return;
} if (key === 'tab') {
    e.preventDefault();
    actions.focus();
    return;
} if (!isIdle())
    return; const i = KEYS.indexOf(e.key.toUpperCase()); if (i >= 0)
    setBrush(BRUSHES[i]);
else if (key === 'x') {
    settings.symmetry[0] = !settings.symmetry[0];
    updateUI();
}
else if (key === 'f')
    frame();
else if (key === 'l')
    actions.wire();
else if (key === 'b')
    $('#brush-search').focus();
else if (key === '[' || key === ']') {
    settings.radius = clamp(settings.radius + (key === ']' ? 5 : -5), 5, 180);
    updateUI();
}
else if (key === 'delete')
    deleteObject(); });
document.addEventListener('keyup', e => { if (e.code === 'Space')
    space = false; });
window.addEventListener('blur', () => { space = false; endStroke(); });
new ResizeObserver(() => { dirty = true; }).observe(viewport);
function loop(now) { requestAnimationFrame(loop); if (!ready)
    return; if (turntable && !stroke && !busy) {
    camera.yaw += (now - rafTime) * .00022;
    dirty = true;
} rafTime = now; if (dirty) {
    try {
        renderer.render(objects, camera, active);
        dirty = false;
        drawOverlay();
    }
    catch (e) {
        console.error(e);
        toast('Rendering error: ' + e.message, true);
        ready = false;
    }
} if (now - metricsTime > 350) {
    $('#render-time').textContent = renderer.ms.toFixed(1) + ' ms submit';
    $('#compute-time').textContent = renderer.lastCandidates ? format(renderer.lastCandidates) + ' local · ' + renderer.computeMS.toFixed(1) + ' ms brush' : 'Brush engine ready';
    $('#zoom-value').textContent = Math.round(7.05 / camera.distance * 100) + '%';
    metricsTime = now;
} }
async function init() { try {
    await renderer.init();
    objects = createDemo();
    active = objects[0];
    if (canvas.clientWidth / canvas.clientHeight < 1) frame(true);
    ready = true;
    updateUI();
    renderer.render(objects, camera, active);
    $('#loading').hidden = true;
    requestAnimationFrame(loop);
    try {
        const saved = await storage('get');
        if (saved) {
            restore(deserializeProject(saved));
            toast('Recovered your locally autosaved workspace.');
            $('#save-status').textContent = 'Recovered local autosave';
        }
    }
    catch (error) {
        console.warn('Autosave recovery:', error);
    }
}
catch (error) {
    console.error(error);
    $('#loading').innerHTML = `<strong>Studio could not initialize</strong><span>${esc(error.message)}</span><button class="button" onclick="location.reload()">Reload</button>`;
} }
// Intentional public diagnostic API for deterministic integration tests and inspection.
window.lithic = { get objects() { return objects; }, get active() { return active; }, get ready() { return ready; }, get busy() { return busy; }, get stroke() { return stroke; }, get processing() { return processing; }, get history() { return history; }, camera, settings, renderer, setBrush, frame, selectObject, applyDab, brushSamples, deformCPU, Stroke, createPrimitive, exportOBJ, exportGLTF, importOBJ, importGLTF, serializeProject, deserializeProject, actions, topological, changeLevel, maskAction, addPrimitive, draw() { dirty = true; }, async testDab(brush = 'draw', x = canvas.clientWidth / 2, y = canvas.clientHeight * .35) { if (!isIdle())
        throw Error('Studio busy'); const h = pick(x, y); if (!h)
        throw Error('Test ray missed mesh'); selectObject(h.object); settings.brush = brush; stroke = new Stroke(active, brush + ' test'); stroke.anchor = h; stroke.radius = camera.worldRadius(settings.radius, canvas.clientHeight, h.point); stroke.planeNormal = [...camera.back]; await applyDab({ x, y, pressure: 1, brush, alt: false, shift: false, ctrl: false }); ending = true; finishStroke(); return renderer.lastCandidates; } };
init();
