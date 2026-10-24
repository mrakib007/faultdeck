import { useMemo, useRef, useState } from 'react';
import {
  Activity, ArrowDownRight, ArrowUpRight, ArrowUpRightFromSquare, Braces,
  Check, ChevronDown, ChevronRight, CircleDot, Clock3, Copy, Inbox,
  Layers3, Search, Server, Terminal,
} from 'lucide-react';
import { incidents, type Incident, type Status } from './data';

type DetailTab = 'attempts' | 'context';
type View = 'overview' | 'integration';
type Filter = 'all' | Status;

const filters: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All failures' },
  { value: 'open', label: 'Open' },
  { value: 'retrying', label: 'Retrying' },
  { value: 'resolved', label: 'Resolved' },
];

function StatusTag({ status }: { status: Status }) {
  return <span className={`status-tag status-${status}`}><span className="status-dot" />{status}</span>;
}

function Metric({ label, value, footnote, icon, tone }: {
  label: string; value: number | string; footnote: string;
  icon: React.ReactNode; tone?: string;
}) {
  return (
    <div className="metric">
      <div className="metric-top"><span>{label}</span><span className="metric-icon">{icon}</span></div>
      <div className={`metric-value ${tone ?? ''}`}>{value}</div>
      <div className="metric-footnote">{footnote}</div>
    </div>
  );
}

