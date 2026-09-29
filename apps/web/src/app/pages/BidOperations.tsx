import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { EmptyState } from '../EmptyState';
import { Icon } from '../Icon';
import { dateTime, deadlineLabel, displayOpportunityTitle } from '../format';
import { StatusBadge } from '../StatusBadge';
import { useToast } from '../ToastContext';
import { canLeaveEditor, useDraftGuard } from '../useDraftGuard';
import type { BidRecord, BidWorkflow, Candidate, DocumentationItem, ResourceRequirement, ResponseFile } from '../types';

const noBidReasons = [
  'Vendor qualification gap', 'Expertise gap', 'Resource unavailable',
  'Commercial risk', 'Timeline risk', 'Other'
];

function useBids() {
  const [bids, setBids] = useState<BidRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const load = () => api.get<{ bids: BidRecord[] }>('/bids').then(({ bids: next }) => setBids(next))
    .finally(() => setLoading(false));
  useEffect(() => { void load(); }, []);
  return { bids, setBids, loading, load };
}

function ProgressRail({ active }: { active: number }) {
  const steps = ['Discovered', 'Qualified', 'Sourcing', 'Documentation', 'Final review'];
  return <div className="process-rail" aria-label="Bid progress">
    {steps.map((step, index) => <div className={index <= active ? 'complete' : ''} key={step}>
      <span>{index < active ? <Icon name="check" size={13} /> : index + 1}</span><small>{step}</small>
    </div>)}
  </div>;
}

export function BidDecisions() {
  const { bids, setBids, loading } = useBids();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const notify = useToast();
  const requestedId = searchParams.get('rfo') || '';
  const [filter, setFilter] = useState('All');
  const [selectedId, setSelectedId] = useState(requestedId);
  const visible = useMemo(() => bids.filter((bid) => filter === 'All' || bid.workflow.decision === filter), [bids, filter]);
  const selected = visible.find((bid) => bid.opportunity.id === selectedId) || visible[0];

  useEffect(() => {
    if (requestedId) {
      setSelectedId(requestedId);
      setFilter('All');
      return;
    }
  }, [requestedId]);

  const saved = (workflow: BidWorkflow, opportunity: BidRecord['opportunity']) => {
    setBids((all) => all.map((bid) => bid.opportunity.id === workflow.opportunityId ? { ...bid, workflow, opportunity } : bid));
    notify('Bid preparation saved.');
  };
  const removeFromPreparation = async (opportunity: BidRecord['opportunity']) => {
    if (!window.confirm(`Remove “${displayOpportunityTitle(opportunity.title, opportunity.description)}” from preparation? The RFO, notes, candidates and files will be kept.`)) return;
    try {
      await api.patch(`/opportunities/${opportunity.id}`, { resourcePreparationSelected: false });
      setBids((all) => all.filter((bid) => bid.opportunity.id !== opportunity.id));
      setSelectedId('');
      const next = new URLSearchParams(searchParams); next.delete('rfo'); setSearchParams(next, { replace: true });
      notify('Removed from preparation. You can add it again from Find RFOs.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not remove the RFO.', 'error');
    }
  };

  return <div className="page-stack preparation-page">
    <div className="preparation-toolbar">
      <div><h2>Your bid shortlist <span>{bids.length}</span></h2><p>Choose a bid. Record your decision, then add the details you need.</p></div>
      <Link className="button button-secondary" to="/opportunities"><Icon name="plus" />Find more RFOs</Link>
    </div>
    <div className="split-workspace">
      <section className="card queue-panel">
        <header><div><h3>Selected RFOs</h3><p>{visible.length} shown · priority order</p></div>
          <select aria-label="Filter preparation queue" value={filter} onChange={(event) => { if (!canLeaveEditor()) return; setFilter(event.target.value); setSelectedId(''); const next = new URLSearchParams(searchParams); next.delete('rfo'); setSearchParams(next, { replace: true }); }}>
            <option>All</option><option>Not reviewed</option><option>Qualified</option><option>Not qualified</option>
          </select>
        </header>
        {loading ? <div className="loading-state"><span className="spinner" />Loading RFOs...</div>
          : visible.length === 0 ? <EmptyState title={bids.length ? "No bids match this status" : "Your shortlist is empty"} message={bids.length ? "Choose All to see your other bids." : "Find an RFO and choose Prepare this bid to get started."} />
            : <div className="bid-queue">{visible.map((bid) => <article className="preparation-queue-item" key={bid.opportunity.id}><button
              className={selected?.opportunity.id === bid.opportunity.id ? 'active' : ''}
              onClick={() => { if (bid.opportunity.id === selected?.opportunity.id || canLeaveEditor()) setSelectedId(bid.opportunity.id); }}>
              <div><span className="type-pill">{bid.opportunity.solicitationType}</span><small>{bid.opportunity.solicitationNumber}</small></div>
              <strong>{displayOpportunityTitle(bid.opportunity.title, bid.opportunity.description)}</strong>
              <p>{bid.opportunity.agency}</p>
              <small className={`priority-label priority-${bid.opportunity.priority.toLowerCase()}`}>{bid.opportunity.priority} priority</small>
              <footer><StatusBadge value={bid.workflow.decision} /><span>{deadlineLabel(bid.opportunity.closesAt)}</span></footer>
            </button>
              {user?.role === 'super_admin' && <button className="queue-remove" aria-label={`Remove ${bid.opportunity.title} from preparation`} onClick={() => void removeFromPreparation(bid.opportunity)}><Icon name="close" size={13} />Remove from preparation</button>}
            </article>)}</div>}
      </section>
      {selected ? <DecisionEditor key={selected.opportunity.id} bid={selected} canEdit={user?.role === 'super_admin'} onSaved={saved} onRemove={removeFromPreparation} />
        : <section className="card workspace-detail"><EmptyState title="Select an RFO" message="Its qualification workspace will appear here." /></section>}
    </div>
  </div>;
}

