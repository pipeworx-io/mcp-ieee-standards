interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * IEEE Xplore MCP — BYOK wrapper over the IEEE Xplore Metadata Search API
 * (https://ieeexploreapi.ieee.org/api/v1/search/articles).
 *
 * IEEE is the one major standards body that ships a real key-based API, so this
 * pack covers two jobs at once:
 *   - IEEE STANDARDS metadata (802.11 / 802.3 / 1588 / 1547 / 1149.1 …)
 *   - the whole IEEE research corpus (journals, conference proceedings, magazines)
 *
 * What you get: bibliographic metadata + the ABSTRACT + the canonical
 * ieeexplore.ieee.org link. The normative clause text of a standard, and the
 * full text of papers, are sold by IEEE (subscription or per-document
 * purchase) — follow `html_url` for that. Same honesty contract as the `iso`
 * pack: metadata is open, the deliverable itself is paywalled.
 *
 * AUTH: BYOK only. The caller supplies their own free IEEE key via `_apiKey`,
 * which is sent as the `apikey` QUERY PARAM. Pipeworx ships no platform key for
 * IEEE, so this pack deliberately has no platformKeyEnv in the gateway.
 *
 * Register an app at https://developer.ieee.org to be issued a key. Two IEEE
 * quirks worth knowing: approval can take a few business days, and a freshly
 * issued key starts out "inactive" — until IEEE flips it on, every call comes
 * back as HTTP 403 with the non-JSON body `<h1>Developer Inactive</h1>`
 * (Mashery gateway, `content-type: text/xml`, `x-mashery-error-code:
 * ERR_403_DEVELOPER_INACTIVE`). Both cases are surfaced as actionable errors.
 */


const BASE_URL = 'https://ieeexploreapi.ieee.org/api/v1/search/articles';
const SIGNUP = 'https://developer.ieee.org';
const TIMEOUT_MS = 10_000;
const ABSTRACT_CHARS = 800;
const SOURCE = 'IEEE Xplore Metadata Search API (ieeexploreapi.ieee.org)';

/** Content types the IEEE Metadata API recognises for the `content_type` filter. */
const CONTENT_TYPES = [
  'Books',
  'Conferences',
  'Courses',
  'Early Access',
  'Journals',
  'Magazines',
  'Standards',
] as const;

const PAYWALL_NOTE =
  'IEEE Xplore serves metadata + abstract through this API. The full text is sold by IEEE — open html_url to purchase the document or read it under an institutional subscription.';

const STANDARDS_NOTE =
  'IEEE standards metadata + abstract from the IEEE Xplore Metadata API. The normative clause text is sold by IEEE — open html_url to purchase the standard or read it under an institutional subscription.';

const tools: McpToolExport['tools'] = [
  {
    name: 'ieee_standard_search',
    description:
      'Search IEEE STANDARDS by number or topic and get each standard\'s title, abstract/scope, publication year, DOI and IEEE Xplore link. Covers the IEEE standards catalogue: IEEE 802.11 Wi-Fi / wireless LAN, IEEE 802.3 Ethernet, IEEE 1588 PTP precision time protocol, IEEE 1547 distributed energy resource interconnection, IEEE 1149.1 JTAG boundary scan, IEEE 754 floating point, IEEE 802.1AS timing, and the rest. Answers "what does IEEE standard X cover", "which IEEE standard defines Y", "find the IEEE 802.3 ethernet spec", "latest revision of IEEE 1588". Returns metadata plus the abstract; the normative clause text is sold by IEEE, so follow html_url to purchase or access it. Requires your own free IEEE Xplore API key via _apiKey (register an app at developer.ieee.org). Example: ieee_standard_search({ query: "802.11 wireless LAN", limit: 5, _apiKey: "your-ieee-key" }). Example: ieee_standard_search({ query: "1588 precision time protocol", year: 2019, _apiKey: "your-ieee-key" })',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description:
            'Standard number and/or topic keywords, e.g. "802.11 wireless LAN", "1588 precision time protocol", "802.3 ethernet", "1547 distributed energy resources", "754 floating point arithmetic".',
        },
        year: {
          type: 'number',
          description: 'Restrict to standards published in this year, e.g. 2020 (optional).',
        },
        limit: {
          type: 'number',
          description: 'Max standards to return (default 10, max 50).',
        },
        start_record: {
          type: 'number',
          description: '1-based offset for paging through a large result set (default 1).',
        },
        _apiKey: {
          type: 'string',
          description:
            'Your IEEE Xplore Metadata API key, sent as the `apikey` query param. Free — register an app at https://developer.ieee.org. Approval can take a few business days, and a new key stays inactive until IEEE activates it.',
        },
      },
      required: ['query', '_apiKey'],
    },
  },
  {
    name: 'ieee_search',
    description:
      'Search the FULL IEEE Xplore corpus — IEEE and IET journal articles, conference proceedings, magazines, books, courses and standards — returning title, authors, abstract, publication venue, year, DOI and the IEEE Xplore link. The broad engineering / computer-science research tool: IEEE paper search, engineering research paper lookup, conference proceedings search, literature review on a technical topic, tracking one author\'s IEEE publications. Set content_type to focus on a single kind of record ("Conferences", "Journals", "Standards", "Magazines", "Books", "Courses", "Early Access"), or omit it to search every type at once. Returns metadata plus the abstract; the full text is sold by IEEE, so follow html_url to purchase or read it under an institutional subscription. Requires your own free IEEE Xplore API key via _apiKey (register an app at developer.ieee.org). Example: ieee_search({ query: "federated learning edge devices", limit: 10, _apiKey: "your-ieee-key" }). Example: ieee_search({ query: "millimeter wave beamforming", content_type: "Conferences", year: 2024, _apiKey: "your-ieee-key" })',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description:
            'Free-text search across IEEE metadata (title, abstract, index terms), e.g. "federated learning edge devices", "lithium-ion battery state of charge estimation".',
        },
        content_type: {
          type: 'string',
          enum: [...CONTENT_TYPES],
          description:
            'Restrict to one IEEE content type (optional). Omit to search every content type at once.',
        },
        year: {
          type: 'number',
          description: 'Restrict to this publication year, e.g. 2024 (optional).',
        },
        author: {
          type: 'string',
          description: 'Restrict to an author name, e.g. "Yoshua Bengio" (optional).',
        },
        publication_title: {
          type: 'string',
          description:
            'Restrict to a journal or proceedings title, e.g. "IEEE Transactions on Antennas and Propagation" (optional).',
        },
        index_terms: {
          type: 'string',
          description: 'Restrict to an IEEE or author index term, e.g. "Deep learning" (optional).',
        },
        sort_by: {
          type: 'string',
          enum: ['relevance', 'publication_year', 'article_title', 'author', 'publication_title'],
          description: 'Sort field (default relevance).',
        },
        sort_order: {
          type: 'string',
          enum: ['asc', 'desc'],
          description: 'Sort direction (default desc when sorting by publication_year, asc otherwise).',
        },
        limit: {
          type: 'number',
          description: 'Max records to return (default 10, max 50).',
        },
        start_record: {
          type: 'number',
          description: '1-based offset for paging through a large result set (default 1).',
        },
        _apiKey: {
          type: 'string',
          description:
            'Your IEEE Xplore Metadata API key, sent as the `apikey` query param. Free — register an app at https://developer.ieee.org.',
        },
      },
      required: ['query', '_apiKey'],
    },
  },
  {
    name: 'ieee_article',
    description:
      'Fetch one IEEE Xplore record by its article_number or DOI: full metadata including title, every author with affiliation, the complete abstract, publication venue, year, volume/issue, page range, publisher, IEEE and author index terms, plus standard_number and standard_status when the record is a standard, and the Xplore html_url / pdf_url. Use it to expand a hit from ieee_search or ieee_standard_search, or when an agent already holds an IEEE DOI or article number. Returns metadata plus the abstract; the full text is sold by IEEE — html_url is where to purchase or access it. Requires your own free IEEE Xplore API key via _apiKey (register an app at developer.ieee.org). Example: ieee_article({ article_number: "8766229", _apiKey: "your-ieee-key" }). Example: ieee_article({ doi: "10.1109/IEEESTD.2020.9363693", _apiKey: "your-ieee-key" })',
    inputSchema: {
      type: 'object' as const,
      properties: {
        article_number: {
          type: 'string',
          description:
            'IEEE Xplore article number — the numeric id in an ieeexplore.ieee.org/document/<n> URL, e.g. "8766229". Supply this or `doi`.',
        },
        doi: {
          type: 'string',
          description:
            'DOI of the record, e.g. "10.1109/IEEESTD.2020.9363693". Supply this or `article_number`.',
        },
        _apiKey: {
          type: 'string',
          description:
            'Your IEEE Xplore Metadata API key, sent as the `apikey` query param. Free — register an app at https://developer.ieee.org.',
        },
      },
      required: ['_apiKey'],
    },
  },
];

