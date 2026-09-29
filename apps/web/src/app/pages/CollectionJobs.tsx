import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api';
import { Icon } from '../Icon';
import { dateTime } from '../format';
import { EmptyState } from '../EmptyState';
import { StatusBadge } from '../StatusBadge';
import type { CollectionJob } from '../types';

export function CollectionJobs() {
  const [jobs, setJobs] = useState<CollectionJob[]>([]);
  const [filter, setFilter] = useState('All runs');
  useEffect(() => {
    let active = true;
    const load = () => api.get<{ jobs: CollectionJob[] }>('/jobs').then(({ jobs: rows }) => { if (active) setJobs(rows); });
    void load();
    const timer = window.setInterval(() => { if (active) void load(); }, 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  const filtered = useMemo(() => jobs.filter((job) => filter === 'All runs' || job.status === filter), [jobs, filter]);
  const activeJobs = jobs.filter((job) => job.status === 'Running');
  const totals = jobs.reduce((sum, job) => ({
    found: sum.found + job.foundCount, created: sum.created + job.newCount,
    updated: sum.updated + job.updatedCount, duplicates: sum.duplicates + job.duplicateCount
  }), { found: 0, created: 0, updated: 0, duplicates: 0 });

  return <div className="page-stack">
    <section className="module-intro">
      <div><span className="eyebrow">SOURCE RUN LOG</span><h2>Collection activity</h2><p>See what each portal returned, what changed, and where a connector needs attention.</p></div>
      <Link className="button button-primary" to="/portal-controls?run=selected"><Icon name="refresh" />Choose sources to run</Link>
    </section>
    <section className="jobs-overview">
      <div className="card"><span>Total discovered</span><strong>{totals.found}</strong><small>Across recorded runs</small></div>
      <div className="card"><span>New records</span><strong>{totals.created}</strong><small>Added to opportunities</small></div>
      <div className="card"><span>Records updated</span><strong>{totals.updated}</strong><small>Existing data refreshed</small></div>
      <div className="card"><span>Duplicates handled</span><strong>{totals.duplicates}</strong><small>Updated, never copied</small></div>
    </section>
    {activeJobs.map((job) => <CollectionProgress key={job.id} job={job} />)}
    <section className="card jobs-card">
      <div className="card-header">
        <div><h3>Run history</h3><p>Most recent collection attempts first</p></div>
        <select value={filter} onChange={(event) => setFilter(event.target.value)}><option>All runs</option><option>Completed</option><option>Failed</option><option>Running</option></select>
      </div>
      {filtered.length === 0 ? <EmptyState title="No collection runs yet" message="Run Cal eProcure from Portal Controls to create the first job." />
        : <div className="table-scroll"><table className="jobs-table"><thead><tr><th>Source</th><th>Started</th><th>Status</th><th>Progress</th><th>Found</th><th>New</th><th>Updated</th><th>Duplicates</th><th>Notes</th></tr></thead>
          <tbody>{filtered.map((job) => <tr key={job.id}>
            <td><strong>{job.portalName}</strong><small>{job.id.slice(0, 8)}</small></td>
            <td><strong>{dateTime(job.startedAt)}</strong><small>{job.finishedAt ? `Finished ${dateTime(job.finishedAt)}` : 'In progress'}</small></td>
            <td><StatusBadge value={job.status} /></td><td><ProgressSummary job={job} compact /></td><td>{job.foundCount}</td><td className="number-positive">+{job.newCount}</td>
            <td>{job.updatedCount}</td><td>{job.duplicateCount}</td>
            <td>{job.errorMessage ? <span className="job-error"><Icon name="info" />{job.errorMessage}</span>
              : job.warnings.length ? <span className="job-warning"><Icon name="info" />{job.warnings[0]}</span>
                : <span className="muted">No issues</span>}</td>
          </tr>)}</tbody></table></div>}
    </section>
    <section className="card job-explainer">
      <div><span>1</span><strong>Fetch</strong><small>Respectful portal request and retry limits</small></div><Icon name="arrow" />
      <div><span>2</span><strong>Normalize</strong><small>Map source fields to one opportunity model</small></div><Icon name="arrow" />
      <div><span>3</span><strong>Qualify</strong><small>Coverage and technology relevance</small></div><Icon name="arrow" />
      <div><span>4</span><strong>Upsert</strong><small>Create new records or update duplicates</small></div>
    </section>
  </div>;
}

function progressPercent(job: CollectionJob) {
  if (!job.progressTotal) return job.status === 'Completed' ? 100 : 0;
  return Math.min(100, Math.round(job.progressCurrent / job.progressTotal * 100));
}

function ProgressSummary({ job, compact = false }: { job: CollectionJob; compact?: boolean }) {
  const percent = progressPercent(job);
  const hasKnownTotal = job.progressTotal > 0;
  const indeterminate = !hasKnownTotal && job.status === 'Running';
  return <div className={`collection-progress ${compact ? 'compact' : ''}`}>
    <div><strong>{job.progressStage || 'Queued'}</strong>{hasKnownTotal && <small>{job.progressCurrent} of {job.progressTotal} · {percent}%</small>}</div>
    <div className={`collection-progress-track ${indeterminate ? 'indeterminate' : ''}`} aria-label={`${job.progressStage}: ${hasKnownTotal ? `${percent}%` : indeterminate ? 'in progress' : 'complete'}`}>
      <i style={indeterminate ? undefined : { width: `${percent}%` }} />
    </div>
  </div>;
}

function CollectionProgress({ job }: { job: CollectionJob }) {
  return <section className="card active-collection">
    <div><span className="eyebrow">INTELLIGENCE COLLECTION IN PROGRESS</span><h3>{job.portalName}</h3><p>Live updates refresh every second. You can leave this page while the run continues.</p></div>
    <ProgressSummary job={job} />
  </section>;
}
