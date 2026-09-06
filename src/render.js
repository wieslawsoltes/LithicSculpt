import { DEFORM_WGSL, deformCPU } from './sculpt.js';
import { MATERIALS } from './model.js';
export const RENDER_WGSL = `
struct Uniforms { vp:mat4x4f,eye:vec4f,color:vec4f,material:vec4f,light:vec4f }
@group(0) @binding(0) var<uniform> u:Uniforms;
struct Vertex { @location(0) p:vec4f,@location(1) n:vec4f }
struct Output { @builtin(position) clip:vec4f,@location(0) p:vec3f,@location(1) n:vec3f,@location(2) mask:f32,@location(3) cavity:f32 }
@vertex fn vs(a:Vertex)->Output{var o:Output;o.clip=u.vp*vec4f(a.p.xyz,1.0);o.p=a.p.xyz;o.n=a.n.xyz;o.mask=a.p.w;o.cavity=a.n.w;return o;}
@vertex fn vsWire(a:Vertex)->Output{var o:Output;o.clip=u.vp*vec4f(a.p.xyz,1.0);o.clip.z-=0.00001*o.clip.w;o.p=a.p.xyz;o.n=a.n.xyz;o.mask=a.p.w;o.cavity=a.n.w;return o;}
fn light(n:vec3f,v:vec3f,l:vec3f,base:vec3f,rough:f32,metal:f32)->vec3f{
 let h=normalize(l+v);let nl=max(dot(n,l),0.0);let nv=max(dot(n,v),0.001);let nh=max(dot(n,h),0.0);let vh=max(dot(v,h),0.0);
 let a=max(0.035,rough*rough);let a2=a*a;let d=a2/(3.14159265*pow(nh*nh*(a2-1.0)+1.0,2.0));let k=pow(rough+1.0,2.0)/8.0;
 let g=(nv/(nv*(1.0-k)+k))*(nl/(nl*(1.0-k)+k));let f0=mix(vec3f(0.04),base,metal);let f=f0+(1.0-f0)*pow(1.0-vh,5.0);
 return ((1.0-f)*(1.0-metal)*base/3.14159265+f*d*g/max(4.0*nv*nl,0.001))*nl;
}
@fragment fn fs(a:Output,@builtin(front_facing) front:bool)->@location(0) vec4f{
 var n=normalize(a.n);if(!front){n=-n;}let v=normalize(u.eye.xyz-a.p);let base=u.color.rgb;let rough=u.material.x;let metal=u.material.y;
 var c=base*(0.15+0.075*n.y)*(1.0-metal*0.7);
 c+=light(n,v,normalize(vec3f(-0.55,0.85,1.2)),base,rough,metal)*vec3f(3.5,3.25,3.0);
 c+=light(n,v,normalize(vec3f(0.95,0.25,0.6)),base,rough,metal)*vec3f(0.85,1.02,1.28);
 c+=light(n,v,normalize(vec3f(0.3,0.6,-1.0)),base,rough,metal)*vec3f(2.0,1.72,1.4);
 let rim=pow(1.0-max(dot(n,v),0.0),3.0);c+=base*rim*0.07;
 let reflection=reflect(-v,n);let env=0.10+0.3*pow(max(0.0,reflection.y),3.0)+0.4*pow(max(0.0,reflection.z),12.0);c+=base*metal*env;
 c*=1.0-clamp(a.cavity*u.light.x,0.0,0.7);c=mix(c,c*vec3f(0.20,0.24,0.29),a.mask*0.86);c*=u.material.w;
 c=clamp((c*(2.51*c+0.03))/(c*(2.43*c+0.59)+0.14),vec3f(0.0),vec3f(1.0));return vec4f(pow(c,vec3f(1.0/2.2)),1.0);
}
@fragment fn wire(a:Output)->@location(0) vec4f{return vec4f(0.13,0.21,0.22,1.0);}
`;
const GLSL_VERTEX = `#version 300 es
precision highp float;
layout(location=0) in vec4 position;layout(location=1) in vec4 normal;
uniform mat4 vp;out vec3 p;out vec3 n;out float mask;out float cavity;
void main(){gl_Position=vp*vec4(position.xyz,1.);p=position.xyz;n=normal.xyz;mask=position.w;cavity=normal.w;}`;
const GLSL_FRAGMENT = `#version 300 es
precision highp float;
in vec3 p;in vec3 n;in float mask;in float cavity;out vec4 outColor;
uniform vec3 eye;uniform vec3 base;uniform float rough;uniform float metal;uniform float exposure;uniform float cavityStrength;uniform bool wire;
vec3 light(vec3 nn,vec3 v,vec3 l){vec3 h=normalize(l+v);float nl=max(dot(nn,l),0.),nv=max(dot(nn,v),.001),nh=max(dot(nn,h),0.),vh=max(dot(v,h),0.);float a=max(.035,rough*rough),a2=a*a,d=a2/(3.14159265*pow(nh*nh*(a2-1.)+1.,2.)),k=pow(rough+1.,2.)/8.;float g=nv/(nv*(1.-k)+k)*nl/(nl*(1.-k)+k);vec3 f0=mix(vec3(.04),base,metal),f=f0+(1.-f0)*pow(1.-vh,5.);return ((1.-f)*(1.-metal)*base/3.14159265+f*d*g/max(4.*nv*nl,.001))*nl;}
void main(){if(wire){outColor=vec4(.13,.21,.22,1.);return;}vec3 nn=normalize(n);if(!gl_FrontFacing)nn=-nn;vec3 v=normalize(eye-p),c=base*(.15+.075*nn.y)*(1.-metal*.7);
c+=light(nn,v,normalize(vec3(-.55,.85,1.2)))*vec3(3.5,3.25,3.0);
c+=light(nn,v,normalize(vec3(.95,.25,.6)))*vec3(.85,1.02,1.28);
c+=light(nn,v,normalize(vec3(.3,.6,-1.)))*vec3(2.,1.72,1.4);
c+=base*pow(1.-max(dot(nn,v),0.),3.)*.07;vec3 reflection=reflect(-v,nn);float env=.10+.3*pow(max(0.,reflection.y),3.)+.4*pow(max(0.,reflection.z),12.);c+=base*metal*env;c*=1.-clamp(cavity*cavityStrength,0.,.7);c=mix(c,c*vec3(.2,.24,.29),mask*.86);c*=exposure;c=clamp((c*(2.51*c+.03))/(c*(2.43*c+.59)+.14),0.,1.);outColor=vec4(pow(c,vec3(1./2.2)),1.);}`;
function dirtyRanges(mesh) { if (mesh.dirty === null || mesh.dirty.size > mesh.count * .3)
    return [[0, mesh.v.length]]; const ids = [...mesh.dirty].sort((a, b) => a - b), ranges = []; let start = -1, end = -1; for (const i of ids) {
    if (start < 0) {
        start = i;
        end = i;
    }
    else if (i - end <= 12)
        end = i;
    else {
        ranges.push([start * 8, (end + 1) * 8]);
        start = i;
        end = i;
    }
} if (start >= 0)
    ranges.push([start * 8, (end + 1) * 8]); return ranges; }