/* ---------------- shaping helpers ---------------- */

function clampInt(v: unknown, def: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

function truncate(s: unknown, n = ABSTRACT_CHARS): string | null {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  if (!t) return null;
  return t.length > n ? `${t.slice(0, n).trimEnd()}…` : t;
}

/**
 * IEEE nests authors as `{ authors: [{ full_name, affiliation, … }] }`. Accept
 * a bare array and a plain string list too rather than assuming one shape.
 */
function authorList(raw: unknown): Array<{ name: string; affiliation?: string; orcid?: string }> {
  const nested = (raw as { authors?: unknown } | null)?.authors;
  const arr: unknown[] = Array.isArray(raw) ? raw : Array.isArray(nested) ? nested : [];
  const out: Array<{ name: string; affiliation?: string; orcid?: string }> = [];
  for (const a of arr) {
    if (typeof a === 'string') {
      if (a.trim()) out.push({ name: a.trim() });
      continue;
    }
    if (!a || typeof a !== 'object') continue;
    const o = a as Record<string, unknown>;
    const name = o.full_name ?? o.name ?? o.preferred_name;
    if (typeof name !== 'string' || !name.trim()) continue;
    const entry: { name: string; affiliation?: string; orcid?: string } = { name: name.trim() };
    if (typeof o.affiliation === 'string' && o.affiliation.trim()) entry.affiliation = o.affiliation.trim();
    if (typeof o.orcid === 'string' && o.orcid.trim()) entry.orcid = o.orcid.trim();
    out.push(entry);
  }
  return out;
}

/**
 * `index_terms` arrives as `{ ieee_terms: { terms: [...] }, author_terms: { terms: [...] } }`.
 * Flatten every `terms` array present; tolerate a bare array too.
 */
function indexTerms(raw: unknown): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (Array.isArray(v)) for (const t of v) if (typeof t === 'string' && t.trim()) out.push(t.trim());
  };
  if (Array.isArray(raw)) push(raw);
  else if (raw && typeof raw === 'object') {
    for (const group of Object.values(raw as Record<string, unknown>)) {
      if (Array.isArray(group)) push(group);
      else if (group && typeof group === 'object') push((group as { terms?: unknown }).terms);
    }
  }
  return [...new Set(out)];
}

