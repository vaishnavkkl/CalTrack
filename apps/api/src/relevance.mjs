export const DEFAULT_IT_KEYWORDS = [
  'information technology',
  'information systems',
  'it services',
  'it consulting',
  'it professional services',
  'technology consulting',
  'technology services',
  'digital services',
  'digitization',
  'digitalization',
  'electronic records',
  'records digitization',
  'document imaging',
  'scanning services',
  'professional technical services',
  'consulting pool',
  'program consulting',
  'software',
  'software development',
  'application',
  'application development',
  'technology solution',
  'digital solution',
  'solution',
  'platform',
  'web development',
  'website',
  'mobile application',
  'saas',
  'paas',
  'iaas',
  'cloud',
  'cloud migration',
  'cloud services',
  'hosting',
  'data management',
  'database',
  'database administration',
  'data warehouse',
  'data lake',
  'data collection',
  'demographic data',
  'analytics',
  'business intelligence',
  'gis',
  'geographic information system',
  'cybersecurity',
  'information security',
  'zero trust',
  'identity and access management',
  'iam',
  'siem',
  'security operations center',
  'penetration testing',
  'vulnerability assessment',
  'incident response',
  'system integration',
  'systems implementation',
  'systems analysis',
  'solution architecture',
  'enterprise architecture',
  'requirements analysis',
  'business process management',
  'api',
  'middleware',
  'commercial off the shelf',
  'cots',
  'low code',
  'no code',
  'erp',
  'crm',
  'case management system',
  'content management system',
  'document management system',
  'records management system',
  'learning management system',
  'financial management system',
  'grants management system',
  'asset management system',
  'human resources information system',
  'hris',
  'permitting system',
  'licensing system',
  'public safety software',
  'computer aided dispatch',
  'network services',
  'network management',
  'network monitoring',
  'telecommunications services',
  'internet services',
  'broadband services',
  'managed it services',
  'managed services',
  'help desk',
  'service desk',
  'desktop support services',
  'technical support',
  'maintenance and operations',
  'disaster recovery services',
  'business continuity services',
  'backup services',
  'email services',
  'collaboration services',
  'unified communications services',
  'devops',
  'site reliability engineering',
  'automation',
  'robotic process automation',
  'artificial intelligence',
  'ai',
  'machine learning',
  'natural language processing',
  'generative ai',
  'digital transformation',
  'technology modernization',
  'system modernization',
  'data migration',
  'software maintenance',
  'application maintenance',
  'software license',
  'software subscription',
  'subscription',
  'subscription renewal',
  'license renewal',
  'software renewal',
  'software as a service',
  'hosted solution',
  'quality assurance',
  'software testing',
  'independent verification and validation',
  'iv&v',
  'electronic signature',
  'payment processing',
  'digital accessibility',
  'technology project management',
  'objectives and key results',
  'okr',
  'tracking and reporting platform',
  'it training',
  'technology training',
  'online it training',
  'virtual it training',
  'technical training',
  'scada',
  'supervisory control and data acquisition',
  'industrial control system',
  'operational technology',
  'managed file transfer',
  'mft',
  'lims',
  'limsr',
  'broadcom',
  'keeper security',
  'keeper software',
  'axway',
  'powerdms',
  'neogov',
  'servicenow',
  'salesforce',
  'workday',
  'docusign',
  'okta',
  'esri',
  'granicus',
  'accela',
  'tyler technologies',
  'it governance',
  'technology program management',
  'project management office',
  'it staffing',
  'technical resource',
  'technical resources',
  'technical staffing',
  'staff augmentation',
  'resource augmentation',
  'data warehouse',
  'data warehousing',
  'investment data warehouse'
];

export const DEFAULT_EXCLUDED_KEYWORDS = [
  'janitorial',
  'landscaping',
  'food service',
  'roofing',
  'plumbing',
  'asphalt',
  'guardrail',
  'painting services'
];

// Hardware is a permanent exclusion and cannot be overridden by settings.
const HARDWARE_PATTERN = /\b(hardware|computer equipment|computing equipment|server equipment|physical servers?|storage appliance|storage array|laptops?|notebooks?|desktop computers?|workstations?|tablets?|monitors?|printers?|scanners?|keyboards?|mice|peripherals?|network switches?|network routers?|wireless access points?|firewall appliance|telecom(?:munications)? equipment|telephone equipment|radio equipment|audio.?visual equipment|cameras?|body.?worn cameras?|cabling|fiber optic cable|equipment refresh|device refresh)\b/i;

