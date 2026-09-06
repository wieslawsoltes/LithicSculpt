"""Optional real-browser integration checks (pip install playwright).
Build first: npm run build. Run: python tests/browser_checks.py.
CHROMIUM selects a browser executable; DISPLAY may be required for software GL.
Uses set_content so the standalone bundle is tested without a web server.
WebGPU and IndexedDB need a secure origin; use gpu-smoke.html for GPU checks.
"""
import asyncio, json, os
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
async def main():
    results=[]
    async with async_playwright() as pw:
        browser=await pw.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader'])
        page=await browser.new_page(viewport={'width':1512,'height':982},device_scale_factor=1)
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        await page.set_content((ROOT/'dist/lithic-sculpt.html').read_text(),wait_until='domcontentloaded')
        await page.wait_for_function('window.lithic?.ready',timeout=30000)
        async def check(name,code):
            value=await page.evaluate(code)
            assert value, f'{name}: {value}'
            results.append({'test':name,'passed':True})
            print('PASS',name,flush=True)
        async def settled():
            await page.wait_for_function('!lithic.busy && !lithic.stroke && !lithic.processing',timeout=45000)
        await check('Seven editable starter objects; renderer initialized','lithic.objects.length===7 && lithic.renderer.backend==="WebGL2"')
        await page.screenshot(path=str(ROOT/'tests/preview-desktop.png'))
        await page.evaluate('window._before=lithic.active.mesh.v.slice(); window._sculpted=lithic.active')
        rect=await page.locator('#canvas').bounding_box()
        x=rect['x']+rect['width']*.49; y=rect['y']+rect['height']*.20
        await page.mouse.move(x,y)
        await page.mouse.down()
        await page.mouse.move(x+32,y+20,steps=8)
        await page.mouse.up()
        await settled()
        await check('Pointer drag changes actual vertex coordinates','_sculpted.mesh.v.some((v,i)=>i%8<3&&v!==_before[i]) && lithic.history.past.length===1')
        await page.evaluate('window._after=_sculpted.mesh.v.slice()')
        await page.keyboard.press('Control+z')
        await check('Keyboard undo restores vertex and mask values exactly','_sculpted.mesh.v.every((v,i)=>i%8>=4||v===_before[i])')
        await page.keyboard.press('Control+Shift+z')
        await check('Keyboard redo restores deformation exactly','_sculpted.mesh.v.every((v,i)=>i%8>=4||v===_after[i])')
        await page.click('[data-brush="mask"]')
        await page.mouse.click(x,y)
        await settled()
        await check('Mask pointer dab paints vertex mask values','_sculpted.mesh.v.some((v,i)=>i%8===3&&v>0)')
        await page.evaluate('lithic.maskAction("all"); window._masked=lithic.active.mesh.v.slice()')
        await page.click('[data-brush="draw"]')
        await page.mouse.click(x,y)
        await settled()
        await check('Mask-all prevents geometric deformation','_sculpted.mesh.v.every((v,i)=>i%8>=3||v===_masked[i])')
        await page.evaluate('lithic.maskAction("clear")')
        await check('Mask clear removes protection','lithic.active.mesh.v.every((v,i)=>i%8!==3||v===0)')
        await page.click('[data-material="3"]')
        await check('Material selection changes scene state','lithic.active.material===3')
        await page.click('#wire-button')
        await check('Wireframe toggle renders without errors','lithic.renderer.wire && lithic.ready')
        await page.click('#wire-button')
        await page.evaluate('window._yaw=lithic.camera.yaw')
        await page.mouse.move(x,y)
        await page.mouse.down(button='right')
        await page.mouse.move(x+44,y+6,steps=4)
        await page.mouse.up(button='right')
        await check('Right-drag orbits camera','lithic.camera.yaw!==_yaw')
        await page.click('[data-primitive="sphere"]')
        await check('Adding a primitive creates a separate sculpt object','lithic.objects.length===8 && lithic.active.mesh.count===10242')
        await page.evaluate('lithic.actions.undo()')
        await check('Undo removes added object','lithic.objects.length===7')
        await page.evaluate('lithic.actions.redo()')
        await check('Redo reinstates added object','lithic.objects.length===8')
        await page.evaluate('window._coarse=lithic.active.mesh; lithic.topological("subdivide")')
        await settled()
        await check('Standalone Blob worker performs Loop subdivision','lithic.active.levels.length===2 && lithic.active.mesh.count===40962 && lithic.active.transitions.length===1')
        await page.click('#level-down')
        await check('Subdivision down selects retained coarse mesh','lithic.active.mesh===_coarse && lithic.active.level===0')
        await page.click('#level-up')
        await check('Subdivision up selects retained detail mesh','lithic.active.level===1 && lithic.active.mesh.count===40962')
        await page.evaluate('lithic.changeLevel(-1); lithic.settings.resolution=16; lithic.topological("remesh")')
        await settled()
        await check('Standalone remesh worker returns closed real geometry','lithic.active.levels.length===1 && lithic.active.mesh.count!==_coarse.count && lithic.active.mesh.diagnostics.boundaryEdges===0 && lithic.active.mesh.diagnostics.nonManifoldEdges===0')
        await page.evaluate('lithic.actions.undo()')
        await check('Undo remeshing restores subdivision hierarchy','lithic.active.levels.length===2 && lithic.active.mesh===_coarse')
        async with page.expect_download() as event:
            await page.evaluate('lithic.actions.save()')
        project=await event.value
        saved=ROOT/'tests/browser-roundtrip.lithic'
        await project.save_as(str(saved))
        parsed=json.loads(saved.read_text())
        assert parsed['format']=='lithic-sculpt' and len(parsed['objects'])==8
        results.append({'test':'Save generates complete editable project download','passed':True})
        await page.set_input_files('#file-input',str(saved))
        await settled()
        await check('Project input restores objects and clears session history','lithic.objects.length===8 && lithic.history.past.length===0 && lithic.objects.at(-1).levels.length===2')
        saved.unlink()
        await page.set_viewport_size({'width':390,'height':844})
        await page.wait_for_timeout(200)
        await check('Mobile viewport keeps a usable rendering surface','document.querySelector("#canvas").clientWidth>240 && document.querySelector("#canvas").clientHeight>300 && lithic.ready')
        await page.screenshot(path=str(ROOT/'tests/preview-mobile.png'))
        assert not errors,errors
        results.append({'test':'No uncaught browser exceptions','passed':True})
        report={'backend':await page.evaluate('lithic.renderer.backend'),'browser':browser.version,'environment':'Chromium SwiftShader / about:blank; IndexedDB and WebGPU unavailable on this test origin','passed':len(results),'failed':0,'results':results}
        (ROOT/'tests/browser-results.json').write_text(json.dumps(report,indent=2)+'\n')
        print(json.dumps(report,indent=2))
        await browser.close()
asyncio.run(main())