function DecisionEditor({ bid, canEdit, onSaved, onRemove }: { bid: BidRecord; canEdit: boolean; onSaved: (workflow: BidWorkflow, opportunity: BidRecord['opportunity']) => void; onRemove: (opportunity: BidRecord['opportunity']) => void }) {
  const [section, setSection] = useState('decision');
  const [dirty, setDirty] = useState(false);
  const [decision, setDecision] = useState(bid.workflow.decision);
  const [decisionReason, setDecisionReason] = useState(bid.workflow.decisionReason);
  const [decisionNotes, setDecisionNotes] = useState(bid.workflow.decisionNotes);
  const [resources, setResources] = useState<ResourceRequirement[]>(bid.workflow.requiredResources);
  const [uAndARequired, setUAndARequired] = useState<BidWorkflow['uAndARequired']>(bid.workflow.uAndARequired);
  const [candidatesRequired, setCandidatesRequired] = useState<number | null>(bid.workflow.candidatesRequired);
  const [candidatesProvided, setCandidatesProvided] = useState<number | null>(bid.workflow.candidatesProvided);
  const [contractTerm, setContractTerm] = useState(bid.workflow.contractTerm);
  const [budget, setBudget] = useState(bid.workflow.budget);
  const [contractMode, setContractMode] = useState(bid.workflow.contractMode);
  const [brief, setBrief] = useState(bid.workflow.sourcingBrief);
  const [sourcingStatus, setSourcingStatus] = useState(bid.workflow.sourcingStatus);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedNow, setSavedNow] = useState(false);
  const [invalidField, setInvalidField] = useState('');
  const opportunity = bid.opportunity;

  const save = async () => {
    if (saving || !canEdit) return;
    setSaveError(''); setInvalidField('');
    const invalid = (message: string, nextSection: string, field: string) => {
      setSaveError(message); setSection(nextSection); setInvalidField(field);
      requestAnimationFrame(() => document.getElementById(field)?.focus());
    };
    if (decision === 'Not qualified' && !decisionReason) return invalid('Choose a reason for passing on this bid.', 'decision', 'qualification-reason');
    if (decision === 'Qualified' && resources.some((resource) => !resource.title.trim())) return invalid('Give each role a title, or remove the empty role.', 'people', `role-${resources.find((resource) => !resource.title.trim())!.id}`);
    if (sourcingStatus !== 'Not published' && (!resources.length || !brief.trim())) return invalid('Add at least one role and a sourcing brief before sharing with the team.', 'people', 'sourcing-brief');
    setSaving(true);
    try {
      const { workflow, opportunity: updatedOpportunity } = await api.patch<{ workflow: BidWorkflow; opportunity: BidRecord['opportunity'] }>(`/bids/${opportunity.id}/workflow`, {
        decision, decisionReason, decisionNotes, requiredResources: resources, uAndARequired, candidatesRequired,
        candidatesProvided, contractTerm, budget, contractMode, sourcingBrief: brief, sourcingStatus
      });
      onSaved(workflow, updatedOpportunity);
      setDirty(false);
      setSavedNow(true);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save. Your edits are still here; please try again.');
    } finally { setSaving(false); }
  };
  useDraftGuard(dirty, saving, () => void save());

  const changeResource = (id: string, patch: Partial<ResourceRequirement>) => {
    setResources((all) => all.map((resource) => resource.id === id ? { ...resource, ...patch } : resource));
  };

  return <section className="card workspace-detail preparation-editor" onChange={() => { setDirty(true); setSavedNow(false); setSaveError(''); setInvalidField(''); }}>
    <fieldset className="editor-fields" disabled={saving}>
    <header className="workspace-head">
      <div><span className="eyebrow">{opportunity.sourcePortal} / {opportunity.solicitationNumber}</span>
        <h2>{displayOpportunityTitle(opportunity.title, opportunity.description)}</h2><p>{opportunity.agency} · due {dateTime(opportunity.closesAt)}</p></div>
      <div className="workspace-head-actions">
        <StatusBadge value={bid.workflow.decision} />
        {canEdit && <button className="remove-preparation" onClick={() => onRemove(opportunity)}><Icon name="close" size={15} />Remove from preparation</button>}</div>
    </header>
    <nav className="preparation-sections" aria-label="Preparation sections">
      {[['decision', 'Decision', 'Is this a bid for us?'], ['details', 'Contract details', 'Budget, term & delivery'], ['people', 'People', 'Roles & sourcing brief']].map(([key, title, description], index) => <button key={key} aria-pressed={section === key} onClick={() => setSection(key)}><span className="section-number"><Icon name={['checklist', 'briefcase', 'users'][index]} size={16} /></span><span><strong>{title}</strong><small>{description}</small></span></button>)}
    </nav>
    <div hidden={section !== 'decision'} className="preparation-panel">
      <div className="section-intro"><h3>Should we pursue this bid?</h3><p>Record your decision and the key reasons behind it.</p></div>
    <div className="workspace-section decision-grid">
      <fieldset className="decision-choices field-wide"><legend>Qualification decision</legend>
        {(['Not reviewed', 'Qualified', 'Not qualified'] as const).map((value, index) => <button key={value} type="button" aria-pressed={decision === value} disabled={!canEdit} onClick={() => {
          setDecision(value); setDirty(true); if (value !== 'Qualified') setSourcingStatus('Not published');
        }}><Icon name={['clock', 'check', 'close'][index]} size={18} /><strong>{['Review later', 'Pursue bid', 'Pass on bid'][index]}</strong><small>{['Keep in the shortlist', 'Qualified to proceed', 'Record why below'][index]}</small></button>)}
      </fieldset>
      {decision === 'Not qualified' && <label><span>Reason for passing <em className="field-required">Required</em></span><select id="qualification-reason" aria-invalid={invalidField === 'qualification-reason'} aria-describedby={invalidField === 'qualification-reason' ? 'preparation-error' : undefined} disabled={!canEdit} value={decisionReason} onChange={(event) => { setDecisionReason(event.target.value); setInvalidField(''); setSaveError(''); }}>
        <option value="">Select reason</option>{noBidReasons.map((reason) => <option key={reason}>{reason}</option>)}</select></label>}
      <details className="optional-fields field-wide" open={decisionNotes ? true : undefined}><summary><Icon name="edit" size={15} />Decision notes <span>Optional</span></summary>
        <label><span>Why this decision?</span><textarea disabled={!canEdit} value={decisionNotes} onChange={(event) => setDecisionNotes(event.target.value)} rows={3}
        placeholder="Key strengths, risks, or questions for the team" /></label></details>
    </div>
    </div>
    <div hidden={section !== 'details'} className="preparation-panel">
    <section className="workspace-section intelligence-fields">
      <div className="section-title"><div><h3>Start with the contract</h3><p>These details help your team assess the bid. Leave anything unknown blank.</p></div></div>
      <div className="intelligence-grid">
        <label><span>Budget <em className="field-hint">Optional</em></span><input disabled={!canEdit} value={budget} onChange={(event) => setBudget(event.target.value)} placeholder="e.g. $250,000" /></label>
        <label><span>Contract duration</span><input disabled={!canEdit} value={contractTerm} onChange={(event) => setContractTerm(event.target.value)} placeholder="e.g. 12 months" /></label>
        <label><span>Contract model</span><input disabled={!canEdit} value={contractMode} onChange={(event) => setContractMode(event.target.value)} placeholder="e.g. Time and materials" /></label>
      </div>
      <details className="optional-fields" open={uAndARequired || candidatesRequired !== null || candidatesProvided !== null ? true : undefined}>
        <summary><Icon name="users" size={15} />Additional staffing details <span>Optional</span></summary>
        <div className="intelligence-grid">
          <label><span>Candidates required</span><input disabled={!canEdit} type="number" min="0" value={candidatesRequired ?? ''} onChange={(event) => setCandidatesRequired(event.target.value === '' ? null : Number(event.target.value))} /></label>
          <label><span>Candidates provided</span><input disabled={!canEdit} type="number" min="0" value={candidatesProvided ?? ''} onChange={(event) => setCandidatesProvided(event.target.value === '' ? null : Number(event.target.value))} /></label>
          <label><span>U&amp;A required</span><select disabled={!canEdit} value={uAndARequired} onChange={(event) => setUAndARequired(event.target.value as BidWorkflow['uAndARequired'])}><option value="">Not specified</option><option>Yes</option><option>No</option></select></label>
        </div>
      </details>
    </section>
    </div>
    <div hidden={section !== 'people'} className="preparation-panel">
    {decision !== 'Qualified' && <div className="people-gate"><Icon name="users" /><h3>Qualify this bid before sourcing</h3><p>Mark the bid Qualified in Decision to add roles and share a sourcing brief.</p><button className="button button-secondary" onClick={() => setSection('decision')}>Back to decision</button></div>}
    {decision === 'Qualified' && <>
      <div className="workspace-section">
        <div className="section-title"><div><h3>Who do you need?</h3><p>Add the roles and qualifications your team should source.</p></div>
          {canEdit && <button className="button button-secondary" onClick={() => { setDirty(true); setResources((all) => [...all, {
            id: crypto.randomUUID(), title: '', count: 1, minimumYears: 0, skills: [], qualifications: ''
          }]); }}><Icon name="plus" />Add role</button>}</div>
        <div className="resource-editor-list">{resources.map((resource) => <div className="resource-editor" key={resource.id}>
          <label className="resource-title"><span>Role title <em className="field-required">Required</em></span><input id={`role-${resource.id}`} aria-invalid={invalidField === `role-${resource.id}`} disabled={!canEdit} value={resource.title} onChange={(event) => changeResource(resource.id, { title: event.target.value })} placeholder="e.g. Cloud Architect" /></label>
          <label><span>COUNT</span><input disabled={!canEdit} type="number" min="1" value={resource.count} onChange={(event) => changeResource(resource.id, { count: Number(event.target.value) })} /></label>
          <label><span>MIN. YEARS</span><input disabled={!canEdit} type="number" min="0" value={resource.minimumYears} onChange={(event) => changeResource(resource.id, { minimumYears: Number(event.target.value) })} /></label>
          {canEdit && <button className="icon-button" title="Remove role" onClick={() => { setDirty(true); setResources((all) => all.filter((item) => item.id !== resource.id)); }}><Icon name="trash" /></button>}
          <label className="field-wide"><span>REQUIRED SKILLS — COMMA SEPARATED</span><input disabled={!canEdit} value={resource.skills.join(', ')}
            onChange={(event) => changeResource(resource.id, { skills: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })} /></label>
          <label className="field-wide"><span>QUALIFICATIONS</span><textarea disabled={!canEdit} rows={2} value={resource.qualifications}
            onChange={(event) => changeResource(resource.id, { qualifications: event.target.value })} /></label>
        </div>)}</div>
      </div>
      <div className="workspace-section publish-panel">
        <label><span>Sourcing brief <em className="field-hint">Required when sharing</em></span><textarea id="sourcing-brief" aria-invalid={invalidField === 'sourcing-brief'} disabled={!canEdit} rows={3} value={brief} onChange={(event) => setBrief(event.target.value)}
          placeholder="Explain what makes a candidate suitable without exposing source links or RFO documents." /></label>
        <label><span>VISIBILITY</span><select disabled={!canEdit} value={sourcingStatus} onChange={(event) => setSourcingStatus(event.target.value as BidWorkflow['sourcingStatus'])}>
          <option>Not published</option><option>Open</option><option>Sourcing complete</option></select></label>
        <div className="privacy-note"><Icon name="shield" /><span><strong>Sourcing-safe view</strong> Source URLs, buyer contacts, internal notes, and RFO documents are never sent to Candidate Sourcing users.</span></div>
      </div>
    </>}
    </div>
    </fieldset>
    {saveError && <div id="preparation-error" className="save-error" role="alert"><Icon name="info" size={16} />{saveError}</div>}
    <footer className="workspace-save comfort-save"><span className="save-status" role="status"><Icon name={dirty ? 'edit' : 'check'} size={15} />{saving ? 'Saving your changes…' : dirty ? 'Unsaved changes' : savedNow ? 'Saved just now' : 'No unsaved changes'}</span>
      {canEdit && <div className="save-actions"><small>Ctrl / ⌘ S to save</small><button className="button button-primary" disabled={saving || !dirty} onClick={() => void save()}><Icon name="check" />{saving ? 'Saving...' : 'Save changes'}</button></div>}</footer>
  </section>;
}