function Detail({ incident }: { incident: Incident }) {
  const [tab, setTab] = useState<DetailTab>('attempts');
  const [copied, setCopied] = useState(false);

  async function copyId() {
    try {
      await navigator.clipboard.writeText(incident.jobId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="detail-panel" aria-label="Failure details">
      <div className="panel-heading">
        <span className="eyebrow">INSPECTOR <span className="eyebrow-divider">/</span> {incident.id}</span>
        <span className="panel-index">01 — 02</span>
      </div>
      <div className="detail-body" key={incident.id}>
        <div className="detail-title-row"><span className="detail-alert"><Activity size={20} strokeWidth={1.8} /></span><StatusTag status={incident.status} /></div>
        <h2>{incident.title}</h2>
        <p className="detail-subtitle">First seen {incident.firstSeen} · Last seen {incident.lastSeen}</p>

        <div className="detail-fields">
          <div><span className="field-label">SERVICE</span><span className="field-value"><Server size={14} />{incident.service}</span></div>
          <div><span className="field-label">QUEUE</span><span className="field-value"><Layers3 size={14} />{incident.queue}</span></div>
          <div className="field-wide"><span className="field-label">LATEST JOB ID</span><button className="copy-field" onClick={copyId} title="Copy job ID"><code>{incident.jobId}</code>{copied ? <Check size={14} /> : <Copy size={14} />}</button></div>
        </div>

        <div className="section-label"><span>LAST ERROR</span><span className="section-line" /></div>
        <div className="error-box"><span className="error-caret">›</span><code>{incident.error}</code></div>

        <div className="tab-list" role="tablist" aria-label="Failure details">
          <button role="tab" aria-selected={tab === 'attempts'} className={tab === 'attempts' ? 'active' : ''} onClick={() => setTab('attempts')}>Attempt history <span>{incident.attempts.length}</span></button>
          <button role="tab" aria-selected={tab === 'context'} className={tab === 'context' ? 'active' : ''} onClick={() => setTab('context')}>Context</button>
        </div>

        {tab === 'attempts' ? (
          <div className="timeline" role="tabpanel">
            {incident.attempts.map((attempt) => (
              <div className="timeline-item" key={attempt.number}>
                <div className={`timeline-node ${attempt.outcome}`}><CircleDot size={12} /></div>
                <div className="timeline-content"><div className="timeline-top"><strong>{attempt.result}</strong><time>{attempt.time}</time></div><p>Attempt {attempt.number} <span className="timeline-separator">/</span> {attempt.detail}</p></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="context-panel" role="tabpanel">
            <div className="context-title"><Braces size={15} /> Allowlisted event metadata</div>
            <pre>{JSON.stringify(incident.metadata, null, 2)}</pre>
            <p>Full job payloads are not stored in this demo.</p>
          </div>
        )}
      </div>
      <div className="panel-footer"><span className="footer-pulse" /> DEMO DATA <span className="footer-spacer" /> NO LIVE BROKER CONNECTED</div>
    </section>
  );
}

function Integration() {
  const example = `{
  "version": 1,
  "event_id": "evt_unique_id",
  "service": "mailer",
  "queue": "email.delivery",
  "job_id": "job_123",
  "attempt": 1,
  "error": "Connection refused"
}`;
  return (
    <section className="integration-panel">
      <span className="eyebrow">INTEGRATION <span className="eyebrow-divider">/</span> 01</span>
      <div className="integration-icon"><Braces size={23} /></div>
      <h2>Bring your failures<br />into focus.</h2>
      <p>FaultDeck will accept opt-in failure events from your workers through a dedicated RabbitMQ monitoring exchange. It will not consume your application queues.</p>
      <div className="section-label"><span>EVENT SHAPE · PREVIEW</span><span className="section-line" /></div>
      <pre className="integration-code">{example}</pre>
      <div className="integration-note"><CircleDot size={15} /> Integration is planned. The dashboard currently shows local demo events.</div>
    </section>
  );
}

function App() {
  const [selectedId, setSelectedId] = useState(incidents[0].id);
  const [filter, setFilter] = useState<Filter>('all');
  const [service, setService] = useState('all');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<View>('overview');
  const searchRef = useRef<HTMLInputElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  const services = useMemo(() => ['all', ...new Set(incidents.map((incident) => incident.service))], []);
  const visible = incidents.filter((incident) => {
    const query = search.trim().toLowerCase();
    return (filter === 'all' || incident.status === filter)
      && (service === 'all' || incident.service === service)
      && (!query || [incident.title, incident.id, incident.service, incident.queue, incident.jobId].some((field) => field.toLowerCase().includes(query)));
  });
  const selected = visible.find((incident) => incident.id === selectedId) ?? visible[0];
  const openCount = incidents.filter((incident) => incident.status === 'open').length;
  const retryCount = incidents.filter((incident) => incident.status === 'retrying').length;
  const resolvedCount = incidents.filter((incident) => incident.status === 'resolved').length;

  function showFeed() {
    setView('overview');
    window.setTimeout(() => feedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><Activity size={20} strokeWidth={2.5} /></div><span>fault<span className="brand-accent">deck</span><span className="brand-period">.</span></span></div>
        <div className="workspace-switch"><span className="workspace-avatar">F</span><span className="workspace-text"><strong>Local workspace</strong><small>development</small></span><ChevronDown size={14} /></div>
        <nav aria-label="Main navigation">
          <span className="nav-label">WORKSPACE</span>
          <button className={`nav-item ${view === 'overview' ? 'selected' : ''}`} onClick={() => { setView('overview'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><Activity size={17} /> Overview <span className="nav-shortcut">01</span></button>
          <button className="nav-item" onClick={showFeed}><Inbox size={17} /> Failure feed <span className="nav-count">{incidents.length}</span></button>
          <span className="nav-label nav-label-second">SYSTEM</span>
          <button className={`nav-item ${view === 'integration' ? 'selected' : ''}`} onClick={() => setView('integration')}><Braces size={17} /> Integration <ChevronRight className="nav-trail" size={15} /></button>
        </nav>
        <div className="sidebar-bottom"><div className="environment-card"><div className="env-heading"><span className="env-dot" /> ENVIRONMENT <span className="env-label">LOCAL</span></div><div className="env-row"><span>RabbitMQ</span><span className="env-state">Not connected</span></div><div className="env-row"><span>Collector</span><span className="env-state">Not connected</span></div></div><div className="sidebar-version"><Terminal size={14} /> faultdeck / preview <span>v0.1</span></div></div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div className="breadcrumbs"><span>WORKSPACE</span><ChevronRight size={13} /><strong>{view === 'overview' ? 'Overview' : 'Integration'}</strong></div><div className="topbar-right"><span className="demo-indicator"><span /> DEMO MODE</span><span className="topbar-divider" /><span className="topbar-date">24 OCT 2026</span><span className="user-avatar">FD</span></div></header>

        {view === 'integration' ? <div className="page-content integration-page"><div className="page-intro"><div className="page-kicker"><span className="kicker-square" /> GETTING STARTED <span className="kicker-line" /> 01 / 01</div><h1>Connect a worker<span className="heading-period">.</span></h1><p>One event contract. A clearer picture of every failure.</p></div><Integration /></div> : (
          <div className="page-content">
            <div className="page-intro"><div className="page-kicker"><span className="kicker-square" /> OBSERVABILITY <span className="kicker-line" /> OVERVIEW</div><div className="page-title-row"><div><h1>Failure overview<span className="heading-period">.</span></h1><p>A clearer view of what broke, when, and why.</p></div><div className="snapshot-label"><Clock3 size={15} /><span>STATIC SNAPSHOT<br /><strong>24 OCT · 11:45 UTC</strong></span></div></div></div>

            <div className="metrics-grid"><Metric label="TOTAL GROUPS" value={incidents.length.toString().padStart(2, '0')} footnote="In this demo snapshot" icon={<Layers3 size={17} />} /><Metric label="OPEN" value={openCount.toString().padStart(2, '0')} footnote="Needs investigation" icon={<ArrowUpRight size={17} />} tone="text-red" /><Metric label="RETRYING" value={retryCount.toString().padStart(2, '0')} footnote="Waiting for next attempt" icon={<Activity size={17} />} tone="text-amber" /><Metric label="RESOLVED" value={resolvedCount.toString().padStart(2, '0')} footnote="Recovered in snapshot" icon={<ArrowDownRight size={17} />} tone="text-green" /></div>

            <div className="section-heading" ref={feedRef}><div><div className="page-kicker section-kicker"><span className="kicker-square" /> LIVE SURFACE <span className="kicker-line" /> 01</div><h2>Failure feed <span className="heading-count">/ {incidents.length.toString().padStart(2, '0')}</span></h2></div><div className="feed-hint"><span className="hint-key">↵</span> Select an event to inspect</div></div>

            <div className="workspace-grid">
              <section className="feed-panel" aria-label="Failure feed">
                <div className="feed-toolbar"><div className="search-box"><Search size={16} /><input ref={searchRef} type="search" placeholder="Search failures, queues, IDs..." value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search failures" /><button onClick={() => searchRef.current?.focus()} aria-label="Focus search" className="search-shortcut">/</button></div><label className="service-filter"><span className="sr-only">Filter by service</span><select value={service} onChange={(event) => setService(event.target.value)}><option value="all">All services</option>{services.slice(1).map((name) => <option key={name} value={name}>{name}</option>)}</select><ChevronDown size={14} /></label></div>
                <div className="filter-bar" role="group" aria-label="Filter by status">{filters.map((item) => <button key={item.value} className={filter === item.value ? 'filter-active' : ''} onClick={() => setFilter(item.value)}>{item.label}{item.value === 'all' && <span>{incidents.length}</span>}</button>)}</div>
                <div className="list-header"><span>FAILURE / SERVICE</span><span>STATUS</span><span>LAST SEEN</span></div>
                <div className="failure-list">{visible.length ? visible.map((incident) => <button key={incident.id} className={`failure-row ${selected.id === incident.id ? 'row-selected' : ''}`} onClick={() => { setSelectedId(incident.id); setView('overview'); }} aria-pressed={selected.id === incident.id}><div className="row-main"><div className="row-icon"><Activity size={16} strokeWidth={1.8} /></div><div className="row-text"><strong>{incident.title}</strong><span><code>{incident.id}</code><i />{incident.service} <span className="row-slash">/</span> {incident.queue}</span></div></div><div className="row-status"><StatusTag status={incident.status} /></div><div className="row-end"><time>{incident.lastSeen}</time><span>{incident.count} events</span></div><ChevronRight className="row-chevron" size={15} /></button>) : <div className="empty-state"><Search size={22} /><strong>No matching failures</strong><span>Try another search term or change the filters.</span><button onClick={() => { setSearch(''); setFilter('all'); setService('all'); }}>Clear filters</button></div>}</div>
                <div className="feed-footer"><span>SHOWING {visible.length} OF {incidents.length} GROUPS</span><span>LOCAL DATASET <ArrowUpRightFromSquare size={13} /></span></div>
              </section>
              {selected ? <Detail incident={selected} /> : <div className="detail-panel detail-empty">No failure selected.</div>}
            </div>
            <footer className="page-footer"><span>FAULTDECK <span className="footer-divider">/</span> A BETTER VIEW OF FAILURE</span><span>BUILT FOR THE MOMENTS THAT MATTER <span className="footer-star">✳</span></span></footer>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
