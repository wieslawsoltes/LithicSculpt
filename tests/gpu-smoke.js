import { Renderer } from '../src/render.js';
import { BRUSHES, deformCPU } from '../src/sculpt.js';
import { createPrimitive } from '../src/model.js';
import { Camera } from '../src/math.js';
const output = document.querySelector('#results');
const log = text => output.textContent += text + '\n';
const assert = (condition, message) => { if (!condition)
    throw Error(message); };
let running = false;
async function run() {
    if (running)
        return;
    running = true;
    output.textContent = '';
    const renderer = new Renderer(document.querySelector('#surface'));
    try {
        assert(isSecureContext, 'Secure origin required: use http://localhost or HTTPS.');
        assert(navigator.gpu, 'navigator.gpu is unavailable in this browser.');
        await renderer.init();
        assert(renderer.backend === 'WebGPU', 'No WebGPU backend. ' + renderer.errors.join('; '));
        log('PASS: WebGPU shaded, wireframe, and compute pipelines compiled.');
        const records = new Float32Array(257 * 24);
        for (let i = 0; i < 257; i++) {
            const t = i / 256, k = i * 24;
            records.set([t * .7 - .35, Math.sin(i) * .25, Math.cos(i) * .2, (i % 5) / 5, 0, 0, 1, 0,
                0, .05, .08, i % 2, 0, 0, 0, .85, 0, 0, 1, 1, .1, -.05, .075, .73], k);
        }
        let worst = 0, tests = 0;
        for (let kind = 0; kind < 3; kind++)
            for (let mode = 0; mode < 8; mode++)
                for (const sign of [-1, 1]) {
                    for (let i = 0; i < 257; i++)
                        records[i * 24 + 19] = sign;
                    const cpu = deformCPU(records, mode, kind), gpu = await renderer.deform(records, mode, kind);
                    let error = 0;
                    for (let i = 0; i < cpu.length; i++) {
                        assert(Number.isFinite(gpu[i]), 'GPU emitted a non-finite value');
                        error = Math.max(error, Math.abs(cpu[i] - gpu[i]));
                    }
                    assert(error < 3e-6, `${BRUSHES[mode]} parity error ${error}`);
                    worst = Math.max(error, worst);
                    tests++;
                }
        log(`PASS: ${tests} GPU/CPU brush comparisons; max absolute error ${worst.toExponential(3)}.`);
        const objects = createPrimitive('sphere'), camera = new Camera();
        camera.distance = 4.4;
        renderer.render(objects, camera, objects[0]);
        await renderer.device.queue.onSubmittedWorkDone();
        renderer.wire = true;
        renderer.render(objects, camera, objects[0]);
        await renderer.device.queue.onSubmittedWorkDone();
        await new Promise(resolve => setTimeout(resolve, 100));
        assert(!renderer.errors.length, renderer.errors.join('\n'));
        log('PASS: shaded and wireframe draw submitted with no GPU validation errors.');
        log('RESULT: all checks passed. This is a correctness smoke test, not a hardware performance benchmark.');
        window.lithicGPUResult = { passed: true, comparisons: tests, maxError: worst };
    }
    catch (error) {
        log('FAIL / UNAVAILABLE: ' + error.message);
        window.lithicGPUResult = { passed: false, message: error.message };
        renderer.device?.destroy();
    }
    finally {
        running = false;
        document.querySelector('#run').disabled = true;
        log('Reload this page to repeat the test.');
    }
}
document.querySelector('#run').onclick = run;
if (new URLSearchParams(location.search).has('autorun'))
    run();
