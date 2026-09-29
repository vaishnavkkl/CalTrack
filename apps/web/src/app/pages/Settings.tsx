import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { Icon } from '../Icon';
import { useToast } from '../ToastContext';
import type { Settings as SettingsType } from '../types';

const defaults: SettingsType = {
  includedKeywords: [], excludedKeywords: [], preferredAgencies: [],
  collectionFrequency: 'daily', emailDigest: false, deadlineAlerts: true
};

export function Settings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState(defaults);
  const [savedSettings, setSavedSettings] = useState(defaults);
  const [email, setEmail] = useState('');
  const [tab, setTab] = useState('Relevance');
  const [saving, setSaving] = useState(false);
  const [clearConfirmation, setClearConfirmation] = useState('');
  const [clearing, setClearing] = useState(false);
  const [storageVersion, setStorageVersion] = useState(0);
  const notify = useToast();
  useEffect(() => {
    void api.get<{ settings: SettingsType; account: { email: string } }>('/settings')
      .then((result) => {
        setSettings(result.settings);
        setSavedSettings(result.settings);
        setEmail(result.account.email);
      });
  }, []);
  const save = async () => {
    setSaving(true);
    try {
      const result = await api.put<{ settings: SettingsType }>('/settings', settings);
      setSettings(result.settings);
      setSavedSettings(result.settings);
      notify('Settings saved.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not save settings.', 'error'); }
    finally { setSaving(false); }
  };
  const update = <K extends keyof SettingsType>(key: K, value: SettingsType[K]) => setSettings((current) => ({ ...current, [key]: value }));
  const clearRfoData = async () => {
    if (clearConfirmation !== 'CLEAR ALL RFO DATA') return;
    if (!window.confirm('Clear all RFOs, workflows, candidates, response files, and collection history? Users and every Source Registry portal will be preserved.')) return;
    setClearing(true);
    try {
      const result = await api.post<{
        cleared: { opportunities: number; workflows: number; candidates: number; responseFiles: number; collectionJobs: number };
        preserved: { users: number; portals: number; settings: number };
      }>('/settings/clear-rfo-data', { confirmation: clearConfirmation });
      setClearConfirmation('');
      setStorageVersion((value) => value + 1);
      notify(`RFO data cleared. Preserved ${result.preserved.users} users and ${result.preserved.portals} Source Registry portals.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not clear RFO data.', 'error');
    } finally { setClearing(false); }
  };

  const tabs = ['Relevance', 'Collection schedule', 'Notifications', 'Account', 'Backup & export'];
  if (user?.role === 'super_admin') tabs.push('Data management');

  return <div className="settings-layout">
    <aside className="settings-nav">
      {tabs.map((item) =>
        <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}><Icon name={({ Relevance: 'target', 'Collection schedule': 'calendar', Notifications: 'bell', Account: 'users', 'Backup & export': 'database', 'Data management': 'settings' } as Record<string, string>)[item]} size={16} />{item}</button>)}
    </aside>
    <div className="settings-content">
      {tab === 'Relevance' && <>
        <SettingsHeader title="Relevance preferences" description="Control how CalTrack scores and prioritizes opportunities." />
        <section className="card settings-section">
          <div className="setting-title"><div><h3>Included keywords</h3><p>Terms that increase an opportunity’s relevance score.</p></div><span className="setting-count">{settings.includedKeywords.length} terms</span></div>
          <TagInput values={settings.includedKeywords} onChange={(values) => update('includedKeywords', values)} placeholder="Add included keyword" tone="positive" />
        </section>
        <section className="card settings-section">
          <div className="setting-title"><div><h3>Excluded keywords</h3><p>Non-IT terms that remove or lower a result.</p></div><span className="setting-count">{settings.excludedKeywords.length} terms</span></div>
          <TagInput values={settings.excludedKeywords} onChange={(values) => update('excludedKeywords', values)} placeholder="Add excluded keyword" tone="negative" />
          <div className="inline-notice"><Icon name="shield" /><p><strong>Hardware procurement is always excluded.</strong> This protection applies even when a hardware term overlaps an included keyword.</p></div>
        </section>
        <section className="card settings-section">
          <div className="setting-title"><div><h3>Preferred agencies</h3><p>Give priority to organizations you already know or want to pursue.</p></div></div>
          <TagInput values={settings.preferredAgencies} onChange={(values) => update('preferredAgencies', values)} placeholder="Add preferred agency" />
        </section>
      </>}
      {tab === 'Collection schedule' && <>
        <SettingsHeader title="Collection schedule" description="Choose when scheduled source collection runs. Manual collection is always available." />
        <section className="card settings-section">
          <label className="setting-row"><span><strong>Collection frequency</strong><small>Applies to enabled automated connectors</small></span>
            <select value={settings.collectionFrequency} onChange={(event) => update('collectionFrequency', event.target.value)}><option value="manual">Manual only</option><option value="daily">Daily</option><option value="twice-daily">Twice daily</option><option value="weekly">Weekly</option></select></label>
          <div className="inline-notice"><Icon name="info" /><p>For always-on scheduling, run the API with your host’s cron service and call the Portal Controls collection endpoint.</p></div>
        </section>
      </>}
      {tab === 'Notifications' && <>
        <SettingsHeader title="Notifications" description="Decide which changes deserve your attention." />
        <section className="card settings-section">
          <Toggle label="Deadline alerts" description="Surface opportunities closing within 14 days." checked={settings.deadlineAlerts} onChange={(value) => update('deadlineAlerts', value)} />
          <Toggle label="Email digest" description="Prepare a daily summary when email delivery is configured." checked={settings.emailDigest} onChange={(value) => update('emailDigest', value)} />
        </section>
      </>}
      {tab === 'Account' && <>
        <SettingsHeader title="Account" description="Manage the credentials used to access this workspace." />
        <section className="card settings-section">
          <label>Login email<input value={email} disabled /></label>
          <div className="inline-notice"><Icon name="shield" /><p>Credentials are configured through environment variables and protected with secure password hashing and session cookies.</p></div>
        </section>
      </>}
      {tab === 'Backup & export' && <>
        <SettingsHeader title="Backup & export" description="Keep a portable copy of your procurement workspace." />
        <section className="card backup-grid">
          <div><span><Icon name="database" /></span><h3>Database backup</h3><p>Copy the SQLite file while the API is stopped to preserve opportunities, notes, tags, and portal history.</p><code>data/caltrack.db</code></div>
          <div><span><Icon name="download" /></span><h3>Opportunity export</h3><p>Export all filtered records or selected records directly from Opportunities.</p><Link className="button button-secondary" to="/opportunities">Open opportunities</Link></div>
        </section>
      </>}
      {tab === 'Data management' && user?.role === 'super_admin' && <>
        <SettingsHeader title="RFO data management" description="Reset operational RFO data without changing access or source configuration." />
        <AttachmentManager key={storageVersion} />
        <section className="card settings-section danger-zone">
          <div className="setting-title"><div><h3>Clear all RFO data</h3><p>Deletes opportunities, Bid preparation workflows, candidates and resumes, response packages, stored response files, and collection history.</p></div><span className="danger-label">BID MANAGER ONLY</span></div>
          <div className="inline-notice"><Icon name="shield" /><p><strong>Source Registry is preserved.</strong> This action never deletes or changes users, portal records, connector settings, schedules, or application settings.</p></div>
          <label><span>TYPE CLEAR ALL RFO DATA TO CONFIRM</span><input value={clearConfirmation}
            onChange={(event) => setClearConfirmation(event.target.value)} placeholder="CLEAR ALL RFO DATA" /></label>
          <button className="button button-danger" disabled={clearing || clearConfirmation !== 'CLEAR ALL RFO DATA'} onClick={() => void clearRfoData()}>
            <Icon name="trash" />{clearing ? 'Clearing RFO data...' : 'Clear all RFO data'}
          </button>
        </section>
      </>}
      {!['Account', 'Backup & export', 'Data management'].includes(tab) && <div className="settings-actions"><button className="button button-secondary" onClick={() => setSettings(savedSettings)}>Discard changes</button>
        <button className="button button-primary" onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></div>}
    </div>
  </div>;
}

function SettingsHeader({ title, description }: { title: string; description: string }) {
  return <header className="settings-header"><h2>{title}</h2><p>{description}</p></header>;
}

type StoredAttachment = { id: string; fileName: string; sizeBytes: number; createdAt: string; context: string; kind: 'resume' | 'response' };
function AttachmentManager() {
  const [files, setFiles] = useState<StoredAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('all');
  const [removing, setRemoving] = useState('');
  const notify = useToast();
  const load = async () => {
    setLoading(true); setError('');
    try { setFiles((await api.get<{ files: StoredAttachment[] }>('/settings/attachments')).files); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load attachments.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const endpoint = (file: StoredAttachment) => file.kind === 'resume' ? `/candidates/${file.id}/resume` : `/response-files/${file.id}`;
  const remove = async (file: StoredAttachment) => {
    if (!window.confirm(`Permanently delete “${file.fileName}”? This cannot be undone. The ${file.kind === 'resume' ? 'candidate profile' : 'bid and checklist'} will be kept.`)) return;
    const key = `${file.kind}:${file.id}`; setRemoving(key);
    try { await api.delete(endpoint(file)); setFiles((all) => all.filter((item) => `${item.kind}:${item.id}` !== key)); notify('Attachment deleted and storage freed.'); }
    catch (cause) { notify(cause instanceof Error ? cause.message : 'Could not delete attachment.', 'error'); }
    finally { setRemoving(''); }
  };
  const visible = files.filter((file) => (kind === 'all' || file.kind === kind) && `${file.fileName} ${file.context}`.toLowerCase().includes(search.toLowerCase()));
  const size = (bytes: number) => bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return <section className="card settings-section attachment-manager">
    <div className="setting-title"><div><h3>Manage attachments</h3><p>Remove unwanted uploads without deleting your bids or candidate profiles. Source-website document links do not use upload storage.</p></div></div>
    <div className="attachment-toolbar"><label><span>Search files or candidates</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="File name, RFO, or candidate" /></label>
      <label><span>File type</span><select value={kind} onChange={(event) => setKind(event.target.value)}><option value="all">All uploads</option><option value="response">Response files</option><option value="resume">Resumes</option></select></label>
      <button className="button button-secondary" disabled={loading || !!removing} onClick={() => void load()}>Refresh</button></div>
    <p role="status">{loading ? 'Loading attachments…' : `${files.length} uploads · ${size(files.reduce((sum, file) => sum + file.sizeBytes, 0))} stored`}</p>
    {error && <p className="save-error" role="alert">{error}</p>}
    {!loading && !error && <div className="attachment-list">{visible.length ? visible.map((file) => <article key={`${file.kind}:${file.id}`}>
      <Icon name="file" size={19} /><div><strong>{file.fileName}</strong><p>{file.kind === 'resume' ? 'Resume' : 'Response file'} · {size(file.sizeBytes)}</p><small>{file.context}</small></div>
      <div className="attachment-actions"><a className="button button-subtle" download href={`/api${endpoint(file)}${file.kind === 'response' ? '/download' : ''}`}><Icon name="download" size={15} />Download</a>
        <button className="button button-subtle" disabled={!!removing} onClick={() => void remove(file)}><Icon name="trash" size={15} />{removing === `${file.kind}:${file.id}` ? 'Deleting…' : 'Delete'}</button></div>
    </article>) : <p>{files.length ? 'No files match your search.' : 'No uploaded files. Your storage is clear.'}</p>}</div>}
  </section>;
}

function TagInput({ values, onChange, placeholder, tone = '' }: { values: string[]; onChange: (values: string[]) => void; placeholder: string; tone?: string }) {
  const [input, setInput] = useState('');
  const add = () => {
    const value = input.trim();
    if (value && !values.includes(value)) onChange([...values, value]);
    setInput('');
  };
  return <div className={`settings-tags tags-${tone}`}>{values.map((value) => <span key={value}>{value}<button onClick={() => onChange(values.filter((item) => item !== value))}>×</button></span>)}
    <input value={input} placeholder={placeholder} onChange={(event) => setInput(event.target.value)}
      onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add(); } }} />
    <button className="button button-subtle" onClick={add}><Icon name="plus" />Add</button></div>;
}

function Toggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="setting-row"><span><strong>{label}</strong><small>{description}</small></span>
    <span className="switch"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span /></span></label>;
}