function str(v: unknown): string | null {
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number') return String(v);
  return null;
}

function xploreUrl(rec: Record<string, unknown>): string | null {
  const html = str(rec.html_url) ?? str(rec.abstract_url);
  if (html) return html;
  const num = str(rec.article_number);
  return num ? `https://ieeexplore.ieee.org/document/${num}` : null;
}

/** Fields common to every record shape. */
function shapeBase(rec: Record<string, unknown>) {
  return {
    title: str(rec.title),
    publication_title: str(rec.publication_title),
    publication_year: str(rec.publication_year),
    content_type: str(rec.content_type),
    doi: str(rec.doi),
    article_number: str(rec.article_number),
    abstract: truncate(rec.abstract),
    html_url: xploreUrl(rec),
    pdf_url: str(rec.pdf_url),
  };
}

function shapeStandard(rec: Record<string, unknown>) {
  return {
    standard_number: str(rec.standard_number),
    standard_status: str(rec.standard_status),
    ...shapeBase(rec),
    publisher: str(rec.publisher),
    access: 'abstract only — IEEE sells the full standard',
  };
}

function shapePaper(rec: Record<string, unknown>) {
  return {
    ...shapeBase(rec),
    authors: authorList(rec.authors).map((a) => a.name),
    publisher: str(rec.publisher),
    standard_number: str(rec.standard_number),
    standard_status: str(rec.standard_status),
    access: 'abstract only — IEEE sells the full text',
  };
}

function shapeFull(rec: Record<string, unknown>) {
  const terms = indexTerms(rec.index_terms);
  return {
    ...shapeBase(rec),
    // A single-record lookup returns the abstract untruncated.
    abstract: typeof rec.abstract === 'string' ? rec.abstract.trim() || null : null,
    authors: authorList(rec.authors),
    publisher: str(rec.publisher),
    volume: str(rec.volume),
    issue: str(rec.issue),
    start_page: str(rec.start_page),
    end_page: str(rec.end_page),
    isbn: str(rec.isbn),
    issn: str(rec.issn),
    conference_location: str(rec.conference_location),
    conference_dates: str(rec.conference_dates),
    standard_number: str(rec.standard_number),
    standard_status: str(rec.standard_status),
    index_terms: terms.length ? terms : null,
    citing_paper_count: typeof rec.citing_paper_count === 'number' ? rec.citing_paper_count : null,
    access: 'abstract only — IEEE sells the full text',
  };
}

