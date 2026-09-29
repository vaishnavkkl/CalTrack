const SEARCH_URL = 'https://caleprocure.ca.gov/psc/psfpd1/SUPPLIER/ERP/c/AUC_MANAGE_BIDS.AUC_RESP_INQ_AUC.GBL?Page=AUC_RESP_INQ_AUC&Action=U';
const PACIFIC_TIME_ZONE = 'America/Los_Angeles';

const decodeEntities = (value = '') => value
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([a-f0-9]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));

const cleanText = (value = '') => decodeEntities(value)
  .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const escapePattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function attributeValue(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i'));
  return decodeEntities(match?.[1] || '');
}

function extractField(html, id) {
  const escaped = escapePattern(id);
  const paired = html.match(new RegExp(`<([a-z0-9]+)\\b([^>]*\\bid=["']${escaped}["'][^>]*)>([\\s\\S]*?)<\\/\\1>`, 'i'));
  if (paired) return cleanText(attributeValue(paired[2], 'value') || paired[3]);
  const single = html.match(new RegExp(`<[^>]+\\bid=["']${escaped}["'][^>]*>`, 'i'));
  return single ? cleanText(attributeValue(single[0], 'value')) : '';
}

function pacificLocalToUtc(year, month, day, hour, minute) {
  const desired = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = desired;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23'
  });
  for (let pass = 0; pass < 2; pass += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess))
      .filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
    const representedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    guess = desired - (representedAsUtc - guess);
  }
  return new Date(guess);
}

export function parseCalEProcureDate(value) {
  const text = cleanText(value);
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)(?:\s+(PDT|PST))?$/i);
  if (!match) {
    const fallback = Date.parse(text);
    return Number.isNaN(fallback) ? null : new Date(fallback);
  }
  const [, rawMonth, rawDay, rawYear, rawHour, rawMinute, meridiem, zone] = match;
  let hour = Number(rawHour) % 12;
  if (meridiem.toUpperCase() === 'PM') hour += 12;
  const year = Number(rawYear);
  const month = Number(rawMonth);
  const day = Number(rawDay);
  const minute = Number(rawMinute);
  if (zone) {
    const offset = zone.toUpperCase() === 'PST' ? '-08:00' : '-07:00';
    return new Date(`${rawYear}-${rawMonth.padStart(2, '0')}-${rawDay.padStart(2, '0')}T${String(hour).padStart(2, '0')}:${rawMinute}:00${offset}`);
  }
  return pacificLocalToUtc(year, month, day, hour, minute);
}

