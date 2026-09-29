import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../api';
import { Icon } from '../Icon';
import { dateTime } from '../format';
import { StatusBadge } from '../StatusBadge';
import { useToast } from '../ToastContext';
import type { CollectionJob, Portal } from '../types';

const emptyPortal = {
  name: '',
  organizationName: '',
  portalType: 'Local agency',
  baseUrl: '',
  provider: 'opengov',
  accountScope: 'network',
  opportunityGroup: 'priority',
  authMode: 'public',
  connectorKey: 'manual',
  cadence: 'Daily · 7:00 AM',
  enabled: true
};

const providerLabel = (provider: string) => ({
  caleprocure: 'Cal eProcure',
  opengov: 'OpenGov',
  planetbids: 'PlanetBids / VendorLine',
  bonfire: 'EUNA / Bonfire',
  custom: 'Other portal'
}[provider] || provider);

const accountLabel = (scope: string) => ({
  statewide: 'Statewide source',
  network: 'Network account',
  agency: 'Agency registration'
}[scope] || scope);

export function PortalControls() {
  const [portals, setPortals] = useState<Portal[]>([]);
  const [editing, setEditing] = useState<Portal | null | 'new'>(null);
  const [collectingId, setCollectingId] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchParams] = useSearchParams();
  const notify = useToast();
  const load = useCallback(() => api.get<{ portals: Portal[] }>('/portals').then(({ portals: rows }) => {
    setPortals(rows);
    const runnableIds = rows
      .filter((portal) => portal.enabled && portal.connectorKey !== 'manual')
      .map((portal) => portal.id);
    setSelected((current) => current.size
      ? new Set([...current].filter((id) => runnableIds.includes(id)))
      : new Set(runnableIds));
  }), []);
  useEffect(() => { void load(); }, [load]);
  const runnable = useMemo(
    () => portals.filter((portal) => portal.enabled && portal.connectorKey !== 'manual'),
    [portals]
  );
  const allRunnableSelected = runnable.length > 0 && runnable.every((portal) => selected.has(portal.id));

  const toggle = async (portal: Portal) => {
    try {
      const { portal: updated } = await api.patch<{ portal: Portal }>(`/portals/${portal.id}`, { enabled: !portal.enabled });
      setPortals((all) => all.map((item) => item.id === portal.id ? updated : item));
      notify(`${portal.name} ${updated.enabled ? 'enabled' : 'paused'}.`);
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not update portal.', 'error'); }
  };

  const collect = async (portal: Portal) => {
    setCollectingId(portal.id);
    try {
      const { job } = await api.post<{ job: CollectionJob }>(`/portals/${portal.id}/collect`);
      if (job.status === 'Failed') throw new Error(job.errorMessage || 'Collection failed.');
      notify('Cal eProcure collection started. Progress is available in Collection activity.');
      await load();
    } catch (error) { notify(error instanceof Error ? error.message : 'Collection failed.', 'error'); }
    finally { setCollectingId(''); }
  };

  const collectSelected = async () => {
    const portalIds = runnable.filter((portal) => selected.has(portal.id)).map((portal) => portal.id);
    if (!portalIds.length) {
      notify('Select at least one ready source.', 'error');
      return;
    }
    setCollectingId('selected');
    try {
      const result = await api.post<{
        jobs: CollectionJob[];
        skipped: Array<{ portalName: string; reason: string }>;
      }>('/portals/collect-selected', { portalIds });
      notify(`${result.jobs.length} selected source${result.jobs.length === 1 ? '' : 's'} started. Track progress in Collection activity.`);
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Selected collection failed.', 'error');
    } finally {
      setCollectingId('');
    }
  };

  const remove = async (portal: Portal) => {
    if (!window.confirm(`Delete ${portal.name}? Its collection history will also be removed.`)) return;
    try {
      await api.delete(`/portals/${portal.id}`);
      setPortals((all) => all.filter((item) => item.id !== portal.id));
      notify('Portal deleted.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not delete portal.', 'error'); }
  };

  return (
    <div className="page-stack">
      <section className="module-intro">
        <div><span className="eyebrow">SOURCE REGISTRY</span><h2>Procurement portals</h2>
          <p>Register each agency portal separately and route non-Cal eProcure opportunities into the priority workspace.</p></div>
        <div className="module-actions">
          <label className="select-all-sources">
            <input type="checkbox" checked={allRunnableSelected}
              onChange={(event) => setSelected(event.target.checked
                ? new Set(runnable.map((portal) => portal.id))
                : new Set())} />
            Select all ready
          </label>
          <button className="button button-primary" onClick={() => void collectSelected()}
            disabled={!selected.size || Boolean(collectingId)}>
            {collectingId === 'selected' ? <span className="spinner" /> : <Icon name="refresh" />}
            {collectingId === 'selected' ? 'Running selected…' : `Run selected (${selected.size})`}
          </button>
          <button className="button button-secondary" onClick={() => setEditing('new')}><Icon name="plus" />Add portal</button>
        </div>
      </section>
      {searchParams.get('run') === 'selected' && <section className="inline-notice collection-callout">
        <Icon name="info" />
        <p>Select the ready sources you want, then choose <strong>Run selected</strong>. Sources marked Setup required must be connected before they can run.</p>
      </section>}

      <section className="portal-summary">
        <div><span className="summary-icon summary-blue"><Icon name="portal" /></span><p><strong>{portals.length}</strong><span>Configured portals</span></p></div>
        <div><span className="summary-icon summary-green"><Icon name="check" /></span><p><strong>{portals.filter((item) => item.enabled).length}</strong><span>Enabled sources</span></p></div>
        <div><span className="summary-icon summary-violet"><Icon name="refresh" /></span><p><strong>{portals.filter((item) => item.status === 'Healthy').length}</strong><span>Healthy connectors</span></p></div>
        <div><span className="summary-icon summary-orange"><Icon name="info" /></span><p><strong>{portals.filter((item) => item.status === 'Error').length}</strong><span>Need attention</span></p></div>
      </section>

      <section className="portal-grid">
        {portals.map((portal) => <article className={`card portal-card ${!portal.enabled ? 'portal-disabled' : ''}`} key={portal.id}>
          <header>
            <label className="source-select" title={portal.connectorKey === 'manual' ? 'Complete setup before selecting this source.' : 'Include in the next selected run'}>
              <input type="checkbox" disabled={!portal.enabled || portal.connectorKey === 'manual'}
                checked={selected.has(portal.id)}
                onChange={(event) => setSelected((current) => {
                  const next = new Set(current);
                  if (event.target.checked) next.add(portal.id);
                  else next.delete(portal.id);
                  return next;
                })} />
              <span className="sr-only">Select {portal.name}</span>
            </label>
            <div className={`portal-logo ${portal.isPrimary ? 'portal-logo-primary' : ''}`}>{portal.isPrimary ? 'CA' : portal.name.slice(0, 2).toUpperCase()}</div>
            <div><div className="portal-name"><h3>{portal.name}</h3>{portal.isPrimary && <span>PRIMARY</span>}</div>
              <p>{providerLabel(portal.provider)} · {portal.organizationName}</p></div>
            <label className="switch"><input type="checkbox" checked={portal.enabled} onChange={() => void toggle(portal)} /><span /></label>
          </header>
          <div className="portal-body">
            <div className="portal-status-row"><StatusBadge value={portal.status} /><span><i className="california-dot" />{accountLabel(portal.accountScope)}</span></div>
            <a href={portal.baseUrl} target="_blank" rel="noreferrer">{portal.baseUrl}<Icon name="external" size={14} /></a>
            <dl>
              <div><dt>Collection</dt><dd>{portal.cadence}</dd></div>
              <div><dt>Connection</dt><dd>{portal.connectorKey === 'caleprocure' ? 'Native connector' : portal.authMode === 'feed' ? 'Approved feed' : portal.authMode === 'api_key' ? 'Partner API' : 'Registration required'}</dd></div>
              <div><dt>Last successful run</dt><dd>{dateTime(portal.lastSuccessAt)}</dd></div>
            </dl>
            {portal.lastError && <div className="portal-error"><Icon name="info" size={16} />{portal.lastError}</div>}
          </div>
          <footer>
            <button className="button button-secondary" onClick={() => void collect(portal)}
              disabled={!portal.enabled || Boolean(collectingId) || portal.connectorKey === 'manual'}
              title={portal.connectorKey === 'manual' ? 'Records arrive through the approved integration feed.' : undefined}>
              {collectingId === portal.id ? <span className="spinner" /> : <Icon name="refresh" />}{collectingId === portal.id
                ? 'Collecting…'
                : portal.connectorKey === 'manual' ? ['feed', 'api_key'].includes(portal.authMode) ? 'External feed' : 'Setup required' : 'Run now'}</button>
            <div><button className="icon-button" title="Edit" onClick={() => setEditing(portal)}><Icon name="edit" /></button>
              {!portal.isPrimary && <button className="icon-button danger-icon" title="Delete" onClick={() => void remove(portal)}><Icon name="trash" /></button>}</div>
          </footer>
        </article>)}
        <button className="add-portal-card" onClick={() => setEditing('new')}><span><Icon name="plus" /></span><strong>Add procurement portal</strong><small>Configure a city, county, district, or university source</small></button>
      </section>

      <section className="card connector-note">
        <Icon name="shield" />
        <div><h3>Credentials stay outside CalTrack</h3><p>Use public listings, an approved partner feed, or your organization’s secrets manager. Vendor portal passwords are never stored in this database.</p></div>
        <Link to="/settings">Review filters <Icon name="arrow" /></Link>
      </section>
      {editing && <PortalModal portal={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
    </div>
  );
}

function PortalModal({ portal, onClose, onSaved }: { portal: Portal | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState(portal ? {
    name: portal.name, portalType: portal.portalType, baseUrl: portal.baseUrl, connectorKey: portal.connectorKey,
    cadence: portal.cadence, enabled: portal.enabled, provider: portal.provider,
    organizationName: portal.organizationName, accountScope: portal.accountScope,
    opportunityGroup: portal.opportunityGroup, authMode: portal.authMode
  } : emptyPortal);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (portal) await api.patch(`/portals/${portal.id}`, form);
      else await api.post('/portals', form);
      onSaved();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not save portal.');
    } finally { setBusy(false); }
  };
  const set = (key: string, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  const setProvider = (provider: string) => setForm((current) => ({
    ...current,
    provider,
    accountScope: provider === 'opengov' ? 'network' : 'agency',
    authMode: 'public',
    connectorKey: 'manual',
    opportunityGroup: 'priority'
  }));
  return <>
    <button className="modal-scrim" onClick={onClose} aria-label="Close dialog" />
    <form className="modal-card" onSubmit={submit}>
      <header><div><span className="eyebrow">{portal ? 'EDIT SOURCE' : 'NEW SOURCE'}</span><h2>{portal ? 'Update portal' : 'Add procurement portal'}</h2></div>
        <button type="button" className="icon-button" onClick={onClose}><Icon name="close" /></button></header>
      <div className="modal-body">
        <div className="form-grid">
          <label>Provider<select value={form.provider} disabled={portal?.isPrimary}
            onChange={(event) => setProvider(event.target.value)}>
            <option value="opengov">OpenGov</option><option value="planetbids">PlanetBids / VendorLine</option>
            <option value="bonfire">EUNA / Bonfire</option><option value="custom">Other portal</option>
          </select></label>
          <label>Registration scope<select value={form.accountScope} disabled={portal?.isPrimary}
            onChange={(event) => set('accountScope', event.target.value)}>
            <option value="network">Network account</option><option value="agency">Separate agency registration</option>
          </select></label>
        </div>
        <label>Source name<input required value={form.name} onChange={(event) => set('name', event.target.value)}
          placeholder="e.g. City of San José OpenGov" /></label>
        <label>Agency or organization<input required value={form.organizationName}
          onChange={(event) => set('organizationName', event.target.value)} placeholder="e.g. City of San José" /></label>
        <div className="form-grid">
          <label>Organization type<select value={form.portalType} onChange={(event) => set('portalType', event.target.value)}><option>State</option><option>County</option><option>City</option><option>School district</option><option>Public university</option><option>Special district</option><option>Local agency</option></select></label>
          <label>Collection cadence<select value={form.cadence} onChange={(event) => set('cadence', event.target.value)}><option>Manual</option><option>Daily · 6:00 AM</option><option>Daily · 7:00 AM</option><option>Weekly · Monday</option></select></label>
        </div>
        <label>Portal URL<input required type="url" value={form.baseUrl} onChange={(event) => set('baseUrl', event.target.value)} placeholder="https://…" /></label>
        {!portal?.isPrimary && <label>Connection method<select value={form.authMode}
          onChange={(event) => set('authMode', event.target.value)}>
          <option value="public">Public opportunity listings</option><option value="feed">Approved normalized feed</option>
          <option value="api_key">Licensed partner API</option>
        </select></label>}
        {!portal?.isPrimary && <div className="inline-notice"><Icon name="shield" /><p>For registered-only opportunities, keep the login or API secret in an approved secrets manager and send normalized records through the CalTrack integration endpoint. Do not enter a portal password here.</p></div>}
        <label className="check-row"><input type="checkbox" checked={form.enabled} onChange={(event) => set('enabled', event.target.checked)} /><span><strong>Enable collection</strong><small>Include this source in scheduled runs</small></span></label>
        {error && <div className="form-error"><Icon name="info" />{error}</div>}
      </div>
      <footer><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button>
        <button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save portal'}</button></footer>
    </form>
  </>;
}