/* ---------------- transport + errors ---------------- */

function missingKeyError(): Error {
  return new Error(
    `IEEE Xplore needs your own API key — pass it as _apiKey. It is free: register an application at ${SIGNUP} and IEEE issues a Metadata Search API key for it. Two IEEE quirks to expect: approval can take a few business days, and a newly issued key starts out "inactive" (calls answer HTTP 403 "Developer Inactive") until IEEE activates it. Pipeworx ships no shared IEEE key, so every caller uses their own.`,
  );
}

function bodySnippet(text: string, n = 200): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, n);
}

function ieeeError(status: number, text: string, contentType: string, tool: string): Error {
  const snippet = bodySnippet(text);

  // Mashery's ERR_403_DEVELOPER_INACTIVE — the key exists but IEEE has not
  // switched the developer account on yet. Verified live 2026-07-24: HTTP 403,
  // content-type text/xml, body `<h1>Developer Inactive</h1>`.
  if (status === 403 && /developer inactive|account inactive/i.test(text)) {
    return new Error(
      `IEEE Xplore: HTTP 403 "Developer Inactive" — IEEE has not ACTIVATED this key. Newly issued developer.ieee.org keys stay inactive until IEEE approves the registration, which commonly takes a few business days, and IEEE returns this same response for a key it does not recognise at all. Check the application's status at ${SIGNUP} (My Apps → your application) and retry once it shows active; if the key worked before, confirm the whole key string reached _apiKey.`,
    );
  }

  if (status === 401 || status === 403) {
    return new Error(
      `IEEE Xplore: authentication failed (HTTP ${status}) — the key passed as _apiKey was rejected. Register an application at ${SIGNUP} to be issued a free Metadata Search API key, then pass that key as _apiKey. Upstream said: ${snippet || '(empty body)'}`,
    );
  }

  if (status === 429) {
    return new Error(
      `IEEE Xplore: rate limit reached (HTTP 429). The free Metadata API tier allows roughly 200 calls per day per key and resets daily; larger volumes need an upgraded agreement with IEEE. Retry after the quota rolls over, or use a key with a bigger allowance.`,
    );
  }

  return new Error(
    `IEEE Xplore ${tool}: HTTP ${status} from ieeexploreapi.ieee.org (content-type: ${contentType || 'unknown'}). Body: ${snippet || '(empty body)'}`,
  );
}

interface IeeeResponse {
  total_records?: number;
  total_searched?: number;
  articles?: unknown;
  [k: string]: unknown;
}

async function ieeeGet(
  params: Record<string, string | number>,
  apiKey: string,
  tool: string,
): Promise<IeeeResponse> {
  const qs = new URLSearchParams({ apikey: apiKey, format: 'json' });
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    qs.set(k, String(v));
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}?${qs}`, {
      headers: { Accept: 'application/json' },
      signal: ctrl.signal,
    });
  } catch (e) {
    const err = e as Error;
    throw new Error(
      err?.name === 'AbortError'
        ? `IEEE Xplore ${tool}: request timed out after ${TIMEOUT_MS / 1000}s — ieeexploreapi.ieee.org did not answer. Retry, or narrow the query.`
        : `IEEE Xplore ${tool}: network error contacting ieeexploreapi.ieee.org — ${err?.message ?? String(e)}`,
    );
  } finally {
    clearTimeout(timer);
  }

  const contentType = res.headers.get('content-type') ?? '';
  const text = await res.text();

  if (!res.ok) throw ieeeError(res.status, text, contentType, tool);

  // IEEE fronts the API with Mashery, which answers some conditions with
  // text/xml or HTML even on a 200. Never let JSON.parse throw raw.
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `IEEE Xplore ${tool}: HTTP ${res.status} carried a non-JSON body (content-type: ${contentType || 'unknown'}), so there is nothing to parse. Body: ${bodySnippet(text) || '(empty body)'}`,
    );
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(
      `IEEE Xplore ${tool}: expected a JSON object from the Metadata API, received ${Array.isArray(data) ? 'an array' : typeof data}. Body: ${bodySnippet(text) || '(empty body)'}`,
    );
  }

  const obj = data as IeeeResponse;
  // Documented JSON error envelope, e.g. { error: "…", code: 4 }.
  if (typeof obj.error === 'string' && obj.error.trim()) {
    throw new Error(
      `IEEE Xplore ${tool}: the Metadata API returned an error — ${obj.error.trim()}${obj.code != null ? ` (code ${obj.code})` : ''}. Check the query parameters, and the key's status at ${SIGNUP}.`,
    );
  }
  return obj;
}

