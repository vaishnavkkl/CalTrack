// Isolated browser layout checks; API fixtures never touch the application database.
// Start Vite on 5175, then run: node scripts/check-ui.mjs
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const origin = process.env.UI_CHECK_ORIGIN || 'http://127.0.0.1:5175';
const browserPath = process.env.BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const output = path.resolve('artifacts/ui-check');
fs.mkdirSync(output, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'caltrack-ui-'));
const browser = spawn(browserPath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let ws;
const user = { id: 1, username: 'reviewer', email: 'reviewer@example.test', displayName: 'Alex Morgan', role: 'super_admin' };
const opportunity = {
  id: 'test-rfo', solicitationNumber: 'RFO-2026-001', solicitationType: 'RFO',
  title: 'Enterprise Data Platform Modernization, Cloud Migration and Cybersecurity Advisory Services for Statewide Public Agencies',
  agency: 'California Department of Technology and Digital Services', department: 'Technology',
  description: 'Cloud migration, software engineering, cybersecurity and data integration services for public agencies.',
  category: 'IT Consulting & Services', publishedAt: '2026-09-20T12:00:00Z', closesAt: '2027-01-20T20:00:00Z',
  location: 'California', sourcePortal: 'Cal eProcure', sourceGroup: 'caleprocure', sourceUrl: 'https://example.test/rfo',
  attachments: [{ name: 'Enterprise-Modernization-Statement-of-Work-and-Submission-Requirements.pdf', url: 'https://example.test/document' }],
  status: 'Qualified', relevanceScore: 94, reviewed: true, saved: true, archived: false, notes: '',
  ownerName: 'Alex Morgan', priority: 'High', resourcePreparationSelected: true, nextAction: 'Review requirements', tags: ['Cloud'],
  firstCollectedAt: '2026-09-20', lastCheckedAt: '2026-09-29', lastUpdatedAt: '2026-09-29', sourceStatus: 'Open'
};
const opportunities = [opportunity, { ...opportunity, id: 'test-rfo-2', title: 'Managed Application Support and Database Administration', sourceGroup: 'priority', sourcePortal: 'OpenGov', saved: false, relevanceScore: 86 }];
const workflow = { opportunityId: opportunity.id, decision: 'Qualified', decisionReason: '', decisionNotes: '',
  requiredResources: [{ id: 'architect', title: 'Senior Enterprise Cloud and Information Security Architect', count: 2, minimumYears: 8, skills: ['Cloud architecture', 'Cybersecurity'], qualifications: 'Experience delivering enterprise migrations.' }],
  uAndARequired: 'Yes', candidatesRequired: 2, candidatesProvided: 1, contractTerm: '24 months', budget: '$500,000', contractMode: 'Hybrid',
  sourcingBrief: 'Find experienced cloud engineers for a statewide modernization program.', sourcingStatus: 'Open',
  documentationItems: [{ id: 'doc-optional', label: 'Optional company introduction', required: false, status: 'Ready', owner: '' }, { id: 'doc1', label: 'Technical response and staffing qualifications', required: true, status: 'Missing', owner: 'Alex Morgan' }],
  documentationNotes: '', responseStatus: 'In progress', responseReviewNotes: '', decidedBy: 'Alex Morgan', reviewedBy: '', createdAt: '2026-09-20', updatedAt: '2026-09-29' };
const portal = { id: 'ca', name: 'California Statewide Technology Procurement', portalType: 'State', baseUrl: 'https://example.test', connectorKey: 'caleprocure', provider: 'caleprocure', organizationName: 'California', accountScope: 'statewide', opportunityGroup: 'caleprocure', authMode: 'public', enabled: true, isPrimary: true, cadence: 'Daily', status: 'Healthy' };
let authenticated = true;
let removed = false;
let failNextSave = false;
const mutations = [];
function response(url, request) {
  if (request.method !== 'GET') mutations.push({ url, method: request.method, body: JSON.parse(request.postData || '{}') });
  const route = new URL(url).pathname.replace('/api', '');
  if (route === '/auth/me') return { user: authenticated ? user : null };
  if (route === '/opportunities') return { opportunities };
  if (route.startsWith('/opportunities/')) {
    if (request.method === 'PATCH' && JSON.parse(request.postData).resourcePreparationSelected === false) removed = true;
    return { opportunity: { ...opportunity, resourcePreparationSelected: !removed } };
  }
  if (route === '/bids') return { bids: removed ? [] : [{ opportunity, workflow, candidateCount: 0, shortlistedCount: 0, responseFileCount: 0, pendingFileCount: 0 }] };
  if (route.endsWith('/workflow') && request.method === 'PATCH') {
    Object.assign(workflow, JSON.parse(request.postData), { updatedAt: new Date().toISOString() });
    return { workflow, opportunity };
  }
  if (route.endsWith('/files')) return { files: [{ id: 'file1', opportunityId: opportunity.id, documentationItemId: 'doc1',
    fileName: 'Enterprise-Cloud-Modernization-Technical-Response-and-Staffing-Qualifications-Version-2026.pdf',
    category: 'Technical response', description: 'Complete technical proposal for review.', mimeType: 'application/pdf', sizeBytes: 256000,
    version: 2, uploadedBy: 1, uploadedByName: 'Alex Morgan', reviewStatus: 'Pending review', reviewNotes: '', reviewedByName: '',
    createdAt: '2026-09-29', updatedAt: '2026-09-29', downloadUrl: '/api/response-files/file1/download' }] };
  if (route === '/candidates') return { candidates: [{ id: 'candidate1', opportunityId: opportunity.id, resourceRequirementId: 'architect',
    fullName: 'Alexandra Montgomery-Wellington', currentTitle: 'Senior Enterprise Cloud and Information Security Architect',
    location: 'Sacramento, California', yearsExperience: 12, availability: 'Two weeks', skills: ['Cloud architecture', 'Cybersecurity'],
    qualificationSummary: 'Led large enterprise migrations and security programs.', profileReference: 'ATS-123', submittedBy: 1,
    submittedByName: 'Alex Morgan', reviewStatus: 'Reviewing', reviewNotes: '', createdAt: '2026-09-29', updatedAt: '2026-09-29',
    resume: { fileName: 'Alexandra-Montgomery-Wellington-Senior-Enterprise-Cloud-Architect-Resume.pdf', sizeBytes: 256000, downloadUrl: '/api/candidates/candidate1/resume' } }] };
  if (route === '/settings/attachments') return { files: [{ id: 'candidate1', fileName: 'Alexandra-Montgomery-Wellington-Senior-Enterprise-Cloud-Architect-Resume.pdf', sizeBytes: 256000, createdAt: '2026-09-29', context: 'Alexandra Montgomery-Wellington', kind: 'resume' }, { id: 'file1', fileName: 'Enterprise-Cloud-Modernization-Technical-Response-and-Staffing-Qualifications.pdf', sizeBytes: 1024000, createdAt: '2026-09-29', context: opportunity.title, kind: 'response' }] };
  if (route === '/portals') return { portals: [portal] };
  if (route === '/jobs') return { jobs: [] };
  if (route === '/dashboard') return { stats: { total: 2, new_count: 1, saved_count: 1, high_match_count: 1, due_soon_count: 0, pending_decisions: 1, open_sourcing: 1, ready_for_review: 0 }, recent: opportunities, upcoming: opportunities, portalErrors: 0 };
  if (route === '/settings') return { settings: { includedKeywords: ['cloud', 'software development'], excludedKeywords: ['hardware'], preferredAgencies: [], collectionFrequency: 'daily', emailDigest: false, deadlineAlerts: true }, account: { email: user.email } };
  throw new Error(`Unmocked API route: ${route}`);
}
try {
  let port;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (fs.existsSync(path.join(profile, 'DevToolsActivePort'))) { port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; break; }
    await pause(100);
  }
  assert.ok(port, 'Chrome started');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  ws = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onclose = (event) => console.error('Browser connection closed', event.code, event.reason);
  let sequence = 0;
  const pending = new Map();
  const errors = [];
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => reject(new Error(`Browser command timed out: ${method}`)), 10000);
    pending.set(id, { resolve: (value) => { clearTimeout(timeout); resolve(value); }, reject: (error) => { clearTimeout(timeout); reject(error); } });
    ws.send(JSON.stringify({ id, method, params }));
  });
  ws.onmessage = async ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const promise = pending.get(message.id);
      if (promise) { pending.delete(message.id); message.error ? promise.reject(message.error) : promise.resolve(message.result); }
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.method === 'Fetch.requestPaused') {
      try {
        if (failNextSave && message.params.request.url.endsWith('/workflow')) {
          failNextSave = false;
          await send('Fetch.fulfillRequest', { requestId: message.params.requestId, responseCode: 503,
            responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify({ error: 'Test connection issue. Please retry.' })).toString('base64') });
          return;
        }
        await send('Fetch.fulfillRequest', { requestId: message.params.requestId, responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
          body: Buffer.from(JSON.stringify(response(message.params.request.url, message.params.request))).toString('base64') });
      } catch (error) { errors.push(String(error)); }
    }
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*/api/*' }] });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  async function ready(selector) {
    for (let i = 0; i < 80; i++) {
      if (await evaluate(`!!document.querySelector(${JSON.stringify(selector)}) && !document.querySelector('.loading-state')`)) { await pause(100); return; }
      await pause(100);
    }
    throw new Error(`Timed out: ${selector}`);
  }
  const inspect = () => evaluate(`(() => {
    const scope = document.querySelector('[role=dialog]') || document;
    const overflow = [...scope.querySelectorAll('button, h1, h2, h3, h4, p, label, .card, .workspace-section, .topbar')].filter(e => {
      const r = e.getBoundingClientRect(), s = getComputedStyle(e);
      if (!r.width || !r.height || e.closest('.table-scroll, .settings-nav, .sourcing-tabs') || s.overflowX === 'auto' || s.overflowX === 'scroll') return false;
      return e.scrollWidth > e.clientWidth + 2;
    }).map(e => ({ element: e.className || e.tagName, text: e.textContent.slice(0,80), width: e.clientWidth, scroll: e.scrollWidth }));
    const controls = [...scope.querySelectorAll('.topbar button, .button, input, select, textarea')].filter(e=>e.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true }) && !e.closest('.table-scroll') && (!e.closest('details:not([open])') || e.closest('summary')));
    const overlaps = [];
    for(let i=0;i<controls.length;i++) for(let j=i+1;j<controls.length;j++) {
      const a=controls[i],b=controls[j]; if(a.contains(b)||b.contains(a)) continue;
      const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();
      if(Math.min(x.right,y.right)-Math.max(x.left,y.left)>2 && Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top)>2) overlaps.push([a.className||a.tagName,b.className||b.tagName]);
    }
    return { bodyOverflow: document.documentElement.scrollWidth > innerWidth+1, overflow, overlaps, theme: document.documentElement.dataset.theme };
  })()`);
  const report = [];
  for (const width of (process.env.UI_CHECK_WIDTHS || '1440,1024,768,390,320').split(',').map(Number)) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    for (const theme of ['light', 'dark']) {
      for (const route of (process.env.UI_CHECK_ROUTES || '/opportunities,/bid-decisions,/response-review,/talent-sourcing,/dashboard,/portal-controls,/collection-jobs,/settings').split(',')) {
        await send('Page.navigate', { url: origin + route });
        await ready('main');
        if (width === 1440 && theme === 'light' && route === '/opportunities') {
          assert.equal(await evaluate('document.documentElement.dataset.theme'), 'light', 'New sessions open in light mode');
        }
        await evaluate(`document.querySelector('[title="Use ${theme} mode"]').click()`);
        await pause(240);
        const result = await inspect();
        report.push({ width, theme, route, ...result });
        if (route === '/dashboard') {
          await evaluate('document.querySelector(".account-trigger").click()');
          assert.equal(await evaluate('document.querySelector(".account-popover-details").textContent.includes("reviewer@example.test")'), true);
          assert.equal(await evaluate('document.querySelector(".account-signout").textContent.trim()'), 'Sign out');
          report.push({ width, theme, route: 'account-menu', ...await inspect() });
          await evaluate('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))');
          assert.equal(await evaluate('document.querySelector(".account-popover")'), null);
        }
        if (route === '/opportunities') {
          assert.equal(await evaluate('document.querySelector(".rfo-relevance .match-badge").textContent.includes("94% match")'), true, 'Match percentage remains visible');
          assert.equal(await evaluate('document.querySelector(".rfo-category").textContent'), opportunity.category);
          assert.ok(await evaluate('document.querySelector(".published-date").textContent.includes("Published")'));
        }
        assert.deepEqual(await evaluate(`([...document.querySelectorAll('.preparation-queue-item > button.active, .response-queue > button.active, .sourcing-tabs button.active, .settings-nav button.active')].filter(e => getComputedStyle(e).boxShadow.includes('inset')).map(e=>e.className))`), [], 'No inset selection stripes');
        if (route === '/opportunities' && width >= 768) {
          const tableFit = await evaluate('(() => {const s=document.querySelector(".table-scroll"),t=s.querySelector("table");return {scroll:s.scrollWidth,client:s.clientWidth,table:t.getBoundingClientRect().width,style:t.getAttribute("style"),zoom:document.documentElement.style.zoom,columns:[...t.querySelectorAll("col")].map(c=>c.getBoundingClientRect().width)};})()');
          assert.ok(tableFit.scroll <= tableFit.client + 1, `RFO deadlines fit at ${width}px: ${JSON.stringify(tableFit)}`);
        }
        if (route === '/bid-decisions' && [1440, 390].includes(width)) {
          const screenshot = await send('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(path.join(output, `prepare-${theme}-${width}.png`), Buffer.from(screenshot.data, 'base64'));
        }
        if (route === '/opportunities' && [1440, 390].includes(width)) {
          const screenshot = await send('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(path.join(output, `${theme}-${width}.png`), Buffer.from(screenshot.data, 'base64'));
        }
        if (route === '/response-review' && theme === 'dark' && [1440, 320].includes(width)) {
          const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
          fs.writeFileSync(path.join(output, `response-${width}.png`), Buffer.from(screenshot.data, 'base64'));
        }
        if (route === '/settings') {
          await evaluate(`[...document.querySelectorAll('.settings-nav button')].find(e=>e.textContent==='Data management').click()`);
          await ready('.attachment-list');
          report.push({ width, theme, route: 'attachment-manager', ...await inspect() });
          assert.equal(await evaluate('document.querySelectorAll(".attachment-list article").length'), 2);
          if ([1440, 320].includes(width) && theme === 'dark') {
            const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
            fs.writeFileSync(path.join(output, `attachments-${width}.png`), Buffer.from(screenshot.data, 'base64'));
          }
        }
        if (route === '/talent-sourcing' && [1440, 320].includes(width) && theme === 'dark') {
          const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
          fs.writeFileSync(path.join(output, `candidates-${width}.png`), Buffer.from(screenshot.data, 'base64'));
        }
      }
    }
  }
  // Verify theme persistence and long-title drawer at phone width.
  await send('Page.navigate', { url: origin + '/opportunities' }); await ready('.table-title button');
  assert.equal(await evaluate('document.documentElement.dataset.theme'), 'dark');
  await evaluate("document.querySelector('.table-title button').click()"); await ready('[role=dialog]');
  report.push({ width: 320, theme: 'dark', route: 'drawer', ...await inspect() });
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  assert.equal(await evaluate('!!document.querySelector("[role=dialog]")'), false);
  // Check app zoom extremes, persistence, and reset without changing browser zoom.
  for (const width of [1440, 320]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    for (const level of [75, 125, 100]) {
      await evaluate(`document.querySelector('.zoom-reset').click()`); await pause(30);
      for (let i = 0; i < Math.abs(level - 100) / 5; i++) { await evaluate(`document.querySelector('[aria-label="Zoom ${level < 100 ? 'out' : 'in'}"]').click()`); await pause(20); }
      await pause(80);
      assert.equal(await evaluate('Number(document.documentElement.style.zoom)'), level / 100);
      report.push({ width, theme: 'dark', route: `zoom-${level}`, ...await inspect() });
      if (level === 75) {
        await send('Page.reload'); await ready('.zoom-reset'); await pause(150);
        for (let attempt = 0; attempt < 20 && await evaluate('Number(document.documentElement.style.zoom)') !== .75; attempt++) await pause(50);
        assert.equal(await evaluate('Number(document.documentElement.style.zoom)'), .75);
      }
    }
  }
  // Preparation sections keep the decision mounted, and removal is reversible.
  await send('Page.navigate', { url: origin + '/bid-decisions?rfo=test-rfo' }); await ready('.preparation-editor');
  for (const section of ['Contract details', 'People', 'Decision']) {
    await evaluate(`[...document.querySelectorAll('.preparation-sections button')].find(b => b.textContent.includes('${section}')).click()`); await pause(50);
    assert.equal(await evaluate('[...document.querySelectorAll(".preparation-panel")].filter(e => !e.hidden).length'), 1);
    report.push({ width: 320, theme: 'dark', route: `prepare-${section}`, ...await inspect() });
  }
  await evaluate('window.confirm = () => false; document.querySelector(".remove-preparation").click()');
  assert.equal(mutations.length, 0, 'Cancel removal leaves the bid unchanged');
  await evaluate('window.confirm = () => true; document.querySelector(".remove-preparation").click()'); await pause(200);
  assert.equal(await evaluate('!!document.querySelector(".preparation-editor")'), false, 'Removed bid disappears');
  assert.deepEqual(mutations[0].body, { resourcePreparationSelected: false });
  assert.equal(mutations[0].method, 'PATCH', 'Removal does not delete the RFO');
  await send('Page.reload'); await ready('main');
  assert.equal(await evaluate('!!document.querySelector(".preparation-editor")'), false, 'Removal persists after reload');
  // Comfort features: field priority, inline validation, keyboard save, and draft guards.
  removed = false;
  await send('Page.navigate', { url: origin + '/bid-decisions' }); await ready('.preparation-editor');
  await evaluate(`[...document.querySelectorAll('.decision-choices button')].find(b=>b.textContent.includes('Pass on bid')).click()`);
  await evaluate(`document.querySelector('.comfort-save .button-primary').click()`); await pause(100);
  assert.equal(await evaluate('document.activeElement.id'), 'qualification-reason', 'Missing required reason receives focus');
  assert.ok(await evaluate('document.querySelector(".save-error").textContent.includes("reason")'));
  const setField = async (selector, value) => evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); const prototype=e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true})); })()`);
  await setField('#qualification-reason', 'Timeline risk');
  const saveShortcut = async () => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 's', code: 'KeyS', modifiers: 2, windowsVirtualKeyCode: 83 }); await pause(200); };
  await saveShortcut();
  assert.ok(await evaluate('document.querySelector(".save-status").textContent.includes("Saved just now")'));
  await evaluate(`document.querySelector('.optional-fields summary').click()`);
  await setField('.optional-fields textarea', 'Keep this review note until I save it.');
  await evaluate(`window.confirm=()=>false; document.querySelector('a[href="/opportunities"]').click()`);
  assert.ok((await evaluate('location.pathname')).includes('bid-decisions'), 'Navigation canceled for unsaved changes');
  await evaluate(`[...document.querySelectorAll('.preparation-sections button')].find(b=>b.textContent.includes('Contract details')).click()`);
  assert.equal(await evaluate('document.querySelector(".intelligence-grid label span").textContent.startsWith("Budget")'), true, 'Contract basics come first');
  await evaluate(`[...document.querySelectorAll('.preparation-sections button')].find(b=>b.textContent.includes('Decision')).click()`);
  assert.equal(await evaluate('document.querySelector(".optional-fields textarea").value'), 'Keep this review note until I save it.');
  await saveShortcut();
  workflow.decision = 'Qualified';
  await send('Page.navigate', { url: origin + '/response-review' }); await ready('.review-checklist');
  assert.equal(await evaluate('document.querySelector(".review-checklist .doc-label input").id'), 'document-doc1', 'Incomplete required item comes before ready optional item');
  await evaluate('document.querySelector(".attention-filter").click()');
  assert.equal(await evaluate('document.querySelectorAll(".review-checklist > div").length'), 1, 'Attention filter hides ready items');
  await setField('#document-doc1', 'Updated technical response');
  failNextSave = true;
  await saveShortcut();
  assert.ok(await evaluate('document.querySelector(".save-error").textContent.includes("retry")'));
  assert.equal(await evaluate('document.querySelector("#document-doc1").value'), 'Updated technical response', 'Failed saves preserve entries');
  await saveShortcut();
  assert.ok(await evaluate('document.querySelector(".save-status").textContent.includes("Saved just now")'));
  report.push({ width: 320, theme: 'dark', route: 'review-priority-fields', ...await inspect() });
  // Login screen uses the same theme switch.
  authenticated = false;
  for (const width of [1440, 390, 320]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: origin }); await ready('.login-card');
    report.push({ width, theme: 'dark', route: 'login', ...await inspect() });
  }
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ report, errors }, null, 2));
  const failures = report.filter((result) => result.bodyOverflow || result.overflow.length || result.overlaps.length);
  console.log(JSON.stringify({ checked: report.length, failures, errors }, null, 2));
  assert.equal(errors.length, 0, 'No browser exceptions');
  assert.equal(failures.length, 0, 'No unexpected overflow or overlapping controls');
} finally {
  ws?.close();
  browser.kill();
  // Leave the isolated profile to OS temp cleanup; never touch a personal profile.
}
