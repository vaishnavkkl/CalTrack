const iso = (days, hour = 17) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};

export const seedOpportunities = [
  {
    id: 'cal-2026-004918', solicitationNumber: '0000049187', solicitationType: 'RFP',
    title: 'Enterprise Cloud Migration & Managed Services', agency: 'California Department of Technology',
    department: 'Office of Enterprise Technology', description: 'Planning, migration, and managed cloud operations for statewide enterprise workloads, including security and FinOps services.',
    category: 'Cloud Services', publishedAt: iso(-8), closesAt: iso(12, 14), relevanceScore: 97,
    status: 'New', sourcePortal: 'Cal eProcure', sourceGroup: 'caleprocure', sourceUrl: 'https://caleprocure.ca.gov/', saved: 1,
    tags: ['cloud', 'statewide'], attachments: []
  },
  {
    id: 'cal-2026-004902', solicitationNumber: '0000049021', solicitationType: 'RFQ',
    title: 'Cybersecurity Operations Center Modernization', agency: 'California Department of General Services',
    department: 'Enterprise Technology Solutions', description: 'Modernize SOC tooling, threat intelligence workflows, and incident response automation.',
    category: 'Cybersecurity', publishedAt: iso(-6), closesAt: iso(8, 15), relevanceScore: 95,
    status: 'Triage', sourcePortal: 'Cal eProcure', sourceGroup: 'caleprocure', sourceUrl: 'https://caleprocure.ca.gov/', saved: 1,
    tags: ['security', 'soc'], attachments: []
  },
  {
    id: 'la-its-2026-118', solicitationNumber: 'ITS-2026-118', solicitationType: 'RFP',
    title: 'Digital Permitting Platform Implementation', agency: 'County of Los Angeles',
    department: 'Internal Services Department', description: 'Implementation and integration of a responsive cloud-based permitting and inspection platform.',
    category: 'Software Development', publishedAt: iso(-4), closesAt: iso(21, 16), relevanceScore: 92,
    status: 'Qualified', sourcePortal: 'OpenGov Procurement', sourceGroup: 'priority', sourceUrl: 'https://procurement.opengov.com/', saved: 0,
    tags: ['civic-tech'], attachments: []
  },
  {
    id: 'uc-2026-ai', solicitationNumber: 'UCOP-RFP-2026-41', solicitationType: 'RFP',
    title: 'Responsible AI Governance & Automation Services', agency: 'University of California',
    department: 'UC Office of the President', description: 'Advisory and implementation services for AI governance, model inventory, evaluation, and workflow automation.',
    category: 'Artificial Intelligence', publishedAt: iso(-2), closesAt: iso(28, 17), relevanceScore: 94,
    status: 'New', sourcePortal: 'CalUsource', sourceGroup: 'priority', sourceUrl: 'https://calusource.net/', saved: 0,
    tags: ['ai', 'governance'], attachments: []
  },
  {
    id: 'sac-2026-data', solicitationNumber: 'DTECH-2026-09', solicitationType: 'RFI',
    title: 'Enterprise Data Platform & Analytics Strategy', agency: 'County of Sacramento',
    department: 'Technology Services', description: 'Market research for a modern data platform, master data management, governance, and analytics.',
    category: 'Data Management', publishedAt: iso(-10), closesAt: iso(17, 15), relevanceScore: 91,
    status: 'Triage', sourcePortal: 'EUNA Supplier Network', sourceGroup: 'priority', sourceUrl: 'https://supplier.eunasolutions.com/', saved: 0,
    tags: ['data', 'analytics'], attachments: []
  },
  {
    id: 'cal-2026-number-only', solicitationNumber: '0000049973', solicitationType: 'RFO',
    title: '0000049973', agency: 'California Department of Social Services',
    department: 'Information Systems Division', description: 'Implementation and support for a cloud-hosted case management application, including data migration, API integration, identity management, and software testing.',
    category: 'Cloud Services', publishedAt: iso(-3), closesAt: iso(19, 15), relevanceScore: 96,
    status: 'New', sourcePortal: 'Cal eProcure', sourceGroup: 'caleprocure', sourceUrl: 'https://caleprocure.ca.gov/', saved: 0,
    tags: ['case-management', 'cloud'], attachments: []
  },
  {
    id: 'sf-2026-helpdesk', solicitationNumber: 'SFGOV-ITS-8842', solicitationType: 'RFP',
    title: 'IT Service Desk and Endpoint Managed Services', agency: 'City and County of San Francisco',
    department: 'Department of Technology', description: 'Tier 1–3 service desk, endpoint operations, field services, and service management reporting.',
    category: 'Managed IT Services', publishedAt: iso(-16), closesAt: iso(34, 14), relevanceScore: 87,
    status: 'New', sourcePortal: 'SF City Partner', sourceGroup: 'priority', sourceUrl: 'https://sfcitypartner.sfgov.org/', saved: 0,
    tags: ['managed-services'], attachments: []
  }
];

export const seedPortals = [
  {
    id: 'caleprocure', name: 'Cal eProcure', portalType: 'State', baseUrl: 'https://caleprocure.ca.gov',
    connectorKey: 'caleprocure', provider: 'caleprocure', organizationName: 'State of California',
    accountScope: 'statewide', opportunityGroup: 'caleprocure', authMode: 'public',
    enabled: 1, isPrimary: 1, cadence: 'Daily · 6:00 AM', status: 'Healthy'
  },
  {
    id: 'opengov-ca', name: 'OpenGov — California', portalType: 'Local agencies', baseUrl: 'https://procurement.opengov.com',
    connectorKey: 'manual', provider: 'opengov', organizationName: 'Registered OpenGov agencies',
    accountScope: 'network', opportunityGroup: 'priority', authMode: 'public',
    enabled: 1, isPrimary: 0, cadence: 'Daily · 7:00 AM', status: 'Ready'
  },
  {
    id: 'bonfire-ca', name: 'EUNA Supplier Network', portalType: 'Agency registrations', baseUrl: 'https://supplier.eunasolutions.com',
    connectorKey: 'manual', provider: 'bonfire', organizationName: 'Registered EUNA agencies',
    accountScope: 'agency', opportunityGroup: 'priority', authMode: 'public',
    enabled: 0, isPrimary: 0, cadence: 'Manual', status: 'Paused'
  },
  {
    id: 'planetbids-ca', name: 'PlanetBids / VendorLine', portalType: 'Agency registrations', baseUrl: 'https://vendor.planetbids.com',
    connectorKey: 'manual', provider: 'planetbids', organizationName: 'Registered PlanetBids agencies',
    accountScope: 'agency', opportunityGroup: 'priority', authMode: 'public',
    enabled: 0, isPrimary: 0, cadence: 'Manual', status: 'Paused'
  }
];
