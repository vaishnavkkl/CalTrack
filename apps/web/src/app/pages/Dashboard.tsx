import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api';
import { Icon } from '../Icon';
import { date, dateTime, deadlineLabel, daysUntil, displayOpportunityTitle } from '../format';
import { StatusBadge } from '../StatusBadge';
import { useAuth } from '../AuthContext';
import type { CollectionJob, Opportunity } from '../types';

interface DashboardData {
  stats: { total: number; new_count: number; saved_count: number; high_match_count: number; due_soon_count: number; pending_decisions?: number; open_sourcing?: number; ready_for_review?: number };
  recent: Opportunity[];
  upcoming: Opportunity[];
  portalErrors: number;
  lastJob?: CollectionJob;
}

const defaultData: DashboardData = {
  stats: { total: 0, new_count: 0, saved_count: 0, high_match_count: 0, due_soon_count: 0 },
  recent: [], upcoming: [], portalErrors: 0
};

export function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(defaultData);
  const [loading, setLoading] = useState(true);
  const load = () => api.get<DashboardData>('/dashboard').then(setData).finally(() => setLoading(false));

  useEffect(() => { void load(); }, []);

  if (user?.role === 'sourcing_user') {
    return <div className="page-stack">
      <section className="welcome-strip">
        <div><span className="eyebrow">SOURCING BRIEFING</span><h2><span>{data.stats.total}</span> approved RFO briefs are open.</h2>
          <p>You have need-to-know access to required roles and qualifications. Source documents and buyer links stay restricted.</p></div>
        <Link className="button button-primary" to="/talent-sourcing"><Icon name="users" />Open sourcing workspace</Link>
      </section>
      <section className="stats-grid">
        <StatCard label="Open sourcing briefs" value={data.stats.total} detail="Approved by Bid manager" icon="opportunities" tone="violet" loading={loading} />
        <StatCard label="High-priority briefs" value={data.stats.high_match_count} detail="90% company fit or higher" icon="trend" tone="green" loading={loading} />
        <StatCard label="Due in 14 days" value={data.stats.due_soon_count} detail="Candidate deadlines need attention" icon="clock" tone="orange" loading={loading} />
        <StatCard label="Access scope" value={data.stats.total} detail="Documents and links restricted" icon="shield" tone="blue" loading={loading} />
      </section>
      <section className="card dashboard-opportunities">
        <div className="card-header"><div><h3>Approved sourcing briefs</h3><p>Public RFO context shared by Bid manager</p></div>
          <Link className="text-link" to="/talent-sourcing">View qualifications <Icon name="arrow" size={15} /></Link></div>
        <div className="opportunity-list">{data.recent.map((item) => <Link to="/talent-sourcing" className="opportunity-row" key={item.id}>
          <div className="opportunity-score"><strong>{item.relevanceScore}</strong><span>FIT</span></div>
          <div className="opportunity-main"><div><span className="type-pill">{item.solicitationType}</span></div><h4>{displayOpportunityTitle(item.title, item.description)}</h4><p>{item.agency}</p></div>
          <div className="opportunity-meta"><StatusBadge value="Sourcing open" /><strong>{deadlineLabel(item.closesAt)}</strong><span>{date(item.closesAt)}</span></div><Icon name="arrow" className="row-arrow" />
        </Link>)}</div>
      </section>
    </div>;
  }

  return (
    <div className="page-stack">
      <section className="welcome-strip">
        <div>
          <span className="eyebrow">BID OPERATIONS BRIEFING</span>
          <h2><span>{data.stats.pending_decisions || 0} RFOs</span> need a go/no-go decision.</h2>
          <p>{data.stats.ready_for_review || 0} responses are ready for final review and {data.stats.open_sourcing || 0} approved briefs are open for candidate sourcing.</p>
        </div>
        <Link className="button button-primary" to="/bid-decisions">
          <Icon name="shield" />Open decision queue
        </Link>
      </section>

      <section className="stats-grid">
        <StatCard label="Selected RFOs" value={data.stats.total} detail="In Bid preparation" icon="opportunities" tone="blue" loading={loading} />
        <StatCard label="Not reviewed" value={data.stats.new_count} detail="Waiting for Bid manager" icon="trend" tone="violet" loading={loading} />
        <StatCard label="High-match RFOs" value={data.stats.high_match_count} detail="90% relevance or higher" icon="check" tone="green" loading={loading} />
        <StatCard label="Due in 14 days" value={data.stats.due_soon_count} detail="Selected RFO deadlines" icon="clock" tone="orange" loading={loading} />
      </section>

      <section className="dashboard-grid">
        <div className="card dashboard-opportunities">
          <div className="card-header">
            <div><h3>Bid preparation queue</h3><p>Only RFOs you selected for review</p></div>
            <Link className="text-link" to="/bid-decisions">Open queue <Icon name="arrow" size={15} /></Link>
          </div>
          <div className="opportunity-list">
            {data.recent.slice(0, 4).map((item) => (
              <Link to={`/bid-decisions?rfo=${encodeURIComponent(item.id)}`} className="opportunity-row" key={item.id}>
                <div className="opportunity-score"><strong>{item.relevanceScore}</strong><span>MATCH</span></div>
                <div className="opportunity-main">
                  <div><span className="type-pill">{item.solicitationType}</span><span className="source-label">{item.sourcePortal}</span></div>
                  <h4>{displayOpportunityTitle(item.title, item.description)}</h4>
                  <p>{item.agency}</p>
                </div>
                <div className="opportunity-meta">
                  <StatusBadge value={item.status} />
                  <strong className={(daysUntil(item.closesAt) || 99) <= 7 ? 'deadline-urgent' : ''}>{deadlineLabel(item.closesAt)}</strong>
                  <span>{date(item.closesAt)}</span>
                </div>
                <Icon name="arrow" className="row-arrow" />
              </Link>
            ))}
          </div>
        </div>

        <div className="card deadline-card">
          <div className="card-header">
            <div><h3>Deadline radar</h3><p>Next 30 days</p></div>
            <span className="live-chip"><i /> LIVE</span>
          </div>
          <div className="deadline-list">
            {data.upcoming.map((item) => {
              const remaining = daysUntil(item.closesAt) || 0;
              return <div className="deadline-item" key={item.id}>
                <div className={`date-tile ${remaining <= 7 ? 'date-tile-urgent' : ''}`}>
                  <strong>{date(item.closesAt, { day: '2-digit' })}</strong>
                  <span>{date(item.closesAt, { month: 'short' }).toUpperCase()}</span>
                </div>
                <div><h4>{displayOpportunityTitle(item.title, item.description)}</h4><p>{item.agency}</p></div>
                <span className={remaining <= 7 ? 'deadline-urgent' : ''}>{deadlineLabel(item.closesAt)}</span>
              </div>;
            })}
          </div>
          <Link className="button button-subtle button-full" to="/bid-decisions">Open Bid preparation <Icon name="arrow" /></Link>
        </div>
      </section>

      <section className="dashboard-bottom">
        <div className="card collection-health">
          <div className="card-header">
            <div><h3>Collection health</h3><p>Source and database status</p></div>
            <span className={`health-badge ${data.portalErrors ? 'health-error' : ''}`}><i />{data.portalErrors ? 'Needs attention' : 'All systems healthy'}</span>
          </div>
          <div className="health-grid">
            <div><span className="health-icon"><Icon name="portal" /></span><div><strong>Source connectors</strong><small>Portal collection</small></div>
              <span className={`status-badge ${data.portalErrors ? 'status-error' : 'status-healthy'}`}><i />{data.portalErrors ? `${data.portalErrors} error${data.portalErrors === 1 ? '' : 's'}` : 'Ready'}</span></div>
            <div><span className="health-icon"><Icon name="database" /></span><div><strong>Local database</strong><small>SQLite · persistent</small></div><span className="status-badge status-healthy"><i />Connected</span></div>
            <div><span className="health-icon"><Icon name="jobs" /></span><div><strong>Last collection</strong><small>{data.lastJob ? dateTime(data.lastJob.finishedAt || data.lastJob.startedAt) : 'No runs yet'}</small></div>
              <span className="status-badge status-completed"><i />{data.lastJob?.status || 'Ready'}</span></div>
          </div>
        </div>
        <div className="card quick-insight">
          <span className="insight-icon"><Icon name="trend" size={22} /></span>
          <div><span className="eyebrow">REVIEW QUEUE</span><h3>{data.stats.high_match_count} high-match RFOs are selected.</h3>
            <p>Add or prioritize more RFOs from Opportunities when needed.</p></div>
          <Link to="/opportunities"><Icon name="arrow" /></Link>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, detail, icon, tone, loading }: {
  label: string; value: number; detail: string; icon: string; tone: string; loading: boolean
}) {
  return <div className="card stat-card">
    <div className={`stat-icon stat-${tone}`}><Icon name={icon} /></div>
    <div><span>{label}</span><strong>{loading ? '—' : value}</strong><small>{detail}</small></div>
    <Icon name="arrow" className="stat-arrow" />
  </div>;
}
