import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateOpportunity, isHardwareOpportunity } from './relevance.mjs';

test('finds IT work from a number-only title by reading the description', () => {
  const result = evaluateOpportunity({
    title: '0000049912',
    description: 'Implementation of a cloud-hosted case management system with data migration and API integration.'
  });
  assert.equal(result.relevant, true);
  assert.equal(result.category, 'Cloud Services');
  assert.ok(result.score >= 80);
});

test('permanently excludes hardware procurement even with IT language', () => {
  const item = {
    title: 'Network modernization',
    description: 'Purchase of network switches, wireless access points, hardware installation, and support.'
  };
  assert.equal(isHardwareOpportunity(item), true);
  assert.equal(evaluateOpportunity(item).relevant, false);
  assert.equal(evaluateOpportunity(item).reason, 'hardware-exclusion');
});

test('keeps network services that do not purchase hardware', () => {
  const item = {
    title: 'Managed network monitoring services',
    description: '24x7 network management, incident response, and telecommunications services.'
  };
  const result = evaluateOpportunity(item);
  assert.equal(isHardwareOpportunity(item), false);
  assert.equal(result.relevant, true);
  assert.ok(result.category);
});

test('does not reject software work because an UNSPSC service label mentions hardware engineering', () => {
  const result = evaluateOpportunity({
    title: 'RFP 2025-002 LIMSR Solution',
    description: 'Cloud SaaS implementation for a laboratory information management system replacement.',
    unspsc: [
      'Computer services - Software or hardware engineering - Systems integration design',
      'Information Technology Service Delivery - Cloud-based software as a service'
    ]
  });
  assert.equal(result.relevant, true);
  assert.notEqual(result.reason, 'hardware-exclusion');
});

const missedCalEProcureTitles = [
  'RFI Digitization of Marriage Records',
  'RFP 2025-002 LIMSR Solution',
  'Tempe Arts and Culture Website Development and Hosting',
  'C5613453 – SCADA Services',
  'ISD26-3958 CA Broadcom Software Renewal',
  'SB Only 75350775 - Keeper Software Renewal',
  'Axway MFT Platform Cloud SaaS Subscription Renewal',
  '26HS0503 RFQ - PowerDMS by NEOGOV Subscriptions and Services',
  'RFQ No. 130123 Online/Virtual IT Training Courses',
  'Invitation to Upcoming Innovation Showcase: AI Permitting',
  '21150720 Objectives and Key Results (OKR) Tracking and Reporting Platform'
];

test('retains known Cal eProcure service and software opportunities from title alone', async (context) => {
  for (const title of missedCalEProcureTitles) {
    await context.test(title, () => {
      const result = evaluateOpportunity({ title, description: '' });
      assert.equal(result.relevant, true, `${title} should be included`);
      assert.ok(result.category);
    });
  }
});

test('retains RFO 5805147980 when the public listing has only its staffing subject', () => {
  const result = evaluateOpportunity({
    title: 'RFO 5805147980 for IDW Technical Resources',
    description: ''
  });
  assert.equal(result.relevant, true);
  assert.ok(result.matchedKeywords.includes('technical resources'));
  assert.equal(result.category, 'IT Consulting & Services');
});

test('still rejects excluded non-IT services', () => {
  const result = evaluateOpportunity({
    title: 'Countywide Janitorial Services',
    description: 'Cleaning and custodial labor for public facilities.'
  });
  assert.equal(result.relevant, false);
  assert.match(result.reason, /^excluded:/);
});

test('general procurement language and metadata cannot qualify non-IT work', () => {
  for (const title of [
    'Health Program Consulting Pool', 'Tenant Demographic Data Collection',
    'Grant Application Review', 'Water Treatment Solution', 'Railway Platform Maintenance',
    'Magazine Subscription Renewal', 'Nursing Staff Augmentation',
    'Construction Quality Assurance', 'First Aid Technical Training',
    'Capital Improvement Program', 'Emergency Incident Response'
  ]) {
    assert.equal(evaluateOpportunity({ title, category: 'IT Consulting & Services',
      department: 'Information Technology', attachments: [{ name: 'software portal instructions' }]
    }, { includedKeywords: ['consulting pool', 'solution', title] }).relevant, false, title);
  }
});

test('ambiguous staffing and consulting titles qualify when scope proves IT work', () => {
  assert.equal(evaluateOpportunity({ title: 'Health Program Consulting Pool',
    description: 'Software development and cloud migration for the health program.' }).relevant, true);
  assert.equal(evaluateOpportunity({ title: 'Staff Augmentation',
    description: 'Database administration and cybersecurity consulting.' }).relevant, true);
});