export function TalentSourcing() {
  const { user } = useAuth();
  const { bids, loading, load } = useBids();
  const [selectedId, setSelectedId] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const notify = useToast();
  const openBids = bids.filter((bid) => bid.workflow.decision === 'Qualified' && bid.workflow.sourcingStatus === 'Open');
  const selected = openBids.find((bid) => bid.opportunity.id === selectedId) || openBids[0];

  const loadCandidates = (opportunityId: string) => api.get<{ candidates: Candidate[] }>(`/candidates?opportunity=${encodeURIComponent(opportunityId)}`)
    .then(({ candidates: next }) => setCandidates(next));
  useEffect(() => {
    if (selected) { setSelectedId(selected.opportunity.id); void loadCandidates(selected.opportunity.id); }
  }, [selected?.opportunity.id]);

  const review = async (candidate: Candidate, reviewStatus: Candidate['reviewStatus']) => {
    const { candidate: updated } = await api.patch<{ candidate: Candidate }>(`/candidates/${candidate.id}`, { reviewStatus });
    setCandidates((all) => all.map((item) => item.id === updated.id ? updated : item));
    void load();
    notify(`Candidate marked ${reviewStatus.toLowerCase()}.`);
  };

  return <div className="page-stack">
    <section className="role-banner role-banner-sourcing">
      <div className="role-banner-icon"><Icon name="users" /></div><div><span className="eyebrow">CANDIDATE SOURCING WORKSPACE</span>
        <h2>Find the right people for each bid.</h2><p>Review the required roles and qualifications, then submit the strongest available candidates for Bid manager.</p></div>
      <span className="access-chip"><Icon name="shield" size={14} /> Restricted view</span>
    </section>
    {loading ? <section className="card loading-state"><span className="spinner" />Loading sourcing briefs...</section>
      : openBids.length === 0 ? <section className="card"><EmptyState title="No briefs are open for sourcing" message="Bid manager will publish a brief after approving an RFO." /></section>
        : <>
          <section className="sourcing-tabs">{openBids.map((bid) => <button className={selected?.opportunity.id === bid.opportunity.id ? 'active' : ''}
            key={bid.opportunity.id} onClick={() => setSelectedId(bid.opportunity.id)}>
            <span>{bid.opportunity.solicitationType} · {bid.opportunity.solicitationNumber}</span>
            <strong>{displayOpportunityTitle(bid.opportunity.title, bid.opportunity.description)}</strong>
            <small>{bid.workflow.requiredResources.reduce((sum, resource) => sum + resource.count, 0)} openings · {deadlineLabel(bid.opportunity.closesAt)}</small>
          </button>)}</section>
          {selected && <div className="sourcing-layout">
            <div className="page-stack">
              <section className="card sourcing-brief">
                <header><div><span className="eyebrow">APPROVED SOURCING BRIEF</span><h2>{displayOpportunityTitle(selected.opportunity.title, selected.opportunity.description)}</h2>
                  <p>{selected.opportunity.agency} · {selected.opportunity.location} · due {dateTime(selected.opportunity.closesAt)}</p></div><StatusBadge value="Open" /></header>
                <div className="privacy-note"><Icon name="shield" /><span>Only public RFO context and approved qualifications are visible. Documents, source links, contacts, and internal evaluation notes are restricted.</span></div>
                <p className="brief-copy">{selected.workflow.sourcingBrief || 'Source candidates who satisfy every required qualification below.'}</p>
                <div className="requirement-grid">{selected.workflow.requiredResources.map((resource) => <article key={resource.id}>
                  <header><span className="role-count">{resource.count}×</span><div><h3>{resource.title}</h3><p>{resource.minimumYears}+ years experience</p></div></header>
                  <div className="skill-list">{resource.skills.map((skill) => <span key={skill}>{skill}</span>)}</div>
                  <p>{resource.qualifications}</p>
                </article>)}</div>
              </section>
              <CandidateList candidates={candidates} requirements={selected.workflow.requiredResources} canReview={user?.role !== 'sourcing_user'} onReview={review} onResumeRemoved={(id) => setCandidates((all) => all.map((item) => item.id === id ? { ...item, resume: null } : item))} />
            </div>
            <CandidateForm key={selected.opportunity.id} opportunityId={selected.opportunity.id} requirements={selected.workflow.requiredResources} onCreated={(candidate) => {
              setCandidates((all) => [candidate, ...all]); notify('Candidate sent to Bid manager.');
            }} />
          </div>}
        </>}
  </div>;
}