function edgeIndices(mesh) { const a = new Uint32Array(mesh.indices.length * 2); for (let i = 0; i < mesh.indices.length; i += 3) {
    const x = mesh.indices[i], y = mesh.indices[i + 1], z = mesh.indices[i + 2];
    a.set([x, y, y, z, z, x], i * 2);
} return a; }
export class Renderer {
    constructor(canvas, onStatus = () => { }) { this.canvas = canvas; this.onStatus = onStatus; this.resources = new Map(); this.exposure = 1; this.cavity = .65; this.wire = false; this.computeEnabled = true; this.backend = 'initializing'; this.ms = 0; this.computeMS = 0; this.lastCandidates = 0; this.errors = []; }
    async init() {
        if (navigator.gpu && !new URLSearchParams(location.search).has('webgl')) {
            try {
                const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
                if (!adapter)
                    throw Error('No WebGPU adapter');
                this.device = await adapter.requestDevice();
                const d = this.device;
                d.addEventListener('uncapturederror', e => { this.errors.push(e.error.message); this.onStatus(e.error.message, true); });
                d.lost.then(info => { if (this.device !== d)
                    return; this.backend = 'device lost'; this.computeEnabled = false; this.onStatus(`GPU device lost: ${info.message}. Save the project and reload.`, true); });
                const shader = d.createShaderModule({ label: 'Lithic studio material', code: RENDER_WGSL });
                const messages = await shader.getCompilationInfo();
                const errors = messages.messages.filter(m => m.type === 'error');
                if (errors.length)
                    throw Error(errors.map(m => m.message).join('\n'));
                this.format = navigator.gpu.getPreferredCanvasFormat();
                const descriptor = { layout: 'auto', vertex: { module: shader, entryPoint: 'vs', buffers: [{ arrayStride: 32, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x4' }, { shaderLocation: 1, offset: 16, format: 'float32x4' }] }] }, fragment: { module: shader, entryPoint: 'fs', targets: [{ format: this.format }] }, primitive: { topology: 'triangle-list', cullMode: 'none' }, depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' }, multisample: { count: 4 } };
                this.pipeline = await d.createRenderPipelineAsync(descriptor);
                this.wirePipeline = await d.createRenderPipelineAsync({ ...descriptor, vertex: { ...descriptor.vertex, entryPoint: 'vsWire' }, fragment: { module: shader, entryPoint: 'wire', targets: [{ format: this.format }] }, primitive: { topology: 'line-list' }, depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'less-equal' } });
                this.compute = await d.createComputePipelineAsync({ label: 'Localized brush deformation', layout: 'auto', compute: { module: d.createShaderModule({ code: DEFORM_WGSL }), entryPoint: 'main' } });
                this.context = this.canvas.getContext('webgpu');
                if (!this.context)
                    throw Error('WebGPU canvas unavailable');
                this.context.configure({ device: d, format: this.format, alphaMode: 'premultiplied' });
                this.backend = 'WebGPU';
                this.onStatus('WebGPU · GPU brush compute');
                return;
            }
            catch (e) {
                this.errors.push(e.message);
                this.device?.destroy();
                this.device = null;
                this.onStatus('WebGPU unavailable; using WebGL2 + CPU sculpting. ' + e.message, true);
            }
        }
        this.initGL();
    }
    initGL() { const gl = this.canvas.getContext('webgl2', { alpha: true, antialias: true, preserveDrawingBuffer: true }); if (!gl)
        throw Error('This browser cannot create a WebGPU or WebGL2 context.'); this.gl = gl; const shader = (type, code) => { const s = gl.createShader(type); gl.shaderSource(s, code); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        throw Error(gl.getShaderInfoLog(s)); return s; }; const p = gl.createProgram(); gl.attachShader(p, shader(gl.VERTEX_SHADER, GLSL_VERTEX)); gl.attachShader(p, shader(gl.FRAGMENT_SHADER, GLSL_FRAGMENT)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS))
        throw Error(gl.getProgramInfoLog(p)); this.program = p; this.uniforms = {}; for (const name of ['vp', 'eye', 'base', 'rough', 'metal', 'wire', 'exposure', 'cavityStrength'])
        this.uniforms[name] = gl.getUniformLocation(p, name); this.backend = 'WebGL2'; this.computeEnabled = false; this.onStatus('WebGL2 · CPU brush compute'); }
    resize() { const rect = this.canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2), w = Math.max(1, Math.round(rect.width * dpr)), h = Math.max(1, Math.round(rect.height * dpr)); if (this.canvas.width === w && this.canvas.height === h && (!this.device || this.depth))
        return; this.canvas.width = w; this.canvas.height = h; if (this.device) {
        this.depth?.destroy();
        this.msaa?.destroy();
        this.depth = this.device.createTexture({ size: [w, h], format: 'depth24plus', sampleCount: 4, usage: GPUTextureUsage.RENDER_ATTACHMENT });
        this.msaa = this.device.createTexture({ size: [w, h], format: this.format, sampleCount: 4, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    } }
    gpuBuffer(data, usage) { const b = this.device.createBuffer({ size: Math.max(4, (data.byteLength + 3) & ~3), usage: usage | GPUBufferUsage.COPY_DST }); this.device.queue.writeBuffer(b, 0, data); return b; }
    getResource(mesh) {
        let r = this.resources.get(mesh.uid);
        if (!r) {
            r = { version: -1 };
            this.resources.set(mesh.uid, r);
            if (this.device) {
                r.vertex = this.gpuBuffer(mesh.v, GPUBufferUsage.VERTEX);
                r.index = this.gpuBuffer(mesh.indices, GPUBufferUsage.INDEX);
                r.uniform = this.device.createBuffer({ size: 128, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
                r.bind = this.device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: r.uniform } }] });
                r.wireBind = this.device.createBindGroup({ layout: this.wirePipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: r.uniform } }] });
            }
            else {
                const g = this.gl;
                r.vao = g.createVertexArray();
                g.bindVertexArray(r.vao);
                r.vertex = g.createBuffer();
                g.bindBuffer(g.ARRAY_BUFFER, r.vertex);
                g.bufferData(g.ARRAY_BUFFER, mesh.v, g.DYNAMIC_DRAW);
                g.enableVertexAttribArray(0);
                g.vertexAttribPointer(0, 4, g.FLOAT, false, 32, 0);
                g.enableVertexAttribArray(1);
                g.vertexAttribPointer(1, 4, g.FLOAT, false, 32, 16);
                r.index = g.createBuffer();
                g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, r.index);
                g.bufferData(g.ELEMENT_ARRAY_BUFFER, mesh.indices, g.STATIC_DRAW);
            }
        }
        if (r.version !== mesh.version) {
            const ranges = dirtyRanges(mesh);
            for (const [a, b] of ranges) {
                if (this.device)
                    this.device.queue.writeBuffer(r.vertex, a * 4, mesh.v.subarray(a, b));
                else {
                    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, r.vertex);
                    this.gl.bufferSubData(this.gl.ARRAY_BUFFER, a * 4, mesh.v.subarray(a, b));
                }
            }
            r.version = mesh.version;
            mesh.markUploaded();
        }
        if (this.wire && !r.edges) {
            const data = edgeIndices(mesh);
            r.edgeCount = data.length;
            if (this.device)
                r.edges = this.gpuBuffer(data, GPUBufferUsage.INDEX);
            else {
                r.edges = this.gl.createBuffer();
                this.gl.bindVertexArray(r.vao);
                this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, r.edges);
                this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, data, this.gl.STATIC_DRAW);
            }
        }
        return r;
    }
    render(objects, camera, selected) {
        if (this.backend === 'device lost')
            return;
        const start = performance.now();
        this.resize();
        const c = this.canvas;
        camera.update(c.clientWidth, c.clientHeight, !!this.device);
        if (this.device) {
            const d = this.device, encoder = d.createCommandEncoder(), pass = encoder.beginRenderPass({ colorAttachments: [{ view: this.msaa.createView(), resolveTarget: this.context.getCurrentTexture().createView(), clearValue: [0, 0, 0, 0], loadOp: 'clear', storeOp: 'store' }], depthStencilAttachment: { view: this.depth.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } });
            pass.setPipeline(this.pipeline);
            for (const o of objects) {
                if (!o.visible)
                    continue;
                const mesh = o.mesh, r = this.getResource(mesh), mat = o.customMaterial || MATERIALS[o.material] || MATERIALS[0], u = new Float32Array(32);
                u.set(camera.vp);
                u.set([...camera.eye, o === selected ? 1 : 0], 16);
                u.set([...mat.color, 1], 20);
                u.set([mat.roughness, mat.metallic, 0, this.exposure], 24);
                u.set([this.cavity, 0, 0, 0], 28);
                d.queue.writeBuffer(r.uniform, 0, u);
                pass.setPipeline(this.pipeline);
                pass.setBindGroup(0, r.bind);
                pass.setVertexBuffer(0, r.vertex);
                pass.setIndexBuffer(r.index, 'uint32');
                pass.drawIndexed(mesh.indices.length);
                if (this.wire) {
                    pass.setPipeline(this.wirePipeline);
                    pass.setBindGroup(0, r.wireBind);
                    pass.setIndexBuffer(r.edges, 'uint32');
                    pass.drawIndexed(r.edgeCount);
                }
            }
            pass.end();
            d.queue.submit([encoder.finish()]);
        }
        else {
            const g = this.gl, u = this.uniforms;
            g.viewport(0, 0, c.width, c.height);
            g.clearColor(0, 0, 0, 0);
            g.clear(g.COLOR_BUFFER_BIT | g.DEPTH_BUFFER_BIT);
            g.enable(g.DEPTH_TEST);
            g.depthFunc(g.LESS);
            g.disable(g.CULL_FACE);
            g.useProgram(this.program);
            g.uniformMatrix4fv(u.vp, false, camera.vp);
            g.uniform3fv(u.eye, camera.eye);
            g.uniform1f(u.exposure, this.exposure);
            g.uniform1f(u.cavityStrength, this.cavity);
            for (const o of objects) {
                if (!o.visible)
                    continue;
                const mesh = o.mesh, r = this.getResource(mesh), mat = o.customMaterial || MATERIALS[o.material] || MATERIALS[0];
                g.bindVertexArray(r.vao);
                g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, r.index);
                g.uniform3fv(u.base, mat.color);
                g.uniform1f(u.rough, mat.roughness);
                g.uniform1f(u.metal, mat.metallic);
                g.uniform1i(u.wire, 0);
                if (this.wire) {
                    g.enable(g.POLYGON_OFFSET_FILL);
                    g.polygonOffset(1, 1);
                }
                g.drawElements(g.TRIANGLES, mesh.indices.length, g.UNSIGNED_INT, 0);
                g.disable(g.POLYGON_OFFSET_FILL);
                if (this.wire) {
                    g.uniform1i(u.wire, 1);
                    g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, r.edges);
                    g.depthFunc(g.LEQUAL);
                    g.drawElements(g.LINES, r.edgeCount, g.UNSIGNED_INT, 0);
                    g.depthFunc(g.LESS);
                }
            }
            g.bindVertexArray(null);
        }
        this.ms = performance.now() - start;
    }
    async deform(records, mode, falloff) {
        const start = performance.now(), count = records.length / 24;
        this.lastCandidates = count;
        if (!count)
            return new Float32Array();
        if (!this.device || !this.computeEnabled) {
            const r = deformCPU(records, mode, falloff);
            this.computeMS = performance.now() - start;
            return r;
        }
        const d = this.device;
        let s = this.scratch;
        if (!s || s.capacity < count) {
            if (s)
                for (const k of ['input', 'output', 'readback', 'uniform'])
                    s[k].destroy();
            const capacity = 2 ** Math.ceil(Math.log2(Math.max(128, count)));
            if (capacity * 96 > d.limits.maxStorageBufferBindingSize)
                throw Error('Brush footprint exceeds GPU storage buffer limits. Reduce brush radius.');
            s = { capacity };
            s.input = d.createBuffer({ size: capacity * 96, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
            s.output = d.createBuffer({ size: capacity * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
            s.readback = d.createBuffer({ size: capacity * 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
            s.uniform = d.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
            s.bind = d.createBindGroup({ layout: this.compute.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: s.input } }, { binding: 1, resource: { buffer: s.output } }, { binding: 2, resource: { buffer: s.uniform } }] });
            this.scratch = s;
        }
        d.queue.writeBuffer(s.input, 0, records);
        d.queue.writeBuffer(s.uniform, 0, new Uint32Array([count, mode, falloff, 0]));
        const encoder = d.createCommandEncoder(), pass = encoder.beginComputePass();
        pass.setPipeline(this.compute);
        pass.setBindGroup(0, s.bind);
        pass.dispatchWorkgroups(Math.ceil(count / 128));
        pass.end();
        encoder.copyBufferToBuffer(s.output, 0, s.readback, 0, count * 16);
        d.queue.submit([encoder.finish()]);
        await s.readback.mapAsync(GPUMapMode.READ, 0, count * 16);
        let out;
        try {
            out = new Float32Array(s.readback.getMappedRange(0, count * 16).slice(0));
        }
        finally {
            s.readback.unmap();
        }
        this.computeMS = performance.now() - start;
        return out;
    }
    collect(objects) { const used = new Set(objects.filter(o => o.visible).map(o => o.mesh.uid)); for (const [id, r] of this.resources)
        if (!used.has(id)) {
            if (this.device) {
                for (const k of ['vertex', 'index', 'uniform', 'edges'])
                    r[k]?.destroy();
            }
            else {
                for (const k of ['vertex', 'index', 'edges'])
                    if (r[k])
                        this.gl.deleteBuffer(r[k]);
                this.gl.deleteVertexArray(r.vao);
            }
            this.resources.delete(id);
        } }
}