const normalize = (value = '') => value.toLowerCase().replace(/[^\p{L}\p{N}+#&./-]+/gu, ' ').replace(/\s+/g, ' ').trim();
const containsKeyword = (text, keyword) => {
  const normalizedKeyword = normalize(keyword);
  if (!normalizedKeyword) return false;
  if (normalizedKeyword === 'it') return /\bit\b/i.test(text);
  if (normalizedKeyword === 'ai') return /\bai\b/i.test(text);
  if (normalizedKeyword === 'api') return /\bapi(?:s)?\b/i.test(text);
  const escaped = normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, 'i').test(text);
};

// General procurement language is useful for ranking, but never establishes IT eligibility.
const AMBIGUOUS_KEYWORDS = new Set([
  'application', 'solution', 'platform', 'professional technical services', 'consulting pool',
  'program consulting', 'data collection', 'demographic data', 'analytics', 'managed services',
  'technical support', 'maintenance and operations', 'disaster recovery services',
  'business continuity services', 'backup services', 'collaboration services', 'automation',
  'subscription', 'subscription renewal', 'license renewal', 'quality assurance',
  'payment processing', 'objectives and key results', 'okr', 'technical training',
  'project management office', 'technical resource', 'technical resources', 'technical staffing',
  'staff augmentation', 'resource augmentation', 'requirements analysis', 'business process management',
  'incident response'
]);

function hasTechnologyEvidence(item) {
  // Agency names, generated categories and portal attachment names must not qualify unrelated work.
  const scope = normalize([item.title, item.description].filter(Boolean).join(' '));
  const evidence = DEFAULT_IT_KEYWORDS.filter((keyword) => !AMBIGUOUS_KEYWORDS.has(keyword))
    .some((keyword) => containsKeyword(scope, keyword));
  return evidence || /\b(idw|it) technical resources?\b/.test(scope);
}

export function opportunityText(item) {
  return normalize([
    item.title,
    item.description,
    item.category,
    item.department,
    item.unspsc?.join?.(' '),
    item.attachments?.map?.((attachment) => attachment.name || attachment).join(' ')
  ].filter(Boolean).join(' '));
}

export function isHardwareOpportunity(item) {
  const primaryText = normalize([
    item.title,
    item.description,
    item.category,
    item.department,
    item.attachments?.map?.((attachment) => attachment.name || attachment).join(' ')
  ].filter(Boolean).join(' '));
  if (HARDWARE_PATTERN.test(primaryText)) return true;
  const unspscText = normalize((item.unspsc || [])
    // This standard service label describes systems-integration work and is
    // frequently attached to software projects; it is not a hardware purchase.
    .filter((value) => !/software\s+or\s+hardware\s+engineering/i.test(String(value)))
    .join(' '));
  return HARDWARE_PATTERN.test(unspscText);
}

export function categorizeOpportunity(item) {
  const text = opportunityText(item);
  if (/\b(scada|supervisory control|industrial control|operational technology)\b/i.test(text)) return 'Operational Technology';
  if (/\b(training|learning course|virtual course)\b/i.test(text)) return 'IT Training';
  if (/\b(digitization|digitalization|document imaging|electronic records|demographic data|data collection)\b/i.test(text)) return 'Data & Records';
  if (/\b(subscription|license renewal|software renewal|broadcom|keeper|axway|powerdms|neogov)\b/i.test(text)) return 'Software & Subscriptions';
  if (/\b(cyber|information security|zero trust|iam|siem|penetration|vulnerability|incident response)\b/i.test(text)) return 'Cybersecurity';
  if (/\b(cloud|saas|paas|iaas|hosting)\b/i.test(text)) return 'Cloud Services';
  if (/\b(artificial intelligence|machine learning|generative ai|natural language processing)\b/i.test(text)) return 'Artificial Intelligence';
  if (/\b(data|database|analytics|business intelligence|gis|geographic information)\b/i.test(text)) return 'Data Management';
  if (/\b(software|application|website|web development|mobile application|api|quality assurance|software testing)\b/i.test(text)) return 'Software Development';
  if (/\b(network services|network management|network monitoring|telecommunications services|internet services|broadband services)\b/i.test(text)) return 'Network Services';
  if (/\b(managed services|help desk|service desk|technical support|desktop support)\b/i.test(text)) return 'Managed IT Services';
  if (/\b(system integration|systems implementation|erp|crm|middleware|migration|modernization)\b/i.test(text)) return 'Systems Integration';
  if (/\b(consulting pool|program consulting)\b/i.test(text)) return 'Professional Consulting';
  return 'IT Consulting & Services';
}

export function evaluateOpportunity(item, settings = {}) {
  if (isHardwareOpportunity(item)) {
    return { relevant: false, score: 0, category: null, reason: 'hardware-exclusion', matchedKeywords: [] };
  }
  const text = opportunityText(item);
  const included = Array.from(new Set([...DEFAULT_IT_KEYWORDS, ...(settings.includedKeywords || [])]));
  const excluded = Array.from(new Set([...DEFAULT_EXCLUDED_KEYWORDS, ...(settings.excludedKeywords || [])]));
  const matchedKeywords = included.filter((keyword) => containsKeyword(text, keyword));
  const matchedExclusion = excluded.find((keyword) => containsKeyword(text, keyword));
  if (matchedExclusion || !hasTechnologyEvidence(item)) {
    return {
      relevant: false,
      score: 0,
      category: null,
      reason: matchedExclusion ? `excluded:${matchedExclusion}` : 'no-it-signal',
      matchedKeywords
    };
  }
  const preferredAgency = (settings.preferredAgencies || []).some((agency) => containsKeyword(normalize(item.agency), agency));
  const score = Math.min(99, 72 + (matchedKeywords.length * 4) + (preferredAgency ? 7 : 0));
  return { relevant: true, score, category: categorizeOpportunity(item), reason: 'matched', matchedKeywords };
}