function CandidateForm({ opportunityId, requirements, onCreated }: { opportunityId: string; requirements: ResourceRequirement[]; onCreated: (candidate: Candidate) => void }) {
  const blank = { resourceRequirementId: requirements[0]?.id || '', fullName: '', currentTitle: '', location: '', yearsExperience: 0, availability: '', skills: '', qualificationSummary: '', profileReference: '' };
  const [form, setForm] = useState(blank);
  const [resume, setResume] = useState<File | null>(null);
  const resumeInput = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const notify = useToast();
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true);
    try {
      const { candidate } = await api.post<{ candidate: Candidate }>('/candidates', {
        ...form, opportunityId, skills: form.skills.split(',').map((value) => value.trim()).filter(Boolean),
        resume: resume ? { name: resume.name, data: await fileBase64(resume) } : undefined
      });
      onCreated(candidate);
      setForm(blank);
      setResume(null);
      if (resumeInput.current) resumeInput.current.value = '';
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not submit candidate.', 'error'); }
    finally { setSaving(false); }
  };
  const field = (key: keyof typeof form, value: string | number) => setForm((current) => ({ ...current, [key]: value }));
  return <form className="card candidate-form" onSubmit={submit}>
    <header><span className="candidate-form-icon"><Icon name="plus" /></span><div><h3>Submit a candidate</h3><p>Bid manager will evaluate the profile.</p></div></header>
    <fieldset className="editor-fields candidate-fields" disabled={saving}>
    <label><span>SOURCED FOR *</span><select required value={form.resourceRequirementId} onChange={(event) => field('resourceRequirementId', event.target.value)}>
      <option value="">Select required role</option>{requirements.map((requirement) => <option value={requirement.id} key={requirement.id}>{requirement.title}</option>)}</select></label>
    <label><span>FULL NAME *</span><input required value={form.fullName} onChange={(event) => field('fullName', event.target.value)} /></label>
    <label><span>CURRENT TITLE</span><input value={form.currentTitle} onChange={(event) => field('currentTitle', event.target.value)} /></label>
    <div className="form-grid"><label><span>LOCATION</span><input value={form.location} onChange={(event) => field('location', event.target.value)} /></label>
      <label><span>YEARS</span><input type="number" min="0" value={form.yearsExperience} onChange={(event) => field('yearsExperience', Number(event.target.value))} /></label></div>
    <label><span>AVAILABILITY</span><input value={form.availability} onChange={(event) => field('availability', event.target.value)} placeholder="e.g. Available in 2 weeks" /></label>
    <label><span>SKILLS — COMMA SEPARATED</span><input value={form.skills} onChange={(event) => field('skills', event.target.value)} /></label>
    <label><span>QUALIFICATION SUMMARY</span><textarea required rows={4} value={form.qualificationSummary} onChange={(event) => field('qualificationSummary', event.target.value)} /></label>
    <label><span>INTERNAL PROFILE REFERENCE</span><input value={form.profileReference} onChange={(event) => field('profileReference', event.target.value)} placeholder="ATS ID or approved internal path" /></label>
    <div className="resume-upload"><label><span>Resume <em className="field-hint">Optional · PDF, DOC, DOCX · up to 5 MB</em></span>
      <input ref={resumeInput} type="file" accept=".pdf,.doc,.docx" onChange={(event) => {
        const file = event.target.files?.[0];
        if (file && (!/\.(pdf|docx?)$/i.test(file.name) || file.size > 5 * 1024 * 1024 || !file.size)) {
          notify('Choose a PDF, DOC, or DOCX resume up to 5 MB.', 'error'); event.target.value = ''; setResume(null); return;
        }
        setResume(file || null);
      }} /></label>
      {resume && <div className="attachment-actions"><span><Icon name="file" size={15} />{resume.name} · {formatFileSize(resume.size)}</span><button type="button" className="button button-subtle" onClick={() => { setResume(null); if (resumeInput.current) resumeInput.current.value = ''; }}><Icon name="close" size={15} />Remove</button></div>}
    </div>
    </fieldset>
    <button className="button button-primary button-full" disabled={saving}><Icon name="users" />{saving ? 'Submitting...' : 'Send to review'}</button>
  </form>;
}

