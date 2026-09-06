# Lithic Sculpt

**[Launch Lithic Sculpt](https://wieslawsoltes.github.io/LithicSculpt/)** · [Standalone HTML](https://wieslawsoltes.github.io/LithicSculpt/dist/lithic-sculpt.html) · [GPU diagnostic](https://wieslawsoltes.github.io/LithicSculpt/tests/gpu-smoke.html)

[![Build and deploy](https://github.com/wieslawsoltes/LithicSculpt/actions/workflows/pages.yml/badge.svg)](https://github.com/wieslawsoltes/LithicSculpt/actions/workflows/pages.yml)

A dependency-free digital sculpting application in HTML, CSS, and JavaScript. WebGPU provides real indexed rendering and localized compute-shader brush deformation. A WebGL2 renderer and equivalent CPU brush kernels provide a functional fallback.

The workspace is inspired by digital-sculpting workflows: brush shelf, top stroke controls, sculpt-object list, subdivision controls, masking, material previews, and direct interaction with the model. The interface, procedural meshes, name, and code are original. This project is not affiliated with Maxon and does not read ZBrush project formats.

**This is a working, bounded-scope sculpting implementation, not a claim of ZBrush feature parity or production certification.** Its geometry, history, file interchange, and topology operations are computed, not mocked.

## Run

Use a recent Node.js version; validation was run on Node 22.16.0. No npm install is needed.

```sh
git clone https://github.com/wieslawsoltes/LithicSculpt.git
cd LithicSculpt
npm start
```

Open `http://127.0.0.1:8080`. The server binds to loopback by default. A custom port is supported through the `PORT` environment variable.

Alternatively, serve the directory using any static HTTP server:

```sh
python3 -m http.server 8080
```

For one-file distribution, use `dist/lithic-sculpt.html`. It contains all application code, shaders, styles, procedural starter geometry, and the topology worker as a Blob. No CDN, runtime dependency, font download, account, API key, or service is needed. Serving that file on localhost or HTTPS is the recommended launch method. Opening it as a local file depends on browser security and storage policies.

WebGPU requires a secure context and an available adapter. The application displays the actual active backend rather than claiming WebGPU when it is unavailable. Append `?webgl` to the URL to explicitly select the fallback. On a WebGPU session, the backend button switches brush computation between GPU and CPU for comparison.

## First sculpt

The initial Sentinel study is seven independently editable objects totaling **60,686 vertices**: head, shoulders/neck, plinth, two ears, and two eyes. It is generated as actual indexed geometry at startup; it is not a background image.

Drag on the model to sculpt. Drag empty background or right-drag to orbit. Start with Draw at moderate intensity, hold Shift to smooth, and use Alt to subtract. The orange X control enables mirrored strokes around the selected object's local origin. Add a sphere, rounded cube, or torus from the bottom shelf. Newly added objects are placed beside the existing scene.

Select objects in the right panel or by beginning a stroke on another visible object. Double-click an object name to rename it. Object visibility, duplication, deletion, material assignment, and whole-object transform operations are wired to real state and undo commands. Solo is a temporary visibility mode.

### Controls

| Interaction | Action |
| --- | --- |
| Left drag / pen drag | Sculpt the surface under the cursor |
| Shift while sculpting | Temporary Smooth |
| Ctrl while sculpting | Temporary Mask |
| Alt while sculpting | Reverse Draw, Clay, Inflate, Pinch, or Mask direction |
| Right drag / empty-background drag | Orbit |
| Middle drag / Shift + right drag | Pan |
| Wheel | Zoom |
| Two touch pointers | Pan and pinch zoom |
| Q / W / E / R / T / Y / G / M | Draw / Clay / Smooth / Inflate / Pinch / Flatten / Grab / Mask |
| X | Toggle X symmetry |
| [ / ] | Decrease / increase brush radius |
| F | Frame selected object |
| L | Wireframe |
| Tab | Focus workspace |
| B | Focus brush search |
| Ctrl/Cmd + Z | Undo |
| Ctrl/Cmd + Shift + Z, Ctrl + Y | Redo |
| Ctrl/Cmd + D | Subdivide / select existing next level |
| Ctrl/Cmd + S | Download editable project |
| Ctrl/Cmd + O | Open mesh/project file picker |
| Escape | Cancel current stroke or topology worker |

Brush radius is in screen pixels and is converted to world-space radius at the hit depth. Pointer pressure modulates strength, not radius. Pen tilt, barrel rotation, and external tablet-driver configuration are not implemented. Pressure behavior is expressed through the standard Pointer Events pressure field; the physical tablet hardware path was not tested in this environment.

## Sculpting behavior

Eight genuinely distinct brush kernels share one compact record layout and equivalent JavaScript/WGSL arithmetic.

- **Draw:** displaces along the picked surface normal.
- **Clay:** builds toward a one-sided offset plane; subtractive mode cuts toward the opposite plane.
- **Smooth:** mask-aware Jacobi relaxation using the old one-ring neighbor positions, with open boundary vertices held fixed.
- **Inflate:** displaces each candidate along its own vertex normal.
- **Pinch:** contracts the tangent-plane distance toward the brush center; inverse mode expands it.
- **Flatten:** projects toward the picked brush plane with falloff.
- **Grab:** captures the original footprint and applies an accumulated camera-plane translation, avoiding per-event integration drift.
- **Mask:** paints a continuous vertex protection value in [0, 1]; inverse mode removes it.

Smooth, sharp-quadratic, and spherical falloff profiles are available. X, Y, and Z symmetry may be combined. Candidate vertices shared by mirrored footprints are deduplicated, so the symmetry seam is not deformed twice by the same dab. Mask All, Clear, Invert, and two-pass smoothing of the unmasked surface are provided.

These are explicit brush models, not reverse-engineered implementations of ZBrush brushes. Smooth and Flatten do not have a separate subtractive variant; Grab follows pointer motion rather than the Add/Sub setting.

## Mesh engine

### Authoritative state

`Mesh` owns an interleaved `Float32Array` with eight floats per vertex:

```text
position.x position.y position.z mask
normal.x   normal.y   normal.z   cavity
```

Indices are a `Uint32Array`. Mesh positions are dimensionless model coordinates. Adjacency is independent of the rendering API. The authoritative geometry remains on the CPU to keep picking, topology, history, and exports consistent.

### Locality and adjacency

The engine maintains CSR vertex-to-face and vertex-to-vertex adjacency, edge incidence, boundary flags, face normals, a dynamic uniform spatial hash, and a triangle BVH. A dab ray-picks a triangle, queries the local hash, applies an optional facing test, and flood-fills through adjacency inside that candidate region. This prevents a brush from spilling directly onto disconnected nearby shells.

The footprint is a connected Euclidean sphere, not an exact geodesic disk. Folded regions on the same connected surface can still fall inside the footprint. Symmetry uses the reflected center/normal and the nearest local seed; the mesh itself need not have matching mirrored vertex indices.

After a dab, changed incident face normals are recalculated, all affected one-ring vertex normals are rebuilt from area-weighted contributions, changed BVH leaves and ancestors are refitted, and moved vertices are updated in the hash. Dirty GPU vertex ranges are sorted and coalesced, with full upload above a density threshold. A coordinate change can affect normals on vertices outside the position-change footprint; those vertices are included in the dirty ranges.

### GPU compute path

The CPU assembles a 96-byte candidate record per vertex:

```text
vec4: current position + mask
vec4: vertex normal + cavity
vec4: neighbor average + boundary flag
vec4: brush center + radius
vec4: brush normal + sign
vec4: grab delta + strength × pressure
```

The WGSL kernel runs 128 invocations per workgroup and writes a 16-byte position/mask result for each candidate. Reusable storage and readback buffers grow geometrically. Results are validated for finiteness, copied into authoritative CPU state, and followed by local normal/spatial updates. GPU failures disable compute and continue using the CPU kernel.

**This is a GPU-assisted hybrid design, not a fully GPU-resident sculpting engine.** Each dab incurs compact GPU-to-CPU readback. Small brush footprints may run faster on the CPU; large footprints, browser/driver overhead, and device architecture determine the crossover. No hardware throughput, FPS, million-polygon interaction, or GPU speedup claim is made by this delivery.

### Rendering

The WebGPU backend uses indexed triangles, reusable mesh resources, four-sample MSAA, depth testing, GGX-style studio lighting, material roughness/metalness, approximate environment highlights, curvature shading, masks, and a separate line pipeline for wireframe. Wireframe depth offset is performed in the vertex shader rather than using invalid nonzero line-topology depth bias. Vertex data and material state are shared with the WebGL2 fallback.

The viewport backdrop and floor grid are HTML/CSS overlays. They are not ray-traced scene geometry. Lighting uses three analytic directional lights and an environment approximation; there are no true cast shadows, HDRI loading, path tracing, texture painting, UV editing, or subsurface scattering.

## Subdivision levels

The worker implements Loop subdivision with boundary-aware stencils. Every level keeps its indexed mesh and every transition keeps an affine CSR parent stencil. Selecting a lower level does not discard higher meshes.

A stroke at a lower level propagates its position and mask deltas through the transition stencils when the stroke finishes. The propagated position delta is **added** to the existing finer positions, preserving existing high-level detail rather than regenerating and erasing it. Masks are clamped to [0, 1]. All affected levels are part of the same undo transaction.

This is an additive multiresolution model, not tangent-space displacement layers. A high-level edit does not change the lower cage. Going to a lower level intentionally displays less detail. Subdividing while a finer level already exists selects that level rather than branching the hierarchy.

## Remeshing

Remeshing runs in a cancellable worker on the **selected object only**. It uses nearest-triangle distances and oblique-ray parity to sample a signed-distance field, then extracts an indexed triangle surface using marching tetrahedra. Shared grid-edge vertices are cached to avoid cracks. Masks are transferred from the closest original triangle using barycentric weights.

The operation requires a nondegenerate, closed edge-manifold input and replaces that object's subdivision hierarchy. Undo restores the previous hierarchy. The default voxel resolution is 36 cells along the largest padded extent; the UI supports 16–72. This is deliberately bounded to keep CPU worker time and intermediate memory controlled.

Remeshing is **not** ZRemesher-style quad retopology, dynamic topology, an adaptive octree, or a boolean union across sculpt objects. Thin features below the grid scale can disappear. An edge-manifold check is not a proof of non-self-intersection or a robust solid definition. Interpenetrating/nested shells and badly conditioned or extremely small coordinates can make parity classification ambiguous. Arbitrary damaged meshes are not automatically repaired.

## Undo and persistence

A stroke captures each touched vertex's before image only once. At completion, unchanged vertices are discarded and the retained patch consists of a uint32 vertex ID plus before/after position-mask vec4 values: **36 packed bytes per changed vertex per affected level**, excluding JavaScript/container overhead. Normal and acceleration data are rebuilt on replay instead of stored in the history patch.

The in-progress stroke uses a Map; it is not compressed while painting. Topology and object commands retain larger state snapshots. The undo budget is 128 MiB with oldest-command eviction. A single command exceeding the budget remains applied, clears undo history, and displays a warning. Undo and redo restore Float32 position and mask values exactly; this does not imply GPU/CPU floating-point bit equality.

`.lithic` files store every sculpt object, ID, visibility, material, symmetry origin, vertex mask, subdivision mesh, transition stencil, camera, and brush settings. Loading validates mesh buffers and affine stencil relationships. Stroke undo history is session-only and is not serialized. Display exposure/cavity, the active object, and temporary Solo mode are not retained as independent project state.

An IndexedDB transaction maintains one local autosave per origin after changes settle. Storage policy/quota errors produce a visible warning and do not block manual project download. Browser storage is not a backup; save `.lithic` files for durable work. Autosave recovery could not be verified on the restricted `about:blank` test origin; file save/load was verified in the real browser.

## Interchange

| Format | Supported |
| --- | --- |
| OBJ import | Positions, positive/negative face indices, object/group splits, concave polygon ear-clipping, exact-coordinate welding, duplicate/degenerate face filtering; normals rebuilt |
| OBJ export | All visible objects at their current level, positions, normals, named objects, indexed triangles |
| glTF 2.0 import | JSON or GLB, embedded buffers or explicitly selected companion files, triangle-list primitives, component strides, normalized/sparse accessor reads, baked node TRS/matrix hierarchy, reflected winding, basic PBR material factors |
| glTF/GLB export | Visible current-level meshes, normals, uint32 triangle indices, separate nodes/meshes, basic material factors; self-contained JSON or binary GLB |
| `.lithic` | Full editable geometry/masks/levels/settings format described above |

Geometry import is intentionally not a complete asset-preserving glTF pipeline. UVs, textures, normal maps, vertex-color painting, skinning, animation, morph targets, compression extensions, triangle strips/fans, and ZTL/ZPR files are not supported. Some unsupported glTF features are explicitly rejected; material texture information is omitted. Exact-coordinate welding can join coincident seams. OBJ does not preserve original polygon topology after triangulation.

For an external-buffer `.gltf`, select the JSON and its `.bin` companion together in the file picker. No remote URL buffers are fetched. Exported glTF geometry is self-contained.

The app enforces 1 million vertices / 2 million triangles per mesh, 100 objects, eight loaded subdivision levels, and a 256 MiB decoded project mesh budget. These are validation guards, not interactive-performance promises. Adjacency, workers, history, serialization, and GPU buffers consume additional memory beyond raw mesh bytes.

## Source map

```text
index.html                Workspace DOM and accessible native controls
style.css                 Responsive sculpting workspace, icons and shelf styling
src/math.js               Vector/matrix math, camera, projection, ray construction
src/mesh.js               Mesh validation, CSR adjacency, BVH, hash, normal updates
src/sculpt.js             Brush kernels, WGSL, connected patches, symmetry, history
src/topology.js           Loop subdivision, affine stencils, SDF extraction
src/model.js              Object model, materials, procedural starter meshes
src/render.js             WebGPU/WebGL2 rendering, buffer lifetimes, GPU compute
src/io.js                 OBJ/glTF/GLB, project serialization, IndexedDB
src/worker.js             Transferable-buffer topology worker protocol
src/app.js                Interaction, tools, dialogs, commands, autosave
server.mjs                Dependency-free loopback static server
build.mjs                 Dependency-free standalone HTML builder
tests/core.test.mjs       Numerical and data-model tests
tests/browser_checks.py   Optional Playwright browser integration checks
tests/gpu-smoke.html      Real-WebGPU verification entry page
tests/gpu-smoke.js        GPU/CPU parity and render validation checks
```

The application intentionally exposes `window.lithic` for inspection and deterministic integration tests. This is an unstable diagnostic API, not a versioned public library contract.

## Verification

```sh
npm test
npm run build
```

The included numerical test suite and browser verification report are summarized in `VERIFICATION.md`. The browser test script is optional and requires Python Playwright and a Chromium executable. It exercises the generated standalone app, including Blob workers and file downloads, not a mocked DOM.

For actual WebGPU execution, start the server and open:

```text
http://127.0.0.1:8080/tests/gpu-smoke.html
```

Press **Run GPU checks**. The test requires a GPU backend, compiles all pipelines, compares 48 brush/falloff/sign combinations against the CPU, submits shaded and wireframe draws, and reports uncaptured GPU validation errors. It will explicitly report unavailable rather than treating CPU fallback as a GPU pass. Run this on each browser/device targeted for deployment.

## References

These sources informed API contracts and interaction conventions; implementation code and starter geometry are original.

- WebGPU specification: https://www.w3.org/TR/webgpu/
- WGSL specification: https://www.w3.org/TR/WGSL/
- Chrome WebGPU troubleshooting / secure contexts: https://developer.chrome.com/docs/web-platform/webgpu/troubleshooting-tips
- WebGPU line-topology depth-bias validation: https://developer.chrome.com/blog/new-in-webgpu-131
- Khronos glTF 2.0 specification: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
- Maxon sculpting brush workflow documentation: https://help.maxon.net/zbr/en-us/Content/html/user-guide/3d-modeling/sculpting/sculpting-brushes/sculpting-brushes.html

## License

MIT. See `LICENSE`. ZBrush and Maxon are names of their respective products/owners; this application uses an original identity and does not include their assets or source.

## GitHub Pages deployment

The `Build and deploy` workflow runs the numerical tests and produces the standalone HTML and `_site/` browser assets. Pushes to `main` deploy that artifact through GitHub Pages. Pull requests run the same tests and build without deploying. No npm dependencies or repository secrets are required.

```sh
npm test
npm run build:pages
```

The published app uses relative asset URLs, so workers and imports resolve under `/LithicSculpt/`. The main app, standalone download, and `tests/gpu-smoke.html` are all served over HTTPS. Browser GPU/driver capabilities still determine whether WebGPU is available.
