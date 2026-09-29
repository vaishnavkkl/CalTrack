import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCalEProcure,
  parseCalEProcureDate,
  parseCalEProcureDetail,
  preferredTitle,
  collectCalEProcure
} from './caleprocure.mjs';

test('parses posted Cal eProcure event rows', () => {
  const html = `<table><tr id="trRESP_INQA_HD_VW_GR$0_row1">
    <td>BU001</td><td>Department of Technology</td><td>EVT00042</td>
    <td>Cloud Security RFP</td><td></td><td></td><td>08/30/2026 2:00 PM</td><td>Posted</td>
  </tr></table>`;
  const [result] = parseCalEProcure(html);
  assert.equal(result.solicitationNumber, 'EVT00042');
  assert.equal(result.agency, 'Department of Technology');
  assert.match(result.sourceUrl, /AUC_ID=EVT00042/);
});

test('ignores non-posted rows', () => {
  const html = `<tr id="trRESP_INQA_HD_VW_GR$0_row1"><td>BU</td><td>Agency</td><td>1</td>
    <td>Server RFP</td><td></td><td></td><td>08/30/2026</td><td>Closed</td></tr>`;
  assert.equal(parseCalEProcure(html).length, 0);
});

test('converts explicit PST and PDT deadlines to UTC', () => {
  assert.equal(
    parseCalEProcureDate('01/20/2026 2:00 PM PST')?.toISOString(),
    '2026-01-20T22:00:00.000Z'
  );
  assert.equal(
    parseCalEProcureDate('04/07/2026 11:00 AM PDT')?.toISOString(),
    '2026-04-07T18:00:00.000Z'
  );
});

test('reads description and documents from a numbered event detail page', () => {
  const html = `
    <span id="AUC_HDR_ZZ_AUC_NAME">0000049973</span>
    <span id="BUS_UNIT_TBL_FS_DESCR">Department of Social Services</span>
    <span id="RESP_AUC_H0B_WK_AUC_ID_BUS_UNIT">0000049973</span>
    <div id="AUC_HDR_DESCRLONG">
      Cloud-hosted case management application with API integration,
      identity management, data migration, and software testing.
    </div>
    <span id="AUC_HDR_AUC_DTTM_START">04/01/2026 9:00 AM PDT</span>
    <span id="AUC_HDR_AUC_DTTM_FINISH">04/07/2026 11:00 AM PDT</span>
    <a href="/documents/scope.pdf">Scope of Work</a>
  `;
  const detail = parseCalEProcureDetail(
    html,
    'https://caleprocure.ca.gov/psc/detail'
  );
  assert.equal(detail.title, '0000049973');
  assert.match(detail.description, /case management application/i);
  assert.equal(detail.closesAt, '2026-04-07T18:00:00.000Z');
  assert.deepEqual(detail.attachments, [{
    name: 'Scope of Work',
    url: 'https://caleprocure.ca.gov/documents/scope.pdf'
  }]);
});

test('keeps the meaningful register title when the detail title is only an internal ID', () => {
  assert.equal(
    preferredTitle('RFO 5805147980 for IDW Technical Resources', '0000040095'),
    'RFO 5805147980 for IDW Technical Resources'
  );
});

test('enriches every register listing before a caller can evaluate relevance', async () => {
  const originalFetch = globalThis.fetch;
  const listing = `<tr id="trRESP_INQA_HD_VW_GR$0_row1">
    <td>7920</td><td>State Teachers' Retirement Sys</td><td>0000040095</td>
    <td>RFO 5805147980 for IDW Technical Resources</td><td></td><td></td>
    <td>08/28/2026 2:00 PM PDT</td><td>Posted</td>
  </tr>Search Results`;
  const detail = `<span id="AUC_HDR_ZZ_AUC_NAME">0000040095</span>
    <div id="AUC_HDR_DESCRLONG">Data warehouse, GenBI, artificial intelligence, and machine learning services.</div>`;
  let detailRequests = 0;
  const progress = [];
  globalThis.fetch = async (url) => {
    if (String(url).includes('AUC_RESP_INQ_DTL')) {
      detailRequests += 1;
      return new Response(detail, { status: 200 });
    }
    return new Response(listing, { status: 200 });
  };
  try {
    const [event] = await collectCalEProcure({ timeoutMs: 100, onProgress: (update) => progress.push(update) });
    assert.equal(detailRequests, 1);
    assert.equal(event.title, 'RFO 5805147980 for IDW Technical Resources');
    assert.match(event.description, /data warehouse/i);
    assert.deepEqual(progress.at(-1), { stage: 'Reading RFO details', current: 1, total: 1 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