function CandidateList({ candidates, requirements, canReview, onReview, onResumeRemoved }: { candidates: Candidate[]; requirements: ResourceRequirement[]; canReview: boolean; onReview: (candidate: Candidate, status: Candidate['reviewStatus']) => Promise<void>; onResumeRemoved: (id: string) => void }) {
  const notify = useToast();
  const [removing, setRemoving] = useState<string | null>(null);
  const removeResume = async (candidate: Candidate) => {
    if (!window.confirm(`Permanently delete the resume for ${candidate.fullName}? The candidate profile will be kept.`)) return;
    setRemoving(candidate.id);
    try { await api.delete(`/candidates/${candidate.id}/resume`); onResumeRemoved(candidate.id); notify('Resume deleted. Candidate profile kept.'); }
    catch (error) { notify(error instanceof Error ? error.message : 'Could not delete resume.', 'error'); }
    finally { setRemoving(null); }
  };
  return <section className="card candidate-list"><div className="card-header"><div><h3>Candidate pipeline</h3><p>{candidates.length} profiles submitted for this RFO</p></div></div>
    {candidates.length === 0 ? <EmptyState title="No candidates submitted yet" message="New candidate profiles will appear here." />
      : <div>{candidates.map((candidate) => <article key={candidate.id}>
        <div className="candidate-avatar">{candidate.fullName.split(/\s+/).map((part) => part[0]).slice(0, 2).join('')}</div>
        <div><div className="candidate-name"><h4>{candidate.fullName}</h4><StatusBadge value={candidate.reviewStatus} /></div>
          <p>Sourced for <strong>{requirements.find((item) => item.id === candidate.resourceRequirementId)?.title || 'Required role'}</strong> · {candidate.currentTitle || 'Title not provided'} · {candidate.yearsExperience} years · {candidate.location || 'Location open'}</p>
          <div className="skill-list">{candidate.skills.map((skill) => <span key={skill}>{skill}</span>)}</div>
          <small>{candidate.qualificationSummary}</small>
          {candidate.resume && <div className="attachment-actions"><a className="button button-subtle" href={candidate.resume.downloadUrl} download><Icon name="download" size={15} />Resume · {formatFileSize(candidate.resume.sizeBytes)}</a><span className="attachment-name">{candidate.resume.fileName}</span>
            <button className="button button-subtle" disabled={!!removing} onClick={() => void removeResume(candidate)}><Icon name="trash" size={15} />{removing === candidate.id ? 'Removing…' : 'Remove resume'}</button></div>}</div>
        {canReview && <div className="candidate-actions"><button onClick={() => void onReview(candidate, 'Shortlisted')}><Icon name="check" />Shortlist</button>
          <button onClick={() => void onReview(candidate, 'Rejected')}><Icon name="close" />Reject</button></div>}
      </article>)}</div>}
  </section>;
}

