# Verification record

Verification performed on 6 September 2026.

## Executed checks

**Node numerical/data-model suite: 22 passed, 0 failed.**

The suite covers outward manifold icospheres; invalid input; BVH versus brute-force intersections; spatial-hash updates; all eight brush kernels; complete mask protection; zero and proportional pressure; all falloffs; symmetry deduplication; disconnected-shell footprint isolation; sparse exact undo/redo; Loop affine stencils; coarse-to-fine detail preservation; bounded/branching history; closed remeshing and sphere radial error; rejection of open remeshing input; concave OBJ negative indices; OBJ round-trip geometry counts; glTF and GLB exact position/index round-trips; multilevel project round-trip; malformed stencils; and torus winding.

Run with `npm test`. The test definitions are in `tests/core.test.mjs`. The recorded TAP output is in `tests/core-results.txt`.

**Browser integration suite: 22 passed, 0 failed.**

Chromium 144.0.7559.96, headless, SwiftShader WebGL2. The standalone distribution was loaded with `page.set_content`, and actual page events, file downloads, and file inputs were used. Desktop viewport: 1512×982. Mobile viewport: 390×844. This browser was available in the execution environment; it is not asserted to be the latest Chromium release.

The checks cover startup; actual pointer-drag vertex changes; exact keyboard undo and redo; painted masks; mask-all protection and clear; material selection; wireframe; camera orbit; primitive creation/undo/redo; Loop subdivision through the standalone Blob worker; retained lower/upper levels; closed remesh through the worker; topology undo; full editable project download and import; mobile canvas dimensions; and absence of uncaught page exceptions.

The machine-readable report is in `tests/browser-results.json`; the reproducible optional script is `tests/browser_checks.py`. Screen captures show the real rendered workspace, not a concept illustration.

## Not executed here

This execution environment blocks browser navigation to local/HTTPS test origins through managed browser policy. The permitted `about:blank` test origin exposes WebGL2 but is not a secure context. `navigator.gpu` and IndexedDB are unavailable there.

Consequently, **actual WebGPU shader compilation/execution and IndexedDB recovery are not verified by the recorded browser run**. The WGSL shaders, resource layouts, asynchronous compute path, separate wireframe pipeline, and device-error handling are implemented. A known line-topology depth-bias portability issue was corrected during review. The supplied `tests/gpu-smoke.html` performs actual WebGPU correctness checks on a suitable local/HTTPS origin; it has not been represented as a passed test.

GPU verification covers 48 compute parity cases: eight brushes × three falloffs × two signs, using 257 records to exercise both complete and partial 128-thread workgroups, plus shaded/wireframe draw submission and validation-error checks. Absolute position/mask difference is required to remain below 3×10^-6 for the chosen test records.

Physical pen/tablet pressure, touch hardware, Safari/Firefox, production GPU drivers, device-loss recovery across vendors, IndexedDB quota exhaustion, very large meshes, malicious-input fuzzing, and long-running memory/stress behavior have not been certified. No hardware FPS or speedup result is claimed. “ms submit” in the interface measures CPU render submission time, not GPU frame duration.

## Scope checks, not guarantees

An edge-manifold mesh is not necessarily a valid non-self-intersecting solid. The remesher assumes usable closed surfaces; thin geometry and ambiguous shell arrangements have documented limitations. Imported assets use a bounded geometry interchange subset. The app is a functional sculpting core with tests, not a drop-in replacement for every ZBrush workflow.
