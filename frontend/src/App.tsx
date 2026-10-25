import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity, Braces, Check, ChevronDown, ChevronRight, CircleDot, Clock3,
  Copy, Inbox, Layers3, RefreshCw, Search, Server, Terminal,
} from 'lucide-react';
import { jobAttempts, listFailures, type Failure } from './api';

type View = 'overview' | 'integration';

function timeLabel(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value)) + ' UTC';
}

function Metric({ label, value, footnote, icon }: {
  label: string; value: number | string; footnote: string; icon: React.ReactNode;
}) {
  return (
    <div className="metric">
      <div className="metric-top"><span>{label}</span><span className="metric-icon">{icon}</span></div>
      <div className="metric-value">{value}</div>
      <div className="metric-footnote">{footnote}</div>
    </div>
  );
}

function Detail({ failure }: { failure: Failure }) {
  const [copied, setCopied] = useState(false);
  const { data: attempts, isPending, isError, error, isFetching, refetch } = useQuery({
    queryKey: ['job-attempts', failure.job_id],
    queryFn: ({ signal }) => jobAttempts(failure.job_id, signal),
    refetchInterval: 30_000,
  });

  async function copyId() {
    try {
      await navigator.clipboard.writeText(failure.job_id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="detail-panel" aria-label="Failure details">
      <div className="panel-heading">
        <span className="eyebrow">INSPECTOR <span className="eyebrow-divider">/</span> FAILED ATTEMPT</span>
        <span className="panel-index">{failure.event_id.slice(0, 8)}</span>
      </div>
      <div className="detail-body" key={failure.event_id}>
        <div className="detail-title-row"><span className="detail-alert"><Activity size={20} strokeWidth={1.8} /></span><span className="attempt-badge">Attempt {failure.attempt} failed</span></div>
        <h2>{failure.error.category}</h2>
        <p className="detail-subtitle">Occurred {timeLabel(failure.occurred_at)}</p>

        <div className="detail-fields">
          <div><span className="field-label">SERVICE</span><span className="field-value"><Server size={14} />{failure.service}</span></div>
          <div><span className="field-label">JOB QUEUE</span><span className="field-value"><Layers3 size={14} />{failure.queue}</span></div>
          <div className="field-wide"><span className="field-label">JOB ID</span><button className="copy-field" onClick={copyId} title="Copy job ID"><code>{failure.job_id}</code>{copied ? <Check size={14} /> : <Copy size={14} />}</button></div>
        </div>

        <div className="section-label"><span>ERROR MESSAGE</span><span className="section-line" /></div>
        <div className="error-box"><span className="error-caret">›</span><code>{failure.error.message}</code></div>

        <div className="section-label"><span>FAILED ATTEMPTS FOR THIS JOB</span><span className="section-line" /></div>
        {isPending && !isError && <div className="inline-state" role="status">Loading attempt history…</div>}
        {isError && <div className="inline-state state-error" role="alert">{error.message} <button onClick={() => void refetch()}>Retry</button></div>}
        {attempts && <div className="timeline" aria-label="Failed attempt history">
          {attempts.map((attempt) => (
            <div className="timeline-item" key={attempt.event_id}>
              <div className="timeline-node failed"><CircleDot size={12} /></div>
              <div className="timeline-content"><div className="timeline-top"><strong>{attempt.error.category}</strong><time>{timeLabel(attempt.occurred_at)}</time></div><p>Attempt {attempt.attempt} <span className="timeline-separator">/</span> {attempt.error.message}</p></div>
            </div>
          ))}
        </div>}
        {isFetching && attempts && <span className="refresh-note">Refreshing attempt history…</span>}

        <div className="section-label"><span>ALLOWLISTED METADATA · SELECTED EVENT</span><span className="section-line" /></div>
        <div className="context-panel">
          {Object.keys(failure.metadata).length
            ? <pre>{JSON.stringify(failure.metadata, null, 2)}</pre>
            : <p>No metadata was reported for this event.</p>}
        </div>
      </div>
      <div className="panel-footer"><span className="footer-pulse" /> DATABASE RECORD <span className="footer-spacer" /> NO SUCCESS OR RETRY STATUS REPORTED</div>
    </section>
  );
}

function Integration() {
  return (
    <section className="integration-panel">
      <span className="eyebrow">INTEGRATION <span className="eyebrow-divider">/</span> GETTING STARTED</span>
      <div className="integration-icon"><Braces size={23} /></div>
      <h2>Bring your failures<br />into focus.</h2>
      <p>Workers opt in by publishing version 1 failure events to the dedicated <code>faultdeck.failures</code> RabbitMQ exchange. FaultDeck does not consume your application queues.</p>
      <div className="section-label"><span>TRY A REAL FAILURE LOCALLY</span><span className="section-line" /></div>
      <pre className="integration-code">docker compose --profile demo run --build --rm worker</pre>
      <p>Run this from the repository root, then return to the overview and refresh the feed. The wire format and privacy guidance are in <code>contracts/README.md</code>.</p>
    </section>
  );
}

function App() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [service, setService] = useState('all');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<View>('overview');
  const searchRef = useRef<HTMLInputElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const { data: failures, isPending, isError, error, isFetching, refetch } = useQuery({
    queryKey: ['failures'], queryFn: ({ signal }) => listFailures(signal), refetchInterval: 30_000,
  });

  const services = [...new Set((failures ?? []).map((failure) => failure.service))].sort();
  const visible = (failures ?? []).filter((failure) => {
    const query = search.trim().toLowerCase();
    return (service === 'all' || failure.service === service) &&
      (!query || [failure.error.category, failure.error.message, failure.event_id, failure.job_id,
        failure.service, failure.queue].some((field) => field.toLowerCase().includes(query)));
  });
  const selected = visible.find((failure) => failure.event_id === selectedId) ?? visible[0];

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
          <button className="nav-item" onClick={showFeed}><Inbox size={17} /> Failure feed <span className="nav-count">{failures?.length ?? '—'}</span></button>
          <span className="nav-label nav-label-second">SYSTEM</span>
          <button className={`nav-item ${view === 'integration' ? 'selected' : ''}`} onClick={() => setView('integration')}><Braces size={17} /> Integration <ChevronRight className="nav-trail" size={15} /></button>
        </nav>
        <div className="sidebar-bottom"><div className="environment-card"><div className="env-heading"><span className="env-dot" /> ENVIRONMENT <span className="env-label">LOCAL</span></div><div className="env-row"><span>Failure records</span><span className="env-state">{isError ? 'Unavailable' : isPending ? 'Loading' : 'From API'}</span></div></div><div className="sidebar-version"><Terminal size={14} /> faultdeck / local <span>v0.1</span></div></div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div className="breadcrumbs"><span>WORKSPACE</span><ChevronRight size={13} /><strong>{view === 'overview' ? 'Overview' : 'Integration'}</strong></div><div className="topbar-right"><span className="demo-indicator"><span /> POSTGRESQL DATA</span><span className="topbar-divider" /><span className="topbar-date">{new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).toUpperCase()}</span><span className="user-avatar">FD</span></div></header>

        {view === 'integration' ? <div className="page-content integration-page"><div className="page-intro"><div className="page-kicker"><span className="kicker-square" /> GETTING STARTED</div><h1>Connect a worker<span className="heading-period">.</span></h1><p>One event contract. A clearer picture of every failure.</p></div><Integration /></div> : (
          <div className="page-content">
            <div className="page-intro"><div className="page-kicker"><span className="kicker-square" /> OBSERVABILITY <span className="kicker-line" /> OVERVIEW</div><div className="page-title-row"><div><h1>Failure overview<span className="heading-period">.</span></h1><p>Recent reported failed attempts, not inferred job status.</p></div><div className="snapshot-label"><Clock3 size={15} /><span>API FEED<br /><strong>REFRESHES EVERY 30S</strong></span></div></div></div>

            <div className="metrics-grid"><Metric label="FAILED EVENTS" value={failures?.length ?? '—'} footnote="In the latest 100 events" icon={<Activity size={17} />} /><Metric label="JOBS" value={failures ? new Set(failures.map((failure) => failure.job_id)).size : '—'} footnote="In this feed" icon={<Inbox size={17} />} /><Metric label="SERVICES" value={failures ? services.length : '—'} footnote="In this feed" icon={<Layers3 size={17} />} /><Metric label="LATEST FAILURE" value={failures?.length ? timeLabel(failures[0].occurred_at) : '—'} footnote="Occurred at · UTC" icon={<Clock3 size={17} />} /></div>

            <div className="section-heading" ref={feedRef}><div><div className="page-kicker section-kicker"><span className="kicker-square" /> RECENT EVENTS <span className="kicker-line" /> 01</div><h2>Failure feed <span className="heading-count">/ {failures?.length ?? '—'}</span></h2></div><button className="refresh-button" onClick={() => void refetch()} disabled={isFetching}><RefreshCw size={14} /> {isFetching ? 'Refreshing…' : 'Refresh'}</button></div>

            <div className="workspace-grid">
              <section className="feed-panel" aria-label="Failure feed">
                <div className="feed-toolbar"><div className="search-box"><Search size={16} /><input ref={searchRef} type="search" placeholder="Search loaded failures, queues, IDs..." value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search loaded failures" /><button onClick={() => searchRef.current?.focus()} aria-label="Focus search" className="search-shortcut">/</button></div><label className="service-filter"><span className="sr-only">Filter by service</span><select value={service} onChange={(event) => setService(event.target.value)}><option value="all">All services</option>{services.map((name) => <option key={name} value={name}>{name}</option>)}</select><ChevronDown size={14} /></label></div>
                <div className="list-header"><span>FAILURE / SERVICE</span><span>ATTEMPT</span><span>OCCURRED</span></div>
                {isError && <div className="feed-alert" role="alert">{error.message} {failures ? 'Showing the last loaded results.' : 'Unable to load failures.'} <button onClick={() => void refetch()}>Try again</button></div>}
                {isError && !failures ? <div className="detail-empty">No failure records are available right now.</div>
                  : isPending ? <div className="empty-state" role="status"><RefreshCw size={22} /><strong>Loading failures…</strong><span>Fetching recent events from the API.</span></div>
                    : !failures?.length ? <div className="empty-state"><Inbox size={22} /><strong>No failures reported yet</strong><span>Run the example worker to publish a failure, then refresh this page.</span></div>
                      : !visible.length ? <div className="empty-state"><Search size={22} /><strong>No matching failures</strong><span>Search and service filters apply to the latest 100 events only.</span><button onClick={() => { setSearch(''); setService('all'); }}>Clear filters</button></div>
                        : <div className="failure-list">{visible.map((failure) => <button key={failure.event_id} className={`failure-row ${selected?.event_id === failure.event_id ? 'row-selected' : ''}`} onClick={() => setSelectedId(failure.event_id)} aria-pressed={selected?.event_id === failure.event_id}><div className="row-main"><div className="row-icon"><Activity size={16} strokeWidth={1.8} /></div><div className="row-text"><strong>{failure.error.category}: {failure.error.message}</strong><span><code>{failure.event_id.slice(0, 8)}</code><i />{failure.service} <span className="row-slash">/</span> {failure.queue}</span></div></div><div className="row-status"><span className="attempt-badge">#{failure.attempt} failed</span></div><div className="row-end"><time>{timeLabel(failure.occurred_at)}</time></div><ChevronRight className="row-chevron" size={15} /></button>)}</div>}
                <div className="feed-footer"><span>SHOWING {visible.length} OF {failures?.length ?? 0} RECENT EVENTS</span><span>SEARCH FILTERS LOADED EVENTS ONLY</span></div>
              </section>
              {selected && !(isError && !failures) ? <Detail key={selected.event_id} failure={selected} /> : <div className="detail-panel detail-empty">{isPending ? 'Loading details…' : 'Select a failure to inspect its job history.'}</div>}
            </div>
            <footer className="page-footer"><span>FAULTDECK <span className="footer-divider">/</span> A BETTER VIEW OF FAILURE</span><span>FAILED ATTEMPTS ONLY <span className="footer-star">✳</span></span></footer>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