export function ResponseReview() {
  const { user } = useAuth();
  const { bids, setBids, loading, load } = useBids();
  const notify = useToast();
  const isSuper = user?.role === 'super_admin';
  const reviewOrder: Record<string, number> = { 'Ready for review': 0, 'Changes requested': 1, 'In progress': 2, 'Not started': 3, Submitted: 4, 'Not submitted': 5 };
  const qualified = bids.filter((bid) => bid.workflow.decision === 'Qualified')
    .sort((a, b) => (reviewOrder[a.workflow.responseStatus] ?? 9) - (reviewOrder[b.workflow.responseStatus] ?? 9));
  const [selectedId, setSelectedId] = useState('');
  const selected = qualified.find((bid) => bid.opportunity.id === selectedId) || qualified[0];
  const [documents, setDocuments] = useState<DocumentationItem[]>([]);
  const [documentationNotes, setDocumentationNotes] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState<ResponseFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedNow, setSavedNow] = useState(false);
  const dirty = !!selected && (JSON.stringify(documents) !== JSON.stringify(selected.workflow.documentationItems)
    || documentationNotes !== selected.workflow.documentationNotes || reviewNotes !== selected.workflow.responseReviewNotes);
  const reviewItems = [...documents].filter((item) => !attentionOnly || item.status !== 'Ready')
    .sort((a, b) => ((a.status === 'Ready' ? 2 : 0) + (a.required ? 0 : 1)) - ((b.status === 'Ready' ? 2 : 0) + (b.required ? 0 : 1)));

  const loadFiles = async (opportunityId: string) => {
    setFilesLoading(true);
    try {
      const result = await api.get<{ files: ResponseFile[] }>(`/bids/${opportunityId}/files`);
      setFiles(result.files);
    } finally { setFilesLoading(false); }
  };

  useEffect(() => {
    if (!selected) return;
    setSelectedId(selected.opportunity.id); setDocuments(selected.workflow.documentationItems);
    setDocumentationNotes(selected.workflow.documentationNotes);
    setReviewNotes(selected.workflow.responseReviewNotes);
    setSaveError(''); setSavedNow(false); setAttentionOnly(false);
    void loadFiles(selected.opportunity.id);
  }, [selected?.opportunity.id]);

  const save = async (action: 'save' | 'requestReview' | 'Submitted' | 'Not submitted' = 'save') => {
    if (!selected || saving) return;
    setSaveError('');
    const unnamed = documents.find((item) => !item.label.trim());
    if (unnamed) {
      setAttentionOnly(false); setSaveError('Name the new checklist item, or remove it before saving.');
      requestAnimationFrame(() => document.getElementById(`document-${unnamed.id}`)?.focus());
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { documentationItems: documents, documentationNotes };
      if (isSuper) payload.responseReviewNotes = reviewNotes;
      if (action === 'requestReview') payload.requestReview = true;
      if (action === 'Submitted' || action === 'Not submitted') payload.finalStage = action;
      const result = await api.patch<{ workflow: BidWorkflow; opportunity: BidRecord['opportunity'] }>(`/bids/${selected.opportunity.id}/workflow`, payload);
      setBids((all) => all.map((bid) => bid.opportunity.id === result.workflow.opportunityId
        ? { ...bid, workflow: result.workflow, opportunity: result.opportunity } : bid));
      setDocuments(result.workflow.documentationItems); setDocumentationNotes(result.workflow.documentationNotes);
      setReviewNotes(result.workflow.responseReviewNotes); setSavedNow(true);
      notify(action === 'requestReview' ? 'Response package sent to Super Admin.'
        : action === 'Submitted' || action === 'Not submitted' ? `RFO marked ${action.toLowerCase()}.`
          : 'Response workspace saved.');
    } catch (error) { setSaveError(error instanceof Error ? error.message : 'Could not save. Your edits are still here; please try again.'); }
    finally { setSaving(false); }
  };
  useDraftGuard(dirty, saving, () => void save());
  const readyCount = documents.filter((item) => item.status === 'Ready').length;
  const requiredMissing = documents.filter((item) => item.required && item.status !== 'Ready').length;
  const approvedFiles = files.filter((file) => file.reviewStatus === 'Approved').length;
  const packageComplete = files.length > 0 && approvedFiles === files.length;
  const isFinal = selected ? ['Submitted', 'Not submitted'].includes(selected.opportunity.status) : false;
  const canEditPackage = !isFinal || isSuper;

  return <div className="page-stack">
    <section className="role-banner role-banner-review"><div className="role-banner-icon"><Icon name="file" /></div><div>
      <span className="eyebrow">{isSuper ? 'SUPER ADMIN · RESPONSE REVIEW' : 'RESOURCE REVIEW · DOCUMENTATION'}</span>
      <h2>{isSuper ? 'Edit, validate, and finalize every part of the RFO response.' : 'Own the documentation package before final review.'}</h2>
      <p>{isSuper ? 'You can update the checklist, upload or remove files, review them, and set the final response decision.' : 'Build the checklist, resolve missing attachments, and send a complete package to Bid manager.'}</p></div>
    </section>
    <div className="response-layout">
      <section className="card response-queue"><header><h3>{isSuper ? 'Review queue' : 'Active responses'}</h3><span>{qualified.length}</span></header>
        {loading ? <div className="loading-state"><span className="spinner" /></div> : qualified.map((bid) => {
          const complete = bid.workflow.documentationItems.filter((item) => item.status === 'Ready').length;
          const total = bid.workflow.documentationItems.length;
          return <button className={selected?.opportunity.id === bid.opportunity.id ? 'active' : ''} key={bid.opportunity.id} onClick={() => { if (selected?.opportunity.id === bid.opportunity.id || canLeaveEditor()) setSelectedId(bid.opportunity.id); }}>
            <strong>{displayOpportunityTitle(bid.opportunity.title, bid.opportunity.description)}</strong><p>{bid.opportunity.agency}</p>
            <div className="mini-progress"><i style={{ width: `${total ? complete / total * 100 : 0}%` }} /></div>
            <footer><span>{bid.responseFileCount} files · {complete}/{total} ready{isSuper && bid.pendingFileCount ? ` · ${bid.pendingFileCount} review` : ''}</span><StatusBadge value={bid.opportunity.status} /></footer>
          </button>;
        })}
      </section>
      {selected ? <section className="card response-workspace" onChange={() => setSaveError('')}>
        <fieldset className="editor-fields" disabled={saving}>
        <header className="workspace-head"><div><span className="eyebrow">{selected.opportunity.solicitationNumber}</span>
          <h2>{displayOpportunityTitle(selected.opportunity.title, selected.opportunity.description)}</h2><p>{selected.opportunity.agency} · {dateTime(selected.opportunity.closesAt)}</p></div>
          <StatusBadge value={selected.opportunity.status} /></header>
        <ProgressRail active={isFinal || ['Ready for review', 'Changes requested'].includes(selected.workflow.responseStatus) ? 4 : 3} />
        <section className="response-summary">
          <div><span>CANDIDATES</span><strong>{selected.candidateCount}</strong><small>{selected.shortlistedCount} shortlisted</small></div>
          <div><span>RESPONSE PACKAGE</span><strong>{files.length}</strong><small>{approvedFiles} approved · {readyCount}/{documents.length} requirements ready</small></div>
          <div><span>DECISION</span><strong>{selected.workflow.decision}</strong><small>{selected.workflow.decidedBy || 'Bid manager'}</small></div>
        </section>
        <section className="workspace-section">
          <div className="section-title"><div><h3>Complete the required items first</h3><p>{requiredMissing ? `${requiredMissing} required item${requiredMissing === 1 ? '' : 's'} still need attention.` : 'All required checklist items are ready.'} Optional items follow below.</p></div>
            {canEditPackage && <button className="button button-secondary" onClick={() => { setAttentionOnly(false); setSaveError(''); setDocuments((all) => [...all, { id: crypto.randomUUID(), label: '', required: true, status: 'Missing', owner: '' }]); }}><Icon name="plus" />Add item</button>}</div>
          <div className="checklist-toolbar"><span>{readyCount} of {documents.length} ready</span><button className="attention-filter" aria-pressed={attentionOnly} onClick={() => setAttentionOnly(!attentionOnly)}><Icon name="filter" size={15} />Needs attention <b>{documents.length - readyCount}</b></button></div>
          <div className="document-checklist review-checklist">{reviewItems.map((item) => <div key={item.id}>
            <label className="doc-label"><span>Document name <em className="field-required">Required field</em></span><input id={`document-${item.id}`} disabled={!canEditPackage} value={item.label} placeholder="e.g. Technical proposal" onChange={(event) => setDocuments((all) => all.map((doc) => doc.id === item.id ? { ...doc, label: event.target.value } : doc))} /></label>
            <label className="doc-status"><span>Readiness</span><select disabled={!canEditPackage} className={`doc-state doc-${item.status.toLowerCase().replace(' ', '-')}`} value={item.status}
              onChange={(event) => setDocuments((all) => all.map((doc) => doc.id === item.id ? { ...doc, status: event.target.value as DocumentationItem['status'] } : doc))}>
              <option>Missing</option><option>In progress</option><option>Ready</option></select></label>
            <label className="doc-owner"><span>Owner <em className="field-hint">Optional</em></span><input disabled={!canEditPackage} value={item.owner} placeholder="Assign later" onChange={(event) => setDocuments((all) => all.map((doc) => doc.id === item.id ? { ...doc, owner: event.target.value } : doc))} /></label>
            <label className="required-check"><input disabled={!canEditPackage} type="checkbox" checked={item.required} onChange={(event) => setDocuments((all) => all.map((doc) => doc.id === item.id ? { ...doc, required: event.target.checked } : doc))} />Required</label>
            {canEditPackage && <button className="icon-button" aria-label={`Remove checklist item ${item.label || 'untitled'}`} onClick={() => { setSaveError(''); setDocuments((all) => all.filter((doc) => doc.id !== item.id)); }}><Icon name="trash" /></button>}
          </div>)}</div>
          {attentionOnly && reviewItems.length === 0 && <p className="checklist-clear"><Icon name="check" size={16} />No incomplete items. Turn off the filter to see the full checklist.</p>}
          <details className="optional-fields" open={documentationNotes ? true : undefined}><summary><Icon name="edit" size={15} />Package notes <span>Optional</span></summary><label><span>Notes for the team</span><textarea disabled={!canEditPackage} rows={3} value={documentationNotes} onChange={(event) => setDocumentationNotes(event.target.value)} placeholder="Missing evidence, owners, and package notes..." /></label></details>
        </section>
        <ResponsePackage key={selected.opportunity.id} opportunityId={selected.opportunity.id} documents={documents} documentationNotes={documentationNotes} files={files} loading={filesLoading}
          isSuper={isSuper} canEdit={canEditPackage} onChanged={() => {
            void loadFiles(selected.opportunity.id); void load();
          }} />
        <section className="workspace-section final-gate">
          <div><span className="final-gate-icon"><Icon name="shield" /></span><div><h3>Final response gate</h3><p>{isSuper ? 'Choose the final Submitted or Not submitted stage.' : 'Send the completed package to Super Admin for the final decision.'}</p></div></div>
          {isSuper && <label><span>FINAL REVIEW NOTES</span><textarea disabled={!canEditPackage} rows={3} value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} placeholder="Submission evidence, compliance findings, or the reason it was not submitted..." /></label>}
          {isSuper && (requiredMissing > 0 || !packageComplete) && <div className="gate-warning"><Icon name="info" />
            {requiredMissing > 0 ? `${requiredMissing} required checklist item${requiredMissing === 1 ? '' : 's'} are not ready. ` : ''}
            {!files.length ? 'No response files have been uploaded.' : !packageComplete ? `${files.length - approvedFiles} file${files.length - approvedFiles === 1 ? '' : 's'} still need approval.` : ''}
          </div>}
        </section>
        </fieldset>
        {saveError && <div className="save-error" role="alert"><Icon name="info" size={16} />{saveError}</div>}
        <footer className="workspace-save comfort-save"><span className="save-status" role="status"><Icon name={dirty ? 'edit' : 'check'} size={15} />{saving ? 'Saving your changes…' : dirty ? 'Unsaved changes' : savedNow ? 'Saved just now' : 'No unsaved changes'}</span><div className="response-final-actions">
          {isSuper ? <>
            <button className="button button-secondary" disabled={saving || !dirty} onClick={() => void save('save')}>Save all changes</button>
            <button className="button button-secondary" disabled={saving || !reviewNotes.trim()} onClick={() => void save('Not submitted')}><Icon name="close" />Mark Not submitted</button>
            <button className="button button-primary" disabled={saving || requiredMissing > 0 || !packageComplete} onClick={() => void save('Submitted')}><Icon name="check" />Mark Submitted</button>
          </> : <>
            <button className="button button-secondary" disabled={saving || isFinal} onClick={() => void save('save')}>Save response work</button>
            <button className="button button-primary" disabled={saving || isFinal || requiredMissing > 0 || !files.length} onClick={() => void save('requestReview')}><Icon name="check" />Send to Super Admin</button>
          </>}
        </div></footer>
      </section> : <section className="card response-workspace"><EmptyState title="No active responses" message="A qualified RFO will appear here." /></section>}
    </div>
  </div>;
}

