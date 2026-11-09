const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const ROOT = path.resolve(__dirname, '..');
const ARTIFACTS = process.env.JC_ARTIFACT_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'jc-release-'));
fs.mkdirSync(ARTIFACTS, {recursive:true});
const results = [];
(async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROME_BIN || undefined,headless:true});
  const context = await browser.newContext({reducedMotion:'reduce',viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write']});
  const errors = [];
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await context.route('**/*', async route => {
    const url = route.request().url();
    if (url === 'http://localhost:18765/' || url === 'http://localhost:18765/public/index.html') return route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(ROOT, 'public/index.html'),'utf8')});
    if (url === 'http://localhost:18765/src/template.html') return route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(ROOT, 'src/template.html'),'utf8')});
    if (url.includes('/health')) return route.fulfill({contentType:'application/json',body:'{"status":"ok"}'});
    if (url.includes('/props')) return route.fulfill({contentType:'application/json',body:'{"model_alias":"Test model","default_generation_settings":{"n_ctx":8192}}'});
    return route.abort();
  });
  async function check(name, fn) {try {await fn(); results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:e.message});}}
  const command = () => page.evaluate(() => window.JC.build());
  await page.goto('http://localhost:18765/');
  await check('blank state requires model and contains no private profile', async()=>{
    assert.match(await page.locator('#statusText').innerText(),/Add a model/);
    assert.equal(await page.locator('#p-mine').isVisible(),false);
    assert.equal(await page.locator('.opt').count(),257);
    assert.equal(await page.locator('#profile').textContent(),'null');
  });
  await check('fetchable answers match the built command', async()=>{
    try {
      const answers = await page.locator('pre.answer').evaluateAll(els => els.map(el => el.textContent));
      assert.equal(answers.length, 4);
      const raw = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
      const head = raw.split('<script type="application/json" id="profile">', 1)[0];
      const ids = ['gpu', 'long', 'cpu', 'readonly'];
      await page.locator('#model').fill('/path/to/your-model.gguf');
      for (let i = 0; i < ids.length; i++) {
        assert.ok(head.includes(answers[i]), ids[i]);
        await page.locator('#p-' + ids[i]).check();
        assert.equal(await command(), answers[i]);
      }
    } finally {
      await page.locator('#reset').click();
    }
  });
  await check('Linux model command, copy, and persistence',async()=>{
    await page.locator('#model').fill("/tmp/models/O'Brien $(touch SHOULD_NOT_EXIST).gguf");
    assert.match(await command(), /--port 8080/);
    assert.match(await page.locator('#statusText').innerText(),/Ready/);
    await page.locator('#copy').click();
    assert.equal(await page.evaluate(()=>navigator.clipboard.readText()), await command());
    const before=await command(); await page.reload(); assert.equal(await command(),before);
  });
  await check('credentials remain usable but never persist, including legacy migration',async()=>{
    const before = await page.evaluate(()=>JSON.parse(JSON.stringify(JC.state())));
    try {
    await page.evaluate(()=>{
      const s=JC.state();
      s.opts['--api-key']={v:'dummy-api-secret'};
      s.opts['-hft']={v:'dummy-hf-secret'};
      s.opts['--api-key-file']={v:'/tmp/server-keys.txt'};
      JC.set(s);
    });
    assert.match(await command(),/dummy-api-secret/);
    assert.match(await command(),/dummy-hf-secret/);
    assert.doesNotMatch(await page.evaluate(()=>localStorage.getItem('jumper-cables-state-v1')),/dummy-/);
    await page.reload();
    assert.doesNotMatch(await command(),/dummy-/);
    assert.match(await command(),/--api-key-file \/tmp\/server-keys.txt/);
    await page.evaluate(()=>{
      const s=JC.state();
      for(const k of ['--api-key','-hft','--hf-token']) s.opts[k]={v:'dummy-legacy-secret'};
      localStorage.setItem('jumper-cables-state-v1',JSON.stringify(s));
    });
    await page.reload();
    assert.doesNotMatch(await page.evaluate(()=>JSON.stringify(JC.state())),/dummy-/);
    assert.doesNotMatch(await page.evaluate(()=>localStorage.getItem('jumper-cables-state-v1')),/dummy-/);
    assert.match(await command(),/--api-key-file \/tmp\/server-keys.txt/);
    await page.reload();
    assert.doesNotMatch(await command(),/dummy-/);
    } finally { await page.evaluate(s=>JC.set(s),before); }
  });
  await check('POSIX command passes paths literally to a harmless executable',async()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(), 'jc-shell-'));
    try {
      const binDir=path.join(dir,"bin with ' spaces"); fs.mkdirSync(binDir);
      const executable=path.join(binDir,'llama-server');
      fs.writeFileSync(executable,'#!/usr/bin/env python3\nimport json,sys\nprint(json.dumps(sys.argv[1:]))\n',{mode:0o700});
      const model="/models/O'Brien $(printf unexpected) & model.gguf";
      await page.locator('#bin').fill(executable); await page.locator('#model').fill(model);
      const output=require('node:child_process').execFileSync('/bin/bash',['-c',await command()],{encoding:'utf8',timeout:5000});
      assert.deepEqual(JSON.parse(output),['-m',model,'--port','8080']);
      await page.locator('#bin').fill('');
    } finally {fs.rmSync(dir,{recursive:true,force:true});}
  });
  await check('presets and network warning',async()=>{
    await page.locator('#p-gpu').check(); assert.match(await command(),/--n-gpu-layers all/);
    await page.locator('#p-cpu').check(); assert.match(await command(),/--n-gpu-layers 0/);
    await page.locator('#p-share').check(); assert.match(await page.locator('#checks').innerText(),/no API key/);
    await page.locator('#apikey').fill('release-test-key'); assert.match(await page.locator('#statusText').innerText(),/Ready/);
    await page.locator('#p-auto').check();
  });
  await check('Hugging Face replaces local model',async()=>{
    await page.locator('#modelMode [data-v="hf"]').click(); await page.locator('#hf').fill('org/model-GGUF:Q4_K_M');
    assert.match(await command(),/-hf org\/model-GGUF:Q4_K_M/); assert.doesNotMatch(await command(),/-m /);
  });
  await check('memory estimate and CPU-only fallback',async()=>{
    await page.locator('#tune').evaluate(e=>e.open=true);
    await page.locator('#vram').fill('6'); await page.locator('#size').fill('8');
    assert.match(await page.locator('#fitText').innerText(),/won't fit fully/);
    await page.locator('#size').fill('2'); assert.match(await page.locator('#fitText').innerText(),/3.0 GB left/);
    await page.locator('#p-cpu').check(); assert.match(await page.locator('#fitText').innerText(),/CPU only/);
    await page.locator('#p-auto').check();
  });
  await check('macOS and PowerShell quoting',async()=>{
    await page.locator('#os [data-v="mac"]').click(); await page.locator('#bin').fill('/Applications/My LLM/llama-server');
    assert.match(await command(),/^'\/Applications\/My LLM\/llama-server'/);
    await page.locator('#os [data-v="win"]').click(); await page.locator('#bin').fill("C:\\O'Brien Folder\\llama-server.exe");
    assert.match(await command(),/^& 'C:\\O''Brien Folder\\llama-server.exe'/);
    assert.match(await command(),/`\n/);
  });
  await check('all options, search, add and remove',async()=>{
    await page.locator('[data-view="all"]').click(); await page.locator('#q').fill('--no-ui');
    const ctl=page.locator('.ctl[data-key="--ui"]'); await ctl.locator('.negb').click();
    assert.match(await command(),/--no-ui/);
    await page.locator('#cmd [data-rm="--ui"]').click(); assert.doesNotMatch(await command(),/--no-ui/);
    await page.locator('#q').fill('no-such-option-xyz'); assert.equal(await page.locator('#none').isVisible(),true);
    await page.locator('[data-view="setup"]').click();
  });
  await check('connection feedback with simulated healthy server',async()=>{
    await page.locator('#test').click(); await page.waitForFunction(()=>document.getElementById('statusText').textContent.includes('Test model'));
    assert.match(await page.locator('#statusText').innerText(),/8,192 tokens/);
  });
  await check('invalid port is not marked ready',async()=>{
    await page.locator('#tune').evaluate(e=>e.open=true); for (const value of ['0', '70000', '-1', '1.5']) {
      await page.locator('#port').fill(value);
      assert.doesNotMatch(await page.locator('#statusText').innerText(),/Ready/);
      assert.equal(await page.locator('#test').isDisabled(),true);
      assert.equal(await page.locator('#open').getAttribute('href'),null);
    }
    for (const value of ['1', '65535', '']) {
      await page.locator('#port').fill(value);
      assert.match(await page.locator('#statusText').innerText(),/Ready/);
      assert.equal(await page.locator('#test').isDisabled(),false);
    }
  });
  await check('connection failure explains browser and CORS limitations',async()=>{
    await context.route('**/health',route=>route.abort());
    await page.locator('#test').click();
    await page.waitForFunction(()=>document.getElementById('statusText').textContent.includes('No answer'));
    assert.match(await page.locator('#statusText').innerText(),/Browsers and --cors-origins/);
  });
  await page.locator('#reset').click();
  await page.locator('#model').fill('/models/example.gguf');
  await page.locator('#tune').evaluate(e=>e.open=false);
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:path.join(ARTIFACTS,'desktop.png'),animations:'disabled'});
  await check('sidebar topics navigate and show the correct option count',async()=>{
    const topics=await page.locator('.navgroup button').evaluateAll(items=>items.map(b=>({view:b.dataset.view,count:Number(b.querySelector('span').textContent)})));
    for(const topic of topics){
      await page.locator('.navgroup button[data-view="'+topic.view+'"]').click();
      assert.equal(await page.locator('#partsbin .opt:visible').count(),topic.count);
      assert.equal(await page.locator('.nav button[aria-current="true"]:visible').count(),1);
    }
    await page.locator('.nav button[data-view="setup"]').click();
  });
  await check('tablet sidebar last topic stays above the command bar',async()=>{
    await page.setViewportSize({width:1000,height:700});
    await page.waitForFunction(()=>{
      const side=document.querySelector('.side'); side.scrollTop=side.scrollHeight;
      const last=[...document.querySelectorAll('.navgroup button')].at(-1).getBoundingClientRect();
      return last.bottom<=document.querySelector('.bar').getBoundingClientRect().top;
    },null,{timeout:2000});
    const last=await page.locator('.navgroup button').last().boundingBox();
    const bar=await page.locator('.bar').boundingBox();
    assert.ok(last.y+last.height<=bar.y,'Last topic is obscured by the command bar');
    await page.locator('.navgroup button').last().click();
    assert.match(await page.locator('#optTitle').innerText(),/Removed/);
    await page.screenshot({path:path.join(ARTIFACTS,'tablet-sidebar.png'),animations:'disabled'});
    await page.locator('.nav button[data-view="setup"]').click();
  });
  await check('mobile layout and command sheet',async()=>{
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:path.join(ARTIFACTS,'mobile.png'),animations:'disabled'});
    await page.locator('#showCmd').click(); await page.locator('#panel').waitFor({state:'visible'});
    assert.equal(await page.locator('#panel').isVisible(),true);
    await page.screenshot({path:path.join(ARTIFACTS,'mobile-command.png'),animations:'disabled'});
    await page.keyboard.press('Escape'); assert.equal(await page.locator('#showCmd').getAttribute('aria-expanded'),'false');
  });
  await check('mobile command sheet keeps keyboard focus inside',async()=>{
    await page.locator('#showCmd').click(); await page.locator('#panel').waitFor({state:'visible'});
    await page.locator('#reset').focus(); await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'closePanel');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'reset');
    assert.equal(await page.locator('main').evaluate(e=>e.inert),true);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'showCmd');
    assert.equal(await page.locator('main').evaluate(e=>e.inert),false);
  });
  await check('command help link reveals its option and resizing restores navigation',async()=>{
    await page.locator('#showCmd').click(); await page.locator('#panel').waitFor({state:'visible'});
    await page.locator('#cmd [data-jump="-m"]').click();
    await page.locator('#panel').waitFor({state:'hidden'});
    assert.equal(await page.locator('.ctl[data-key="-m"]').isVisible(),true);
    await page.locator('#showCmd').click(); await page.locator('#panel').waitFor({state:'visible'});
    await page.setViewportSize({width:1440,height:1000});
    await page.waitForFunction(()=>!document.querySelector('main').inert);
    assert.equal(await page.locator('#panel').getAttribute('aria-modal'),null);
    await page.locator('.nav button[data-view="guide"]').click();
    assert.equal(await page.locator('#v-guide').isVisible(),true);
  });
  await check('source template opens the built preview',async()=>{
    const preview=await context.newPage();
    await preview.goto('http://localhost:18765/src/template.html');
    await preview.waitForURL('**/public/index.html');
    assert.equal(await preview.locator('.opt').count(),257);
    assert.doesNotMatch(await preview.locator('body').innerText(),/%%[A-Z_]+%%/);
    await preview.close();
  });
  await check('mixed loopback and network bind addresses require authentication',async()=>{
    await page.setViewportSize({width:1440,height:1000});
    await page.locator('.nav button[data-view="setup"]').click();
    await page.locator('#reset').click(); await page.locator('#model').fill('/models/example.gguf');
    await page.locator('.nav button[data-view="cat-network"]').click();
    const host=page.locator('.ctl[data-key="--host"]');
    await host.locator('input').fill('127.0.0.1,0.0.0.0'); await host.locator('.add').click();
    assert.match(await page.locator('#checks').innerText(),/no API key/);
    assert.doesNotMatch(await page.locator('#checks').innerText(),/Only this computer/);
    await host.locator('input').fill('127.0.0.1, ::1');
    assert.match(await page.locator('#checks').innerText(),/Only this computer/);
    await host.locator('input').fill('127.example.com');
    assert.match(await page.locator('#checks').innerText(),/no API key/);
    await host.locator('.add').click();
  });
  await check('speculative decoding alone does not count as a model',async()=>{
    await page.locator('#reset').click();
    await page.locator('.nav button[data-view="cat-spec"]').click();
    await page.locator('.ctl[data-key="--spec-default"] .add').click();
    assert.match(await page.locator('#statusText').innerText(),/Add a model/);
    await page.locator('.nav button[data-view="cat-presets"]').click();
    await page.locator('.ctl[data-key="--fim-qwen-7b-spec"] .add').click();
    assert.match(await page.locator('#statusText').innerText(),/Ready/);
    assert.doesNotMatch(await page.locator('#checks').innerText(),/More than one model source/);
  });
  await check('disabling agent mode does not report shell tools as enabled',async()=>{
    await page.locator('.nav button[data-view="cat-tools"]').click();
    const agent=page.locator('.ctl[data-key="-ag"]'); await agent.locator('.negb').click();
    assert.match(await command(),/--no-agent/);
    assert.doesNotMatch(await page.locator('#checks').innerText(),/Shell or write tools|Tools are on/);
    await agent.locator('.add').click();
    assert.match(await page.locator('#checks').innerText(),/Shell or write tools/);
  });
  await check('an explicit host runtime still warns before enabling shell tools',async()=>{
    const runtime=page.locator('.ctl[data-key="--tools-runtime"]');
    await runtime.locator('input').fill('none'); await runtime.locator('.add').click();
    assert.match(await page.locator('#checks').innerText(),/Shell or write tools/);
    await runtime.locator('input').fill('docker:example');
    assert.doesNotMatch(await page.locator('#checks').innerText(),/Shell or write tools/);
  });
  await check('no JavaScript errors',async()=>assert.deepEqual(errors,[]));
  await browser.close();
  fs.writeFileSync(path.join(ARTIFACTS,'results.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify(results,null,2));
  console.log('Artifacts:',ARTIFACTS);
  process.exitCode=results.some(r=>!r.pass)?1:0;
})().catch(e=>{console.error(e);process.exit(1)});