function extractAttachments(html, detailUrl) {
  const attachments = [];
  const seen = new Set();
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = attributeValue(match[1], 'href');
    const name = cleanText(match[2]) || href.split('/').pop() || 'Solicitation document';
    if (!href || /^(?:javascript:|#)/i.test(href)) continue;
    const looksLikeDocument = /\.(?:pdf|docx?|xlsx?|csv|zip)(?:[?#]|$)/i.test(href)
      || /\b(attachment|document|download|solicitation|exhibit|addendum|scope of work)\b/i.test(`${href} ${name}`);
    if (!looksLikeDocument) continue;
    try {
      const url = new URL(href, detailUrl).toString();
      if (seen.has(url)) continue;
      seen.add(url);
      attachments.push({ name: name.slice(0, 180), url });
    } catch {
      // Ignore malformed source links.
    }
  }
  return attachments.slice(0, 50);
}

export function parseCalEProcureDetail(html, detailUrl = SEARCH_URL) {
  const title = extractField(html, 'AUC_HDR_ZZ_AUC_NAME');
  const agency = extractField(html, 'BUS_UNIT_TBL_FS_DESCR');
  const eventId = extractField(html, 'RESP_AUC_H0B_WK_AUC_ID_BUS_UNIT');
  const description = extractField(html, 'AUC_HDR_DESCRLONG').slice(0, 12000);
  const publishedText = extractField(html, 'AUC_HDR_AUC_DTTM_START');
  const closesText = extractField(html, 'AUC_HDR_AUC_DTTM_FINISH');
  const eventUrl = extractField(html, 'ZZ_VNDR_AD_WRK_DESCR2000');
  const pageText = cleanText(html);
  const email = pageText.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0] || '';
  const unspsc = [...html.matchAll(/<[^>]+\bid=["']ZZ_CAT_DSCR_VW_DESCR254\$[^"']*["'][^>]*>([\s\S]*?)<\//gi)]
    .map((match) => cleanText(match[1])).filter(Boolean);
  return {
    title,
    agency,
    eventId,
    description,
    publishedAt: parseCalEProcureDate(publishedText)?.toISOString() || null,
    closesAt: parseCalEProcureDate(closesText)?.toISOString() || null,
    eventUrl: /^https?:\/\//i.test(eventUrl) ? eventUrl : null,
    contactEmail: email,
    unspsc: Array.from(new Set(unspsc)),
    attachments: extractAttachments(html, detailUrl)
  };
}

export function parseCalEProcure(html) {
  const results = [];
  const rows = html.match(/<tr[^>]+id=["']trRESP_INQA_HD_VW_GR\$0_row[^"']*["'][\s\S]*?<\/tr>/gi) || [];
  for (const row of rows) {
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => cleanText(match[1]));
    const [businessUnit, agency, eventId, title, , , closesAtText, status] = cells;
    if (!businessUnit || !eventId || !title || !/^posted$/i.test(status || '')) continue;
    const detail = new URL('/psc/psfpd1/SUPPLIER/ERP/c/AUC_MANAGE_BIDS.AUC_RESP_INQ_DTL.GBL', SEARCH_URL);
    detail.search = new URLSearchParams({
      AUC_ID: eventId,
      AUC_ROUND: '1',
      AUC_VERSION: '1',
      BIDDER_ID: 'BID0000001',
      BIDDER_LOC: '1',
      BIDDER_SETID: 'STATE',
      BIDDER_TYPE: 'B',
      BUSINESS_UNIT: businessUnit,
      NoCrumbs: 'yes',
      PAGE: 'AUC_RESP_INQ_DTL'
    }).toString();
    results.push({
      externalId: eventId,
      solicitationNumber: eventId,
      solicitationType: /\b(RFO|RFP|RFQ|RFI|RFB|IFB)\b/i.exec(title)?.[1]?.toUpperCase() || 'RFO',
      title,
      agency: agency || 'California state agency',
      description: '',
      publishedAt: null,
      closesAt: parseCalEProcureDate(closesAtText)?.toISOString() || null,
      sourceUrl: detail.toString(),
      sourceStatus: status,
      attachments: []
    });
  }
  return results;
}

class CalEProcureSession {
  constructor(timeoutMs) {
    this.timeoutMs = timeoutMs;
    this.cookies = new Map();
  }

  rememberCookies(response) {
    for (const setCookie of response.headers.getSetCookie?.() || []) {
      const [pair] = setCookie.split(';');
      const separator = pair.indexOf('=');
      if (separator > 0) this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  }

  async request(targetUrl) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(targetUrl, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          // The public register rejects non-browser user agents with HTTP 403.
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Upgrade-Insecure-Requests': '1',
          Cookie: [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ')
        }
      });
      this.rememberCookies(response);
      if (!response.ok) throw new Error(`Cal eProcure returned HTTP ${response.status}`);
      return { html: await response.text(), url: response.url };
    } finally {
      clearTimeout(timer);
    }
  }

  async open(targetUrl) {
    const first = await this.request(targetUrl);
    // PeopleSoft first sets its guest-session cookie on a ckreq page. Repeating
    // the original URL with that cookie opens the requested public page. Do
    // not use "Search Results" as a generic readiness check: detail pages do
    // not contain that text and were consequently downloaded twice.
    if (/errorPg=ckreq/i.test(first.url)) {
      return (await this.request(targetUrl)).html;
    }
    return first.html;
  }
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

// The event register title is the reliable public-facing subject line.  Some
// PeopleSoft detail pages populate the title field with only the internal
// event ID (for example, "0000040095"), which must not replace a useful
// listing title before relevance is evaluated.
export function preferredTitle(listingTitle, detailTitle) {
  const detail = cleanText(detailTitle);
  if (!detail || /^\d+(?:[._/-]\d+)*$/.test(detail)) return listingTitle;
  return detail;
}

async function openWithRetry(session, url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await session.open(url);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await wait(attempt * 500);
    }
  }
  throw lastError;
}

export async function collectCalEProcure({ timeoutMs = 30000, onProgress } = {}) {
  const session = new CalEProcureSession(timeoutMs);
  onProgress?.({ stage: 'Loading public register', current: 0, total: 0 });
  const searchHtml = await openWithRetry(session, SEARCH_URL);
  const events = parseCalEProcure(searchHtml);
  // Always enrich the complete open register before relevance filtering.
  // Cal eProcure headings are frequently administrative labels rather than a
  // description of the service being procured.
  const candidates = events;
  const detailsById = new Map();
  const batchSize = 3;
  let detailsCompleted = 0;
  onProgress?.({ stage: 'Reading RFO details', current: detailsCompleted, total: candidates.length });
  for (let start = 0; start < candidates.length; start += batchSize) {
    const batch = candidates.slice(start, start + batchSize);
    const details = await Promise.all(batch.map(async (event) => {
      try {
        const html = await openWithRetry(session, event.sourceUrl);
        const detail = parseCalEProcureDetail(html, event.sourceUrl);
        return {
          ...event,
          title: preferredTitle(event.title, detail.title),
          agency: detail.agency || event.agency,
          description: detail.description,
          publishedAt: detail.publishedAt,
          // The result register reflects the current round/version deadline.
          // A version-1 detail URL can contain an earlier deadline after an
          // addendum, so the search result is authoritative when present.
          closesAt: event.closesAt || detail.closesAt,
          sourceUrl: event.sourceUrl,
          contactEmail: detail.contactEmail,
          unspsc: detail.unspsc,
          attachments: detail.eventUrl
            ? [...detail.attachments, { name: 'Agency solicitation page', url: detail.eventUrl }]
            : detail.attachments,
          detailsRetrieved: true
        };
      } catch (error) {
        return {
          ...event,
          detailsRetrieved: false,
          detailError: error instanceof Error ? error.message : String(error)
        };
      }
    }));
    details.forEach((detail) => {
      detailsById.set(detail.externalId, detail);
      detailsCompleted += 1;
      onProgress?.({ stage: 'Reading RFO details', current: detailsCompleted, total: candidates.length });
    });
    if (start + batchSize < candidates.length) await wait(200);
  }
  return events.map((event) => detailsById.get(event.externalId) || {
    ...event,
    detailsRetrieved: false,
    detailSkipped: true
  });
}