type Extracted =
  | { records: Record<string, unknown>[]; parse_note?: string }
  | { degraded: true; keys: string[] };

/**
 * Pull the record array out of a response without trusting the field name.
 * `articles` is what IEEE documents; if that is absent we look for any
 * array-of-record-shaped-objects at the top level and flag the substitution,
 * and if nothing looks like records we degrade to an informative result rather
 * than crashing.
 */
function extractRecords(data: IeeeResponse): Extracted {
  const isRecord = (r: unknown): r is Record<string, unknown> => !!r && typeof r === 'object' && !Array.isArray(r);

  if (Array.isArray(data.articles)) {
    return { records: (data.articles as unknown[]).filter(isRecord) };
  }
  // A legitimate zero-hit response can omit `articles` entirely.
  if (Number(data.total_records) === 0) return { records: [] };

  for (const [key, value] of Object.entries(data)) {
    if (key === 'articles' || !Array.isArray(value)) continue;
    const objs = value.filter(isRecord);
    if (objs.length && objs.some((o) => 'title' in o || 'article_number' in o || 'doi' in o)) {
      return {
        records: objs,
        parse_note: `The IEEE response carried records under "${key}" instead of the documented "articles" field; Pipeworx read them from there.`,
      };
    }
  }
  return { degraded: true, keys: Object.keys(data) };
}

function degradedResult(
  tool: string,
  data: IeeeResponse,
  keys: string[],
  extra: Record<string, unknown>,
) {
  return {
    ...extra,
    count: 0,
    results: [],
    total_records: typeof data.total_records === 'number' ? data.total_records : null,
    raw_keys: keys,
    parse_note: `IEEE Xplore answered HTTP 200 with JSON that has no recognisable record array — the documented "articles" field is absent. Top-level keys received: ${keys.join(', ') || '(none)'}. That usually means the Metadata API changed its envelope, or this key's IEEE agreement returns a restricted response. Verify the key at ${SIGNUP}, and report the shape via pipeworx_feedback so ${tool} can be updated.`,
    note: PAYWALL_NOTE,
    source: SOURCE,
  };
}

