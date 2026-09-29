import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { api } from '../api';
import { Icon } from '../Icon';
import { ColumnResize } from '../ColumnResize';
import { useDialogFocus } from '../useDialogFocus';
import {
  date,
  dateTime,
  deadlineLabel,
  daysUntil,
  displayOpportunityTitle,
  isIdentifierTitle
} from '../format';
import { EmptyState } from '../EmptyState';
import { MatchBadge, StatusBadge } from '../StatusBadge';
import { useToast } from '../ToastContext';
import type { Opportunity } from '../types';

const statuses = [
  'All statuses',
  'Not reviewed',
  'Qualified',
  'Not qualified',
  'Submitted',
  'Not submitted'
];

export function Opportunities() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<Opportunity[]>([]);
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [status, setStatus] = useState('All statuses');
  const [category, setCategory] = useState('All categories');
  const [source, setSource] = useState('All sources');
  const [sort, setSort] = useState('Deadline');
  const [savedOnly, setSavedOnly] = useState(false);
  const [activeSource, setActiveSource] = useState<'all' | 'caleprocure' | 'priority'>(
    searchParams.get('view') === 'priority' ? 'priority' : searchParams.get('view') === 'caleprocure' ? 'caleprocure' : 'all'
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [active, setActive] = useState<Opportunity | null>(null);
  const [loading, setLoading] = useState(true);
  const notify = useToast();

  const [nameWidth, setNameWidth] = useState(() => {
    try { const saved = Number(localStorage.getItem('caltrack.rfoNameWidth.v2')); return saved >= 280 && saved <= 1000 ? saved : 0; }
    catch { return 0; }
  });
  const resizeName = (width: number) => {
    setNameWidth(width);
    try { localStorage.setItem('caltrack.rfoNameWidth.v2', String(width)); } catch { /* Storage may be disabled. */ }
  };
  useEffect(() => { setSearch(searchParams.get('q') || ''); }, [searchParams.get('q')]);
  useEffect(() => { setSelected([]); }, [search, status, category, source, savedOnly, activeSource]);

  const requestedId = searchParams.get('opportunity');

  const load = () => api.get<{ opportunities: Opportunity[] }>('/opportunities')
    .then(({ opportunities }) => {
      setItems(opportunities);
      if (requestedId) {
        const requested = opportunities.find((item) => item.id === requestedId);
        if (requested) {
          setActive(requested);
          setActiveSource(requested.sourceGroup);
        }
      }
    })
    .catch((error) => notify(error instanceof Error ? error.message : 'Could not load RFOs.', 'error'))
    .finally(() => setLoading(false));

  useEffect(() => { void load(); }, []);

  const sourceItems = useMemo(() => items.filter((item) => activeSource === 'all' || item.sourceGroup === activeSource), [items, activeSource]);
  const categories = useMemo(() => ['All categories', ...new Set(sourceItems.map((item) => item.category))], [sourceItems]);
  const sources = useMemo(() => ['All sources', ...new Set(sourceItems.map((item) => item.sourcePortal))], [sourceItems]);
  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    const result = sourceItems.filter((item) => {
      const text = `${item.title} ${item.agency} ${item.solicitationNumber} ${item.description} ${item.tags.join(' ')}`.toLowerCase();
      return (!term || text.includes(term))
        && (status === 'All statuses' || item.status === status)
        && (category === 'All categories' || item.category === category)
        && (source === 'All sources' || item.sourcePortal === source)
        && (!savedOnly || item.saved)
        && !item.archived;
    });
    return [...result].sort((a, b) => {
      if (sort === 'Relevance') return b.relevanceScore - a.relevanceScore;
      if (sort === 'Published') return new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime();
      return new Date(a.closesAt || '2999-01-01').getTime() - new Date(b.closesAt || '2999-01-01').getTime();
    });
  }, [sourceItems, search, status, category, source, savedOnly, sort]);

  const changeSource = (nextSource: 'all' | 'caleprocure' | 'priority') => {
    setActiveSource(nextSource);
    setCategory('All categories');
    setSource('All sources');
    setActive(null);
    const next = new URLSearchParams(searchParams);
    next.set('view', nextSource);
    next.delete('opportunity');
    setSearchParams(next, { replace: true });
  };

  const openDetails = (item: Opportunity) => {
    setActive(item);
    const next = new URLSearchParams(searchParams);
    next.set('opportunity', item.id);
    setSearchParams(next, { replace: true });
    void api.get<{ opportunity: Opportunity }>(`/opportunities/${item.id}`)
      .then(({ opportunity }) => setActive(opportunity))
      .catch((error) => notify(error instanceof Error ? error.message : 'Could not load opportunity details.', 'error'));
  };

  const closeDetails = () => {
    setActive(null);
    const next = new URLSearchParams(searchParams);
    next.delete('opportunity');
    setSearchParams(next, { replace: true });
  };

  const update = async (item: Opportunity, patch: Partial<Opportunity>, message?: string) => {
    try {
      const { opportunity } = await api.patch<{ opportunity: Opportunity }>(`/opportunities/${item.id}`, patch);
      setItems((all) => all.map((candidate) => candidate.id === item.id ? opportunity : candidate));
      setActive((current) => current?.id === item.id ? opportunity : current);
      if (message) notify(message);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not update opportunity.', 'error');
    }
  };

  const remove = async (item: Opportunity) => {
    if (!window.confirm(`Delete “${item.title}”? This cannot be undone.`)) return;
    await api.delete(`/opportunities/${item.id}`);
    setItems((all) => all.filter((candidate) => candidate.id !== item.id));
    closeDetails();
    notify('Opportunity deleted.');
  };

  const exportCsv = () => {
    const exportItems = selected.length ? items.filter((item) => selected.includes(item.id)) : filtered;
    const columns = ['Solicitation', 'Type', 'Title', 'Agency', 'Category', 'Status', 'Published', 'Closes (Pacific)', 'Source', 'URL'];
    const rows = exportItems.map((item) => [
      item.solicitationNumber,
      item.solicitationType,
      item.title,
      item.agency,
      item.category,
      item.status,
      dateTime(item.publishedAt),
      dateTime(item.closesAt),
      item.sourcePortal,
      item.sourceUrl
    ].map((value) => `"${String(value || '').replaceAll('"', '""')}"`).join(','));
    const blob = new Blob([[columns.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `caltrack-opportunities-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
    notify(`Exported ${exportItems.length} opportunities.`);
  };

  return (
    <div className="page-stack">
      <section className="card opportunity-source-tabs" aria-label="Opportunity sources">
        <button aria-pressed={activeSource === 'all'} className={activeSource === 'all' ? 'active' : ''} onClick={() => changeSource('all')}>
          <span><strong>All sources</strong><small>All technology opportunities</small></span><b>{items.length}</b>
        </button>
        <button aria-pressed={activeSource === 'caleprocure'} className={activeSource === 'caleprocure' ? 'active' : ''} onClick={() => changeSource('caleprocure')}>
          <span className="source-tab-icon source-tab-ca">CA</span>
          <span><strong>Cal eProcure</strong><small>Statewide California solicitations</small></span>
          <b>{items.filter((item) => item.sourceGroup === 'caleprocure').length}</b>
        </button>
        <button aria-pressed={activeSource === 'priority'} className={activeSource === 'priority' ? 'active' : ''} onClick={() => changeSource('priority')}>
          <span className="source-tab-icon"><Icon name="trend" /></span>
          <span><strong>Priority sources</strong><small>OpenGov · PlanetBids · EUNA / Bonfire</small></span>
          <b>{items.filter((item) => item.sourceGroup === 'priority').length}</b>
        </button>
      </section>
      <section className="opportunity-toolbar">
        <div className="segmented">
          <button aria-pressed={!savedOnly} className={!savedOnly ? 'active' : ''} onClick={() => setSavedOnly(false)}>
            All RFOs <span>{sourceItems.filter((item) => !item.archived).length}</span>
          </button>
          <button aria-pressed={savedOnly} className={savedOnly ? 'active' : ''} onClick={() => setSavedOnly(true)}>
            <Icon name="bookmark" size={15} /> Saved <span>{sourceItems.filter((item) => item.saved).length}</span>
          </button>
        </div>
        <div className="toolbar-actions">
          <button className="button button-secondary" onClick={exportCsv}>
            <Icon name="download" />Export{selected.length ? ` (${selected.length})` : ''}
          </button>
        </div>
      </section>

      <section className="card filters-card">
        <div className="filter-search">
          <Icon name="search" />
          <input value={search} onChange={(event) => setSearch(event.target.value)}
            aria-label="Search opportunities" placeholder="Search RFO name, agency, or number" />
          {search && <button aria-label="Clear search" onClick={() => setSearch('')}><Icon name="close" size={15} /></button>}
        </div>
        <label><span>STATUS</span><select value={status} onChange={(event) => setStatus(event.target.value)}>
          {statuses.map((value) => <option key={value}>{value}</option>)}
        </select></label>
        <label><span>CATEGORY</span><select value={category} onChange={(event) => setCategory(event.target.value)}>
          {categories.map((value) => <option key={value}>{value}</option>)}
        </select></label>
        <label><span>SOURCE</span><select value={source} onChange={(event) => setSource(event.target.value)}>
          {sources.map((value) => <option key={value}>{value}</option>)}
        </select></label>
      </section>

      <section className="results-summary">
        <p><strong>{filtered.length}</strong> open RFOs · IT services only
          {(search || status !== 'All statuses' || category !== 'All categories' || source !== 'All sources' || savedOnly) && <button className="clear-filters" onClick={() => { setSearch(''); setStatus('All statuses'); setCategory('All categories'); setSource('All sources'); setSavedOnly(false); }}>Clear filters</button>}
        </p>
        <label>All deadlines shown in Pacific Time · Sort by
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option>Deadline</option><option>Relevance</option><option>Published</option>
          </select>
        </label>
      </section>

      <section className="card table-card">
        {loading ? <div className="loading-state"><span className="spinner" />Loading opportunities…</div> : filtered.length === 0
          ? <EmptyState title="No open opportunities match these filters" message="Try broadening your keywords or clearing a filter." />
          : <div className="table-scroll"><table className="opportunities-table compact-rfo-table" style={{ tableLayout: 'fixed', width: nameWidth ? nameWidth + 574 : '100%' }}>
            <colgroup><col style={{ width: 32 }} /><col style={{ width: nameWidth || undefined }} /><col style={{ width: 126 }} /><col style={{ width: nameWidth ? 140 : '18%' }} /><col style={{ width: 140 }} /><col style={{ width: 100 }} /><col style={{ width: 36 }} /></colgroup>
            <thead><tr>
              <th><input aria-label="Select all visible RFOs" type="checkbox" checked={selected.length > 0 && selected.length === filtered.length}
                onChange={(event) => setSelected(event.target.checked ? filtered.map((item) => item.id) : [])} /></th>
              <th className="resizable-heading"><span className="column-label"><Icon name="file" size={13} />RFO name</span><ColumnResize width={nameWidth || 320} onChange={resizeName} /></th>
              <th><span className="column-label"><Icon name="calendar" size={13} />Deadline · PT</span></th>
              <th><span className="column-label"><Icon name="portal" size={13} />Agency / source</span></th>
              <th><span className="column-label"><Icon name="target" size={13} />Category / match</span></th>
              <th>Status</th><th><span className="sr-only">Save RFO</span></th>
            </tr></thead>
            <tbody>{filtered.map((item) => {
              const remaining = daysUntil(item.closesAt);
              return <tr key={item.id} onClick={() => openDetails(item)}>
                <td onClick={(event) => event.stopPropagation()}><input aria-label={`Select ${item.title}`} type="checkbox" checked={selected.includes(item.id)}
                  onChange={(event) => setSelected((current) => event.target.checked
                    ? [...current, item.id]
                    : current.filter((id) => id !== item.id))} /></td>
                <td><div className="table-title">
                  <button type="button" onClick={(event) => { event.stopPropagation(); openDetails(item); }}>
                    {displayOpportunityTitle(item.title, item.description)}
                  </button>
                  <small>{item.solicitationType} · #{item.solicitationNumber}</small>
                  <small className="published-date"><Icon name="calendar" size={12} />Published {date(item.publishedAt)}</small>
                </div></td>
                <td className="rfo-deadline"><strong className={(remaining ?? 99) <= 7 ? 'deadline-urgent' : ''}>{date(item.closesAt)}</strong>
                  {item.closesAt && <small>{date(item.closesAt, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}</small>}
                  <small>{deadlineLabel(item.closesAt)}</small></td>
                <td><strong>{item.agency}</strong><small>{item.sourcePortal}</small></td>
                <td className="rfo-relevance"><span className="rfo-category">{item.category}</span><MatchBadge score={item.relevanceScore} /></td>
                <td><StatusBadge value={item.status} />{item.resourcePreparationSelected && <small className="in-preparation">In preparation</small>}</td>
                <td onClick={(event) => event.stopPropagation()}>
                  <button className={`icon-button ${item.saved ? 'is-saved' : ''}`}
                    aria-label={item.saved ? "Unsave RFO" : "Save RFO"} onClick={() => void update(item, { saved: !item.saved }, item.saved ? 'Removed from saved.' : 'Opportunity saved.')}>
                    <Icon name="bookmark" />
                  </button>
                </td>
              </tr>;
            })}</tbody>
          </table></div>}
        <div className="table-footer">
          <span>Showing {filtered.length} open records</span>
          <button className="fit-columns" onClick={() => resizeName(0)}>Fit columns to screen</button>
        </div>
      </section>

      {active && <OpportunityDrawer item={active} onClose={closeDetails} onUpdate={update} onDelete={remove}
        onPrepare={async (item, priority) => {
          try {
            const { opportunity } = await api.patch<{ opportunity: Opportunity }>(`/opportunities/${item.id}`, { priority, resourcePreparationSelected: true });
            setItems((all) => all.map((candidate) => candidate.id === item.id ? opportunity : candidate));
            setActive(opportunity);
            notify('Added to Resource Preparation.');
            navigate(`/bid-decisions?rfo=${encodeURIComponent(item.id)}`);
          } catch (error) {
            notify(error instanceof Error ? error.message : 'Could not add this RFO to Resource Preparation.', 'error');
          }
        }} />}
    </div>
  );
}

function OpportunityDrawer({ item, onClose, onUpdate, onDelete, onPrepare }: {
  item: Opportunity;
  onClose: () => void;
  onUpdate: (item: Opportunity, patch: Partial<Opportunity>, message?: string) => Promise<void>;
  onDelete: (item: Opportunity) => Promise<void>;
  onPrepare: (item: Opportunity, priority: Opportunity['priority']) => Promise<void>;
}) {
  const dialogRef = useDialogFocus(onClose);
  const [notes, setNotes] = useState(item.notes);
  const [tag, setTag] = useState('');
  const [ownerName, setOwnerName] = useState(item.ownerName);
  const [priority, setPriority] = useState(item.priority);
  const [nextAction, setNextAction] = useState(item.nextAction);
  const [nextActionDueAt, setNextActionDueAt] = useState(item.nextActionDueAt?.slice(0, 10) || '');
  useEffect(() => {
    setNotes(item.notes);
    setOwnerName(item.ownerName);
    setPriority(item.priority);
    setNextAction(item.nextAction);
    setNextActionDueAt(item.nextActionDueAt?.slice(0, 10) || '');
  }, [item.id]);
  return <>
    <button className="drawer-scrim" onClick={onClose} aria-label="Close details" />
    <aside ref={dialogRef} className="opportunity-drawer" role="dialog" aria-modal="true" aria-label="Opportunity details">
      <header>
        <div><span className="type-pill">{item.solicitationType}</span><span className="source-label">{item.sourcePortal}</span></div>
        <div>
          <button className={`icon-button ${item.saved ? 'is-saved' : ''}`} onClick={() => void onUpdate(item, { saved: !item.saved })}>
            <Icon name="bookmark" />
          </button>
          <button className="icon-button" aria-label="Close opportunity details" onClick={onClose}><Icon name="close" /></button>
        </div>
      </header>
      <div className="drawer-body">
        <div className="drawer-title">
          <MatchBadge score={item.relevanceScore} />
          <h2>{displayOpportunityTitle(item.title, item.description)}</h2>
          {isIdentifierTitle(item.title) && <p className="listed-title">Listed by the source as {item.title}</p>}
          <p>{item.agency}{item.department ? ` · ${item.department}` : ''}</p>
        </div>
        <div className="drawer-actions">
          <button className="button button-primary" onClick={() => void onPrepare(item, priority)}>
            {item.resourcePreparationSelected ? 'Open bid preparation' : 'Prepare this bid'} <Icon name="shield" />
          </button>
          <a className="button button-secondary" href={item.sourceUrl} target="_blank" rel="noreferrer">
            Open solicitation <Icon name="external" />
          </a>
        </div>
        <div className="drawer-facts">
          <div><span>SOLICITATION</span><strong>{item.solicitationNumber}</strong></div>
          <div><span>DEADLINE</span><strong>{dateTime(item.closesAt)}</strong>
            <small className={(daysUntil(item.closesAt) ?? 99) <= 7 ? 'deadline-urgent' : ''}>
              {deadlineLabel(item.closesAt)} · Pacific Time
            </small></div>
          <div><span>PUBLISHED</span><strong>{dateTime(item.publishedAt)}</strong></div>
          <div><span>LOCATION</span><strong>{item.location}</strong></div>
        </div>
        <section className="drawer-section"><h3>Overview</h3><p>{item.description || 'No description was provided by the source.'}</p></section>
        <section className="drawer-section"><h3>Ownership & next steps</h3>
          <div className="workflow-grid">
            <div className="workflow-stage"><span>STAGE</span><StatusBadge value={item.status} /><small>Updated as you prepare and submit this bid</small></div>
            <label><span>PRIORITY</span><select value={priority}
              onChange={(event) => setPriority(event.target.value as Opportunity['priority'])}>
              <option>Low</option><option>Normal</option><option>High</option><option>Critical</option>
            </select></label>
            <label><span>OWNER</span><input value={ownerName} onChange={(event) => setOwnerName(event.target.value)}
              placeholder="BD owner or team" /></label>
            <label><span>NEXT ACTION DUE</span><input type="date" value={nextActionDueAt}
              onChange={(event) => setNextActionDueAt(event.target.value)} /></label>
          </div>
          <label className="workflow-action"><span>NEXT ACTION</span><textarea rows={3} value={nextAction}
            onChange={(event) => setNextAction(event.target.value)}
            placeholder="e.g. Confirm eligibility and schedule go/no-go review" /></label>
          <button className="button button-secondary" onClick={() => void onUpdate(item, {
            ownerName,
            priority,
            nextAction,
            nextActionDueAt: nextActionDueAt ? `${nextActionDueAt}T20:00:00.000Z` : ''
          }, 'BD workflow updated.')}>Save workflow</button>
        </section>
        <section className="drawer-section"><h3>Tags</h3><div className="tag-editor">
          {item.tags.map((value) => <span key={value}>{value}
            <button onClick={() => void onUpdate(item, { tags: item.tags.filter((current) => current !== value) })}>×</button>
          </span>)}
          <input placeholder="Add tag…" value={tag} onChange={(event) => setTag(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && tag.trim()) {
                void onUpdate(item, { tags: [...item.tags, tag.trim()] });
                setTag('');
              }
            }} />
        </div></section>
        <section className="drawer-section"><h3>Notes</h3>
          <textarea rows={5} placeholder="Capture fit, risks, questions, or next steps…" value={notes}
            onChange={(event) => setNotes(event.target.value)} />
          <button className="button button-secondary" onClick={() => void onUpdate(item, { notes }, 'Notes saved.')}>Save notes</button>
        </section>
        <section className="drawer-section"><h3>Documents</h3>
          {item.attachments.length
            ? item.attachments.map((attachment) => <a className="document-row" key={attachment.url}
              href={attachment.url} target="_blank" rel="noopener noreferrer" download>
              <Icon name="file" />
              <span>{attachment.name}</span>
              <span className="document-download">Open / download <Icon name="download" size={14} /></span>
            </a>)
            : <p className="muted">No downloadable documents were provided by the source.</p>}
        </section>
        <section className="drawer-danger">
          <button onClick={() => void onUpdate(item, { archived: true }, 'Opportunity archived.')}>
            <Icon name="database" />Archive
          </button>
          <button onClick={() => void onDelete(item)}><Icon name="trash" />Delete</button>
        </section>
      </div>
    </aside>
  </>;
}