function ResponsePackage({ opportunityId, documents, documentationNotes, files, loading, isSuper, canEdit, onChanged }: {
  opportunityId: string;
  documents: DocumentationItem[];
  documentationNotes: string;
  files: ResponseFile[];
  loading: boolean;
  isSuper: boolean;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [category, setCategory] = useState('Technical response');
  const [documentationItemId, setDocumentationItemId] = useState('');
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const notify = useToast();

  const upload = async () => {
    if (!selectedFiles.length) return;
    setUploading(true);
    try {
      const tooLarge = selectedFiles.find((file) => file.size > 15_000_000);
      if (tooLarge) throw new Error(`${tooLarge.name} is larger than 15 MB.`);
      if (selectedFiles.reduce((total, file) => total + file.size, 0) > 24_000_000) {
        throw new Error('The selected batch is larger than 24 MB. Upload it in smaller groups.');
      }
      const encoded = await Promise.all(selectedFiles.map(async (file) => ({
        name: file.name,
        type: file.type || 'application/octet-stream',
        data: await fileBase64(file)
      })));
      await api.post(`/bids/${opportunityId}/files`, {
        files: encoded, category, documentationItemId, description,
        documentationItems: documents, documentationNotes
      });
      setSelectedFiles([]); setDescription(''); setDocumentationItemId('');
      notify(`${encoded.length} response file${encoded.length === 1 ? '' : 's'} uploaded for review.`);
      onChanged();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not upload response files.', 'error');
    } finally { setUploading(false); }
  };

  const remove = async (file: ResponseFile) => {
    if (!window.confirm(`Remove “${file.fileName}” from this response package?`)) return;
    try {
      await api.delete(`/response-files/${file.id}`);
      notify('Response file removed.'); onChanged();
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not remove the file.', 'error'); }
  };

  const review = async (file: ResponseFile, reviewStatus: ResponseFile['reviewStatus'], reviewNotes: string) => {
    try {
      await api.patch(`/response-files/${file.id}`, { reviewStatus, reviewNotes });
      notify(reviewStatus === 'Approved' ? 'File approved.' : 'Changes sent to Bid manager.');
      onChanged();
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not save the file review.', 'error'); }
  };

  return <section className="workspace-section response-package">
    <div className="section-title"><div><h3>{isSuper ? 'Response package review' : 'Response package'}</h3>
      <p>{isSuper ? 'Download and review every file before approving the complete response.' : 'Upload a combined final response or multiple supporting documents for Super Admin.'}</p></div>
      <span className="package-count">{files.length} file{files.length === 1 ? '' : 's'}</span>
    </div>
    {canEdit && <div className="upload-composer">
      <label className="upload-dropzone"><input type="file" multiple
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip,.png,.jpg,.jpeg"
        onChange={(event) => setSelectedFiles(Array.from(event.target.files || []).slice(0, 10))} />
        <span className="upload-icon"><Icon name="upload" /></span>
        <strong>{selectedFiles.length ? `${selectedFiles.length} file${selectedFiles.length === 1 ? '' : 's'} selected` : 'Choose response files'}</strong>
        <small>PDF, Office, ZIP, images, or text · up to 10 files · 15 MB each</small>
      </label>
      <div className="upload-fields">
        <label><span>PACKAGE CATEGORY</span><select value={category} onChange={(event) => setCategory(event.target.value)}>
          <option>Combined final response</option><option>Technical response</option><option>Cost proposal</option>
          <option>Staffing and resumes</option><option>Certifications</option><option>Forms and attachments</option><option>Other supporting document</option>
        </select></label>
        <label><span>LINK TO CHECKLIST ITEM</span><select value={documentationItemId} onChange={(event) => setDocumentationItemId(event.target.value)}>
          <option value="">General response package</option>{documents.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
        <label className="field-wide"><span>HANDOFF NOTE</span><input value={description} onChange={(event) => setDescription(event.target.value)}
          placeholder="Explain what is included, what changed, or what needs special review." /></label>
        <button className="button button-primary field-wide" disabled={!selectedFiles.length || uploading} onClick={() => void upload()}>
          {uploading ? <span className="spinner" /> : <Icon name="upload" />}{uploading ? 'Uploading package...' : 'Upload to response package'}</button>
      </div>
    </div>}
    {!canEdit && <div className="package-locked"><Icon name="shield" /><span><strong>Package locked</strong>The final submission decision has been recorded.</span></div>}
    {loading ? <div className="loading-state"><span className="spinner" />Loading response package...</div>
      : files.length === 0 ? <EmptyState title="No response files uploaded" message={canEdit ? 'Upload a combined response or the required supporting documents.' : 'Bid manager has not handed off a response package yet.'} />
        : <div className="response-file-list">{files.map((file) => <ResponseFileCard key={file.id} file={file} documents={documents}
          isSuper={isSuper} canReview={isSuper} canDelete={canEdit} onDelete={remove} onReview={review} />)}</div>}
  </section>;
}

function ResponseFileCard({ file, documents, isSuper, canReview, canDelete, onDelete, onReview }: {
  file: ResponseFile;
  documents: DocumentationItem[];
  isSuper: boolean;
  canReview: boolean;
  canDelete: boolean;
  onDelete: (file: ResponseFile) => Promise<void>;
  onReview: (file: ResponseFile, status: ResponseFile['reviewStatus'], notes: string) => Promise<void>;
}) {
  const [notes, setNotes] = useState(file.reviewNotes);
  const linkedItem = documents.find((item) => item.id === file.documentationItemId);
  return <article className={`response-file-card file-${file.reviewStatus.toLowerCase().replaceAll(' ', '-')}`}>
    <div className="file-type-icon"><Icon name="file" /></div>
    <div className="file-detail">
      <div className="file-title"><h4>{file.fileName}</h4><span>v{file.version}</span><StatusBadge value={file.reviewStatus} /></div>
      <p>{file.category}{linkedItem ? ` · ${linkedItem.label}` : ''} · {formatFileSize(file.sizeBytes)}</p>
      {file.description && <small>{file.description}</small>}
      <div className="file-audit">Uploaded by {file.uploadedByName || 'Bid manager'} · {dateTime(file.createdAt)}
        {file.reviewedByName ? ` · Reviewed by ${file.reviewedByName}` : ''}</div>
      {file.reviewNotes && <div className={`file-review-note ${file.reviewStatus === 'Changes requested' ? 'needs-changes' : ''}`}>
        <Icon name={file.reviewStatus === 'Approved' ? 'check' : 'info'} size={15} /><span><strong>Super Admin review</strong>{file.reviewNotes}</span>
      </div>}
      {isSuper && canReview && <div className="file-review-controls">
        <label><span>REVIEW NOTES</span><textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)}
          placeholder="Record approval evidence or clearly explain requested changes..." /></label>
        <div><button className="button button-secondary" onClick={() => void onReview(file, 'Changes requested', notes)}><Icon name="edit" />Request changes</button>
          <button className="button button-primary" onClick={() => void onReview(file, 'Approved', notes)}><Icon name="check" />Approve file</button></div>
      </div>}
    </div>
    <div className="file-actions"><a className="icon-button" href={file.downloadUrl} title="Download"><Icon name="download" /></a>
      {canDelete && <button className="icon-button danger-icon" title="Remove" onClick={() => void onDelete(file)}><Icon name="trash" /></button>}</div>
  </article>;
}

function fileBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