/* ---------------- dispatch ---------------- */

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const apiKey = String(args._apiKey ?? '').trim();
  delete args._apiKey;
  if (!apiKey) throw missingKeyError();

  switch (name) {
    case 'ieee_standard_search':
      return standardSearch(args, apiKey);
    case 'ieee_search':
      return corpusSearch(args, apiKey);
    case 'ieee_article':
      return articleLookup(args, apiKey);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function standardSearch(args: Record<string, unknown>, apiKey: string) {
  const query = String(args.query ?? args.q ?? args.standard ?? '').trim();
  if (!query) {
    throw new Error(
      'ieee_standard_search requires a `query` — a standard number and/or topic, e.g. "802.11 wireless LAN", "1588 precision time protocol", "1547 distributed energy resources".',
    );
  }
  const limit = clampInt(args.limit, 10, 1, 50);
  const start = clampInt(args.start_record, 1, 1, 10_000);

  const params: Record<string, string | number> = {
    querytext: query,
    content_type: 'Standards',
    max_records: limit,
    start_record: start,
  };
  const year = str(args.year);
  if (year) params.publication_year = year;

  const data = await ieeeGet(params, apiKey, 'ieee_standard_search');
  const parsed = extractRecords(data);
  if ('degraded' in parsed) {
    return degradedResult('ieee_standard_search', data, parsed.keys, { query, content_type: 'Standards' });
  }

  const standards = parsed.records.map(shapeStandard);
  return {
    query,
    content_type: 'Standards',
    total_records: typeof data.total_records === 'number' ? data.total_records : standards.length,
    count: standards.length,
    start_record: start,
    standards,
    note: STANDARDS_NOTE,
    parse_note: parsed.parse_note,
    source: SOURCE,
    ...(standards.length === 0
      ? {
          hint: `No IEEE standard matched "${query}". Try the bare standard number ("802.1AS"), a broader topic, or ieee_search to look across journals and conference proceedings as well.`,
        }
      : {}),
  };
}

async function corpusSearch(args: Record<string, unknown>, apiKey: string) {
  const query = String(args.query ?? args.q ?? args.querytext ?? '').trim();
  if (!query) {
    throw new Error(
      'ieee_search requires a `query` — free-text keywords, e.g. "federated learning edge devices", "millimeter wave beamforming".',
    );
  }
  const limit = clampInt(args.limit, 10, 1, 50);
  const start = clampInt(args.start_record, 1, 1, 10_000);

  const params: Record<string, string | number> = {
    querytext: query,
    max_records: limit,
    start_record: start,
  };

  let contentType: string | null = null;
  const rawType = str(args.content_type);
  if (rawType) {
    const match = CONTENT_TYPES.find((c) => c.toLowerCase() === rawType.toLowerCase());
    if (!match) {
      throw new Error(
        `ieee_search content_type "${rawType}" is not an IEEE content type. Valid values: ${CONTENT_TYPES.join(', ')}. Omit content_type to search every type at once.`,
      );
    }
    contentType = match;
    params.content_type = match;
  }

  const year = str(args.year);
  if (year) params.publication_year = year;
  const author = str(args.author);
  if (author) params.author = author;
  const pubTitle = str(args.publication_title);
  if (pubTitle) params.publication_title = pubTitle;
  const terms = str(args.index_terms);
  if (terms) params.index_terms = terms;

  const sortBy = str(args.sort_by);
  const sortOrder = str(args.sort_order);
  if (sortBy && sortBy !== 'relevance') {
    params.sort_field = sortBy;
    params.sort_order = sortOrder ?? (sortBy === 'publication_year' ? 'desc' : 'asc');
  } else if (!sortBy && sortOrder) {
    // An order with no field only makes sense chronologically.
    params.sort_field = 'publication_year';
    params.sort_order = sortOrder;
  }

  const data = await ieeeGet(params, apiKey, 'ieee_search');
  const parsed = extractRecords(data);
  if ('degraded' in parsed) {
    return degradedResult('ieee_search', data, parsed.keys, { query, content_type: contentType });
  }

  const results = parsed.records.map(shapePaper);
  return {
    query,
    content_type: contentType,
    total_records: typeof data.total_records === 'number' ? data.total_records : results.length,
    total_searched: typeof data.total_searched === 'number' ? data.total_searched : null,
    count: results.length,
    start_record: start,
    results,
    note: PAYWALL_NOTE,
    parse_note: parsed.parse_note,
    source: SOURCE,
    ...(results.length === 0
      ? {
          hint: `No IEEE record matched "${query}"${contentType ? ` within content_type "${contentType}"` : ''}. Broaden the keywords, drop the year/author filters, or omit content_type to search every IEEE content type.`,
        }
      : {}),
  };
}

async function articleLookup(args: Record<string, unknown>, apiKey: string) {
  const articleNumber = String(args.article_number ?? args.articleNumber ?? args.article ?? '').trim();
  const doi = String(args.doi ?? args.DOI ?? '').trim();
  if (!articleNumber && !doi) {
    throw new Error(
      'ieee_article requires either `article_number` (the numeric id in an ieeexplore.ieee.org/document/<n> URL, e.g. "8766229") or `doi` (e.g. "10.1109/IEEESTD.2020.9363693"). Use ieee_search or ieee_standard_search first to find one.',
    );
  }

  const params: Record<string, string | number> = { max_records: 1 };
  if (articleNumber) params.article_number = articleNumber;
  else params.doi = doi;

  const data = await ieeeGet(params, apiKey, 'ieee_article');
  const parsed = extractRecords(data);
  if ('degraded' in parsed) {
    return degradedResult('ieee_article', data, parsed.keys, {
      article_number: articleNumber || null,
      doi: doi || null,
    });
  }

  const rec = parsed.records[0];
  if (!rec) {
    return {
      article_number: articleNumber || null,
      doi: doi || null,
      found: false,
      note: `No IEEE Xplore record matched ${articleNumber ? `article_number "${articleNumber}"` : `doi "${doi}"`}. Confirm the identifier, or search for the title with ieee_search.`,
      source: SOURCE,
    };
  }

  return {
    found: true,
    ...shapeFull(rec),
    note: PAYWALL_NOTE,
    parse_note: parsed.parse_note,
    source: SOURCE,
  };
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
