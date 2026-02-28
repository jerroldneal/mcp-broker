/**
 * Per-Client Dashboard Generator
 *
 * Dynamically generates a self-contained HTML dashboard for any broker-client
 * based entirely on its registration metadata (clientId, tools, connection info).
 *
 * Design system borrowed from the Ideas Dashboard (ideas/public/index.html):
 *   - Dark glassmorphism theme (#0a0e17 base)
 *   - Sidebar with stats + tool navigation
 *   - Main content with tool cards
 *   - Detail drawer with interactive tool forms
 *   - SSE live updates
 *   - Category badges, stage pills, fade-in animations
 */

/**
 * @param {string} clientId
 * @param {object} clientData - { tools, connectedAt }
 * @param {object} opts - { host, activityLog, notifications, stats }
 * @returns {string} Complete HTML document
 */
export function generateClientDashboard(clientId, clientData, opts = {}) {
  const { tools = [], connectedAt = '' } = clientData;
  const host = opts.host || 'localhost:3098';
  const activities = (opts.activityLog || [])
    .filter(a => a.data && a.data.clientId === clientId)
    .slice(-100);
  const notifications = opts.notifications || [];
  const availableTools = opts.availableTools || [];

  // Escape helper
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Tool type color cycling
  const TOOL_COLORS = [
    { bg: 'rgba(99,179,237,0.15)',  fg: '#63b3ed' },
    { bg: 'rgba(183,148,246,0.15)', fg: '#b794f6' },
    { bg: 'rgba(246,173,85,0.15)',  fg: '#f6ad55' },
    { bg: 'rgba(252,129,129,0.15)', fg: '#fc8181' },
    { bg: 'rgba(104,211,145,0.15)', fg: '#68d391' },
    { bg: 'rgba(129,236,236,0.15)', fg: '#81ecec' },
    { bg: 'rgba(253,203,110,0.15)', fg: '#fdcb6e' },
    { bg: 'rgba(225,112,85,0.15)',  fg: '#e17055' },
    { bg: 'rgba(116,185,255,0.15)', fg: '#74b9ff' },
    { bg: 'rgba(162,155,254,0.15)', fg: '#a29bfe' },
  ];

  function toolColor(idx) {
    return TOOL_COLORS[idx % TOOL_COLORS.length];
  }

  // Build tool nav items for sidebar
  const toolNavItems = tools.map((t, i) => {
    const c = toolColor(i);
    return `<div class="nav-tool" data-tool-idx="${i}">
      <span class="nav-tool-dot" style="background:${c.fg}"></span>
      <span class="nav-tool-name">${esc(clientId)} → ${esc(t.name)}</span>
    </div>`;
  }).join('');

  // Build tool cards for the main grid
  const toolCards = tools.map((t, i) => {
    const c = toolColor(i);
    const schema = t.inputSchema || { type: 'object', properties: {} };
    const props = schema.properties || {};
    const required = new Set(schema.required || []);
    const paramCount = Object.keys(props).length;

    const paramList = Object.entries(props).map(([key, prop]) => {
      const isReq = required.has(key);
      return `<div class="param-row">
        <span class="param-name">${esc(key)}</span>
        <span class="param-type">${esc(prop.type || 'string')}</span>
        ${isReq ? '<span class="param-req">required</span>' : ''}
      </div>`;
    }).join('');

    return `<div class="tool-card" data-tool-idx="${i}" onclick="openTool(${i})">
      <div class="tool-card-header">
        <span class="tool-card-badge" style="background:${c.bg};color:${c.fg}">${esc(clientId)}</span>
        <span class="tool-card-arrow">→</span>
        <span class="tool-card-name">${esc(t.name)}</span>
      </div>
      ${t.description ? `<div class="tool-card-desc">${esc(t.description)}</div>` : ''}
      <div class="tool-card-footer">
        <span class="tool-card-params">${paramCount} param${paramCount !== 1 ? 's' : ''}</span>
        <span class="tool-card-try">Try It →</span>
      </div>
      ${paramList ? `<div class="tool-card-params-list">${paramList}</div>` : ''}
    </div>`;
  }).join('');

  // Available-tool accent colors (purple / cyan range to distinguish from published)
  const AVAIL_COLORS = [
    { bg: 'rgba(183,148,246,0.15)', fg: '#b794f6' },
    { bg: 'rgba(129,236,236,0.15)', fg: '#81ecec' },
    { bg: 'rgba(116,185,255,0.15)', fg: '#74b9ff' },
    { bg: 'rgba(162,155,254,0.15)', fg: '#a29bfe' },
    { bg: 'rgba(253,203,110,0.15)', fg: '#fdcb6e' },
    { bg: 'rgba(104,211,145,0.15)', fg: '#68d391' },
  ];

  function availColor(idx) {
    return AVAIL_COLORS[idx % AVAIL_COLORS.length];
  }

  // Build available tool nav items
  const availNavItems = availableTools.map((t, i) => {
    const c = availColor(i);
    return `<div class="nav-tool nav-avail-tool" data-avail-idx="${i}">
      <span class="nav-tool-dot" style="background:${c.fg}"></span>
      <span class="nav-tool-name">${esc(t.name)}</span>
    </div>`;
  }).join('');

  // Build available tool cards
  const availToolCards = availableTools.map((t, i) => {
    const c = availColor(i);
    const schema = t.inputSchema || { type: 'object', properties: {} };
    const props = schema.properties || {};
    const required = new Set(schema.required || []);
    const paramCount = Object.keys(props).length;

    const paramList = Object.entries(props).map(([key, prop]) => {
      const isReq = required.has(key);
      return `<div class="param-row">
        <span class="param-name">${esc(key)}</span>
        <span class="param-type">${esc(prop.type || 'string')}</span>
        ${isReq ? '<span class="param-req">required</span>' : ''}
      </div>`;
    }).join('');

    return `<div class="tool-card avail-tool-card" data-avail-idx="${i}" onclick="openAvailTool(${i})">
      <div class="tool-card-header">
        <span class="tool-card-badge" style="background:${c.bg};color:${c.fg}">broker</span>
        <span class="tool-card-arrow">→</span>
        <span class="tool-card-name">${esc(t.name)}</span>
      </div>
      ${t.description ? `<div class="tool-card-desc">${esc(t.description)}</div>` : ''}
      <div class="tool-card-footer">
        <span class="tool-card-params">${paramCount} param${paramCount !== 1 ? 's' : ''}</span>
        <span class="tool-card-try">Try It →</span>
      </div>
      ${paramList ? `<div class="tool-card-params-list">${paramList}</div>` : ''}
    </div>`;
  }).join('');

  // Build activity items
  const activityItems = activities.map(a => {
    const ICONS = {
      connect: '🟢', disconnect: '🔴', tool_call: '🔧', tool_result: '✅',
      tool_error: '❌', chat: '💬', chat_error: '⚠️', notification: '🔔',
    };
    const icon = ICONS[a.type] || '📌';
    return `<div class="activity-item">
      <span class="activity-time">${esc(a.time ? new Date(a.time).toLocaleTimeString() : '')}</span>
      <span class="activity-icon">${icon}</span>
      <span class="activity-msg">${esc(a.message)}</span>
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(clientId)} — MCP Broker Client Dashboard</title>
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --bg-base:     #0a0e17;
      --bg-surface:  #111827;
      --bg-elevated: #1a2236;
      --bg-hover:    #1e293b;
      --accent:      #63b3ed;
      --accent-dim:  rgba(99,179,237,0.15);
      --accent-glow: rgba(99,179,237,0.25);
      --accent-bright: #90cdf4;
      --success:     #68d391;
      --success-dim: rgba(104,211,145,0.15);
      --danger:      #fc8181;
      --danger-dim:  rgba(252,129,129,0.15);
      --warning:     #f6ad55;
      --warning-dim: rgba(246,173,85,0.15);
      --purple:      #b794f6;
      --purple-dim:  rgba(183,148,246,0.15);
      --cyan:        #81ecec;
      --text-primary:   #e2e8f0;
      --text-secondary: #a0aec0;
      --text-muted:     #4a5568;
      --border:      rgba(255,255,255,0.06);
      --border-focus:rgba(99,179,237,0.4);
      --glass-bg:    rgba(17,24,39,0.6);
      --glass-border:rgba(255,255,255,0.08);
      --sidebar-width: 260px;
      --radius-sm: 6px;
      --radius-md: 10px;
      --tr-fast:  150ms cubic-bezier(.4,0,.2,1);
      --tr-smooth:250ms cubic-bezier(.4,0,.2,1);
    }
    @keyframes fade-in  { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
    @keyframes spin     { to { transform: rotate(360deg); } }
    @keyframes slide-in { from{transform:translateX(100%)} to{transform:translateX(0)} }
    @keyframes pulse    { 0%,100%{opacity:1} 50%{opacity:.5} }

    body {
      width:100%; min-height:100vh;
      font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
      font-size:13px; background:var(--bg-base); color:var(--text-primary);
      display:flex; overflow:hidden; -webkit-font-smoothing:antialiased;
    }

    /* ── Sidebar ── */
    .sidebar {
      width:var(--sidebar-width); height:100vh;
      background:var(--bg-surface); border-right:1px solid var(--border);
      display:flex; flex-direction:column; flex-shrink:0;
      position:fixed; left:0; top:0; z-index:100; overflow:hidden;
    }
    .sidebar-header { padding:18px 16px 14px; border-bottom:1px solid var(--border); flex-shrink:0; }
    .sidebar-brand  { display:flex; align-items:center; gap:10px; }
    .sidebar-logo   {
      width:36px; height:36px; border-radius:var(--radius-sm);
      background:linear-gradient(135deg,var(--accent) 0%,#805ad5 100%);
      display:flex; align-items:center; justify-content:center;
      font-size:20px; flex-shrink:0;
    }
    .sidebar-title    { font-size:15px; font-weight:700; color:var(--text-primary); }
    .sidebar-subtitle { font-size:10px; color:var(--text-muted); margin-top:2px; text-transform:uppercase; letter-spacing:.5px; }

    .sidebar-stats {
      padding:12px 16px; border-bottom:1px solid var(--border); flex-shrink:0;
      display:flex; gap:12px;
    }
    .stat-pill { flex:1; text-align:center; }
    .stat-pill .stat-num { font-size:20px; font-weight:700; color:var(--accent); }
    .stat-pill .stat-lbl { font-size:9px; color:var(--text-muted); text-transform:uppercase; letter-spacing:.5px; }

    .sidebar-connection {
      padding:10px 16px; border-bottom:1px solid var(--border); flex-shrink:0;
      display:flex; align-items:center; gap:8px;
    }
    .conn-dot {
      width:8px; height:8px; border-radius:50%; flex-shrink:0;
      transition:background .3s;
    }
    .conn-dot.online  { background:var(--success); box-shadow:0 0 6px var(--success); }
    .conn-dot.offline { background:var(--danger); }
    .conn-label { font-size:11px; color:var(--text-secondary); }
    .conn-since { font-size:10px; color:var(--text-muted); font-family:'Consolas',monospace; margin-left:auto; }

    .sidebar-nav { flex:1; overflow-y:auto; padding:6px 8px; }
    .sidebar-nav::-webkit-scrollbar { width:3px; }
    .sidebar-nav::-webkit-scrollbar-thumb { background:var(--text-muted); border-radius:3px; }

    .nav-section-label {
      font-size:9px; font-weight:700; letter-spacing:1px; text-transform:uppercase;
      color:var(--text-muted); padding:10px 10px 4px;
    }
    .nav-tool {
      display:flex; align-items:center; gap:8px;
      padding:8px 10px; border-radius:var(--radius-sm); cursor:pointer;
      font-size:11px; color:var(--text-secondary); transition:var(--tr-fast);
      user-select:none;
    }
    .nav-tool:hover { background:var(--bg-hover); color:var(--text-primary); }
    .nav-tool.active { background:var(--accent-dim); color:var(--accent); font-weight:600; }
    .nav-tool-dot {
      width:6px; height:6px; border-radius:50%; flex-shrink:0;
    }
    .nav-tool-name {
      font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    }

    .sidebar-footer {
      padding:10px 16px; border-top:1px solid var(--border); flex-shrink:0;
      font-size:10px; color:var(--text-muted); text-align:center;
    }
    .sidebar-footer a { color:var(--accent); text-decoration:none; }
    .sidebar-footer a:hover { text-decoration:underline; }

    /* ── Main ── */
    .main { flex:1; margin-left:var(--sidebar-width); height:100vh; display:flex; flex-direction:column; overflow:hidden; }

    .topbar {
      height:50px; background:var(--bg-surface); border-bottom:1px solid var(--border);
      display:flex; align-items:center; justify-content:space-between; padding:0 20px; flex-shrink:0;
    }
    .topbar-left  { display:flex; align-items:center; gap:16px; }
    .topbar-title { font-size:15px; font-weight:700; color:var(--text-primary); }
    .topbar-right { display:flex; align-items:center; gap:8px; }

    .view-toggle { display:flex; background:var(--bg-elevated); border-radius:var(--radius-sm); overflow:hidden; border:1px solid var(--border); }
    .view-btn {
      padding:5px 12px; border:none; background:transparent; color:var(--text-muted);
      font-size:11px; font-weight:500; cursor:pointer; transition:var(--tr-fast); font-family:inherit;
    }
    .view-btn:hover  { color:var(--text-secondary); background:var(--bg-hover); }
    .view-btn.active { background:var(--accent-dim); color:var(--accent); font-weight:700; }

    .refresh-btn {
      padding:5px 10px; border:1px solid var(--border); background:var(--bg-elevated);
      color:var(--text-muted); font-size:11px; font-family:inherit; border-radius:var(--radius-sm);
      cursor:pointer; transition:var(--tr-fast);
    }
    .refresh-btn:hover { border-color:var(--border-focus); color:var(--accent); }

    .topbar-meta { font-size:11px; color:var(--text-muted); }

    .content-area { flex:1; overflow:hidden; display:flex; flex-direction:column; }

    /* ── Summary Bar ── */
    .pipeline-summary {
      display:flex; border-bottom:1px solid var(--border); flex-shrink:0;
      background:var(--bg-base); padding:8px 16px; align-items:center; gap:16px;
      font-size:11px; color:var(--text-muted);
    }
    .ps-item { display:flex; align-items:center; gap:5px; }
    .ps-dot  { width:8px; height:8px; border-radius:50%; }
    .ps-num  { font-weight:700; color:var(--text-secondary); }

    /* ── Tools Grid View ── */
    #view-grid {
      flex:1; overflow-y:auto; padding:16px 20px;
      display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr));
      gap:12px; align-content:start;
    }
    #view-grid::-webkit-scrollbar { width:5px; }
    #view-grid::-webkit-scrollbar-thumb { background:var(--text-muted); border-radius:5px; }

    .tool-card {
      background:var(--glass-bg); border:1px solid var(--glass-border);
      border-radius:var(--radius-md); padding:16px; cursor:pointer;
      transition:var(--tr-smooth); animation:fade-in .2s ease-out;
      border-left:3px solid var(--accent);
    }
    .tool-card:hover { border-color:rgba(255,255,255,.14); transform:translateY(-2px); box-shadow:0 6px 24px rgba(0,0,0,.35); }
    .tool-card-header { display:flex; align-items:center; gap:6px; margin-bottom:8px; flex-wrap:wrap; }
    .tool-card-badge {
      display:inline-block; padding:3px 10px; border-radius:12px;
      font-size:10px; font-weight:600; letter-spacing:.3px;
    }
    .tool-card-arrow { color:var(--text-muted); font-size:12px; }
    .tool-card-name { font-size:14px; font-weight:700; color:var(--text-primary); }
    .tool-card-desc { font-size:12px; color:var(--text-secondary); line-height:1.6; margin-bottom:10px; }
    .tool-card-footer {
      display:flex; align-items:center; justify-content:space-between;
      padding-top:8px; border-top:1px solid var(--border);
    }
    .tool-card-params { font-size:11px; color:var(--text-muted); }
    .tool-card-try {
      font-size:11px; font-weight:600; color:var(--accent);
      opacity:0; transition:opacity .15s;
    }
    .tool-card:hover .tool-card-try { opacity:1; }
    .tool-card-params-list {
      margin-top:8px; padding-top:8px; border-top:1px solid var(--border);
    }
    .param-row {
      display:flex; align-items:center; gap:8px; padding:3px 0;
      font-size:11px;
    }
    .param-name { font-weight:600; color:var(--text-primary); font-family:'Consolas','SF Mono',monospace; }
    .param-type {
      font-size:10px; color:var(--text-muted); background:var(--bg-elevated);
      padding:1px 6px; border-radius:3px; font-family:'Consolas',monospace;
    }
    .param-req { font-size:10px; color:var(--warning); }

    /* ── Activity View ── */
    #view-activity {
      flex:1; overflow-y:auto; padding:16px 20px; display:none;
    }
    #view-activity::-webkit-scrollbar { width:5px; }
    #view-activity::-webkit-scrollbar-thumb { background:var(--text-muted); border-radius:5px; }

    .activity-item {
      display:flex; align-items:flex-start; gap:10px;
      padding:8px 12px; border-bottom:1px solid var(--border);
      font-size:12px; transition:background .15s;
      animation:fade-in .2s ease-out;
    }
    .activity-item:hover { background:var(--bg-hover); }
    .activity-time {
      color:var(--text-muted); font-family:'Consolas',monospace;
      font-size:10px; flex-shrink:0; min-width:64px; padding-top:1px;
    }
    .activity-icon { flex-shrink:0; width:16px; text-align:center; font-size:12px; }
    .activity-msg { color:var(--text-primary); word-break:break-word; line-height:1.5; }
    .activity-empty {
      text-align:center; padding:40px 20px; color:var(--text-muted);
      font-size:13px; font-style:italic;
    }

    /* ── Detail Drawer ── */
    .drawer-overlay {
      position:fixed; inset:0; background:rgba(0,0,0,.6); z-index:400;
      display:none; backdrop-filter:blur(2px);
    }
    .drawer-overlay.open { display:block; }
    .drawer {
      position:fixed; top:0; right:0; height:100vh; width:min(640px,90vw);
      background:var(--bg-surface); border-left:1px solid var(--border);
      z-index:401; overflow:hidden; display:flex; flex-direction:column;
      transform:translateX(100%); transition:transform .25s cubic-bezier(.4,0,.2,1);
    }
    .drawer.open { transform:translateX(0); animation:slide-in .25s ease-out; }
    .drawer-header {
      padding:18px 20px; border-bottom:1px solid var(--border); flex-shrink:0;
      display:flex; align-items:flex-start; justify-content:space-between; gap:12px;
    }
    .drawer-title-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
    .drawer-title { font-size:16px; font-weight:700; color:var(--text-primary); }
    .drawer-client-tag {
      font-size:11px; padding:3px 10px; border-radius:12px;
    }
    .drawer-close {
      background:none; border:none; cursor:pointer; color:var(--text-muted);
      font-size:22px; line-height:1; padding:2px; flex-shrink:0; transition:color .15s;
    }
    .drawer-close:hover { color:var(--text-primary); }
    .drawer-desc {
      padding:12px 20px; border-bottom:1px solid var(--border); flex-shrink:0;
      font-size:13px; color:var(--text-secondary); line-height:1.6;
    }

    /* ── Drawer Form ── */
    .drawer-form { padding:16px 20px; overflow-y:auto; flex:1; }
    .drawer-form::-webkit-scrollbar { width:5px; }
    .drawer-form::-webkit-scrollbar-thumb { background:var(--text-muted); border-radius:5px; }

    .form-field { display:flex; flex-direction:column; gap:5px; margin-bottom:14px; }
    .form-label {
      font-size:12px; font-weight:600; color:var(--text-primary);
      display:flex; align-items:center; gap:6px;
    }
    .form-label .type-tag {
      font-size:10px; font-weight:400; color:var(--text-muted);
      background:var(--bg-elevated); padding:1px 6px; border-radius:3px;
      font-family:'Consolas','SF Mono',monospace;
    }
    .form-label .required-tag { font-size:10px; color:var(--warning); }
    .form-hint { font-size:11px; color:var(--text-muted); }
    .form-input {
      background:var(--bg-base); border:1px solid var(--border); border-radius:var(--radius-sm);
      padding:8px 12px; color:var(--text-primary); font-size:13px;
      font-family:'Consolas','SF Mono',monospace; outline:none; transition:border-color .15s;
    }
    .form-input:focus { border-color:var(--accent); box-shadow:0 0 0 2px var(--accent-dim); }
    textarea.form-input { min-height:60px; resize:vertical; }
    .form-checkbox-row { display:flex; align-items:center; gap:8px; padding:4px 0; }
    .form-checkbox-row input[type="checkbox"] { accent-color:var(--accent); width:16px; height:16px; }
    .form-no-params {
      padding:20px 0; text-align:center; color:var(--text-muted);
      font-size:12px; font-style:italic;
    }

    .drawer-actions {
      display:flex; gap:10px; padding:12px 20px;
      border-top:1px solid var(--border); flex-shrink:0;
    }
    .btn-run {
      background:var(--accent); color:#fff; border:none;
      padding:8px 24px; border-radius:var(--radius-sm);
      font-size:13px; font-weight:600; cursor:pointer;
      transition:opacity .15s; font-family:inherit;
    }
    .btn-run:hover { opacity:.85; }
    .btn-run:disabled { opacity:.4; cursor:not-allowed; }
    .btn-clear {
      background:var(--bg-elevated); border:1px solid var(--border);
      color:var(--text-muted); padding:8px 16px; border-radius:var(--radius-sm);
      font-size:13px; cursor:pointer; transition:all .15s; font-family:inherit;
    }
    .btn-clear:hover { background:var(--bg-hover); color:var(--text-primary); }

    /* ── Result ── */
    .result-area { border-top:1px solid var(--border); flex-shrink:0; display:none; }
    .result-header {
      padding:10px 20px; font-size:12px; font-weight:600; text-transform:uppercase;
      letter-spacing:.6px; color:var(--text-muted); display:flex; align-items:center; gap:10px;
    }
    .result-status {
      font-size:11px; font-weight:600; padding:2px 8px; border-radius:4px;
    }
    .result-status.success { background:var(--success-dim); color:var(--success); }
    .result-status.error   { background:var(--danger-dim); color:var(--danger); }
    .result-timing { font-weight:400; font-size:11px; color:var(--text-muted); }
    .result-body {
      padding:12px 20px; max-height:300px; overflow-y:auto;
    }
    .result-body pre {
      font-family:'Consolas','SF Mono',monospace; font-size:12px;
      line-height:1.6; white-space:pre-wrap; word-break:break-word; color:var(--text-primary);
    }
    .result-body pre.error-text { color:var(--danger); }

    /* ── Spinner ── */
    .spinner {
      display:inline-block; width:16px; height:16px;
      border:2px solid var(--border); border-top-color:var(--accent);
      border-radius:50%; animation:spin .6s linear infinite;
    }

    /* ── Scrollbar ── */
    ::-webkit-scrollbar { width:5px; }
    ::-webkit-scrollbar-track { background:transparent; }
    ::-webkit-scrollbar-thumb { background:rgba(255,255,255,.1); border-radius:5px; }
    ::-webkit-scrollbar-thumb:hover { background:rgba(255,255,255,.2); }

    @media (max-width:700px) {
      .sidebar { display:none; }
      .main    { margin-left:0; }
    }
  </style>
</head>
<body>

<!-- ============================================================ SIDEBAR -->
<div class="sidebar">
  <div class="sidebar-header">
    <div class="sidebar-brand">
      <div class="sidebar-logo">🔗</div>
      <div>
        <div class="sidebar-title">${esc(clientId)}</div>
        <div class="sidebar-subtitle">MCP Broker Client</div>
      </div>
    </div>
  </div>

  <div class="sidebar-stats">
    <div class="stat-pill">
      <div class="stat-num" id="statTools">${tools.length}</div>
      <div class="stat-lbl">Tools</div>
    </div>
    <div class="stat-pill">
      <div class="stat-num" id="statCalls">0</div>
      <div class="stat-lbl">Calls</div>
    </div>
    <div class="stat-pill">
      <div class="stat-num" id="statStatus">●</div>
      <div class="stat-lbl">Status</div>
    </div>
  </div>

  <div class="sidebar-connection" id="connectionBar">
    <div class="conn-dot online" id="connDot"></div>
    <span class="conn-label" id="connLabel">Connected</span>
    <span class="conn-since" id="connSince">${esc(connectedAt ? new Date(connectedAt).toLocaleTimeString() : '—')}</span>
  </div>

  <nav class="sidebar-nav">
    <div class="nav-section-label">Published Tools</div>
    ${toolNavItems || '<div style="padding:12px 10px;font-size:11px;color:var(--text-muted);font-style:italic">No tools registered</div>'}
    <div class="nav-section-label" style="margin-top:8px">Available Tools <span style="font-weight:400;opacity:0.6">(via Broker)</span></div>
    ${availNavItems || '<div style="padding:12px 10px;font-size:11px;color:var(--text-muted);font-style:italic">No available tools</div>'}
  </nav>

  <div class="sidebar-footer">
    <a href="/">← All Clients (Broker Dashboard)</a>
  </div>
</div>

<!-- ============================================================ MAIN -->
<div class="main">
  <div class="topbar">
    <div class="topbar-left">
      <span class="topbar-title" id="topbarTitle">${esc(clientId)} — Tools</span>
    </div>
    <div class="topbar-right">
      <div class="view-toggle">
        <button class="view-btn active" data-view="grid">⬛ Tools</button>
        <button class="view-btn"        data-view="available">🔌 Available</button>
        <button class="view-btn"        data-view="activity">📋 Activity</button>
      </div>
      <button class="refresh-btn" id="refreshBtn" title="Reload">↻</button>
      <span class="topbar-meta" id="topbarMeta">${tools.length} tool${tools.length !== 1 ? 's' : ''} · ${availableTools.length} available</span>
    </div>
  </div>

  <div class="pipeline-summary" id="summaryBar">
    <span style="font-weight:600;color:var(--text-secondary)">Client:</span>
    <span class="ps-item">
      <span class="ps-dot" style="background:var(--success)" id="summaryDot"></span>
      <span>${esc(clientId)}</span>
    </span>
    <span>·</span>
    <span class="ps-item">
      <span class="ps-dot" style="background:var(--accent)"></span>
      <span class="ps-num" id="summaryTools">${tools.length}</span>
      <span>tools</span>
    </span>
    <span>·</span>
    <span class="ps-item">
      <span class="ps-dot" style="background:var(--warning)"></span>
      <span>Connected</span>
      <span class="ps-num" id="summaryUptime">—</span>
    </span>
  </div>

  <div class="content-area">
    <div id="view-grid">
      ${toolCards || '<div class="activity-empty">No tools published by this client</div>'}
    </div>
    <div id="view-available">
      ${availToolCards || '<div class="activity-empty">No available tools from the broker</div>'}
    </div>
    <div id="view-activity">
      ${activityItems || '<div class="activity-empty">No activity recorded yet</div>'}
    </div>
  </div>
</div>

<!-- ============================================================ DRAWER -->
<div class="drawer-overlay" id="drawerOverlay"></div>
<div class="drawer" id="drawer">
  <div class="drawer-header">
    <div>
      <div class="drawer-title-row">
        <span class="drawer-client-tag" id="drawerTag"></span>
        <span class="drawer-title" id="drawerTitle"></span>
      </div>
    </div>
    <button class="drawer-close" id="drawerClose">×</button>
  </div>
  <div class="drawer-desc" id="drawerDesc"></div>
  <div class="drawer-form" id="drawerForm"></div>
  <div class="drawer-actions" id="drawerActions" style="display:none">
    <button class="btn-run" id="btnRun">▶ Run Tool</button>
    <button class="btn-clear" id="btnClear">Clear</button>
  </div>
  <div class="result-area" id="resultArea">
    <div class="result-header" id="resultHeader"></div>
    <div class="result-body" id="resultBody"></div>
  </div>
</div>

<script>
(function() {
  'use strict';

  const CLIENT_ID = ${JSON.stringify(clientId)};
  const TOOLS = ${JSON.stringify(tools.map(t => ({
    name: t.name,
    description: t.description || '',
    inputSchema: t.inputSchema || { type: 'object', properties: {} },
  })))};
  const AVAILABLE_TOOLS = ${JSON.stringify(availableTools.map(t => ({
    name: t.name,
    description: t.description || '',
    inputSchema: t.inputSchema || { type: 'object', properties: {} },
  })))};
  const AVAIL_COLORS = ${JSON.stringify(AVAIL_COLORS)};
  const TOOL_COLORS = ${JSON.stringify(TOOL_COLORS)};

  // ── Elements ──
  const $ = id => document.getElementById(id);

  let currentView = 'grid';
  let selectedToolIdx = null;
  let selectedCatalog = 'published';

  // ── Escape ──
  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // ── Format uptime ──
  function formatUptime(ms) {
    const s = Math.floor(ms / 1000);
    if (s < 60) return s + 's';
    const m = Math.floor(s / 60);
    if (m < 60) return m + 'm ' + (s % 60) + 's';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h ' + (m % 60) + 'm';
    const d = Math.floor(h / 24);
    return d + 'd ' + (h % 24) + 'h';
  }

  // ── Open tool drawer ──
  function openToolDrawer(tool, idx, colors, tagLabel, catalog) {
    selectedToolIdx = idx;
    selectedCatalog = catalog;
    const c = colors[idx % colors.length];

    $('drawerTag').textContent = tagLabel;
    $('drawerTag').style.background = c.bg;
    $('drawerTag').style.color = c.fg;
    $('drawerTitle').textContent = '→ ' + tool.name;
    $('drawerDesc').textContent = tool.description || 'No description provided.';

    // Build form
    const schema = tool.inputSchema || { type:'object', properties:{} };
    const props = schema.properties || {};
    const required = new Set(schema.required || []);
    const keys = Object.keys(props);

    let html = '';
    if (keys.length === 0) {
      html = '<div class="form-no-params">This tool takes no parameters.</div>';
    } else {
      for (const key of keys) {
        const prop = props[key];
        const isReq = required.has(key);
        const type = prop.type || 'string';
        html += '<div class="form-field">';
        html += '<label class="form-label">' + esc(key);
        html += ' <span class="type-tag">' + esc(type) + '</span>';
        if (isReq) html += ' <span class="required-tag">required</span>';
        html += '</label>';
        if (prop.description) html += '<div class="form-hint">' + esc(prop.description) + '</div>';

        if (type === 'boolean') {
          html += '<div class="form-checkbox-row"><input type="checkbox" data-field="' + esc(key) + '" data-type="boolean"><label>' + esc(key) + '</label></div>';
        } else if (type === 'number' || type === 'integer') {
          html += '<input class="form-input" type="number" data-field="' + esc(key) + '" data-type="' + esc(type) + '" placeholder="' + esc(prop.description || key) + '">';
        } else if (prop.enum) {
          html += '<select class="form-input" data-field="' + esc(key) + '" data-type="string">';
          html += '<option value="">— select —</option>';
          for (const v of prop.enum) html += '<option value="' + esc(String(v)) + '">' + esc(String(v)) + '</option>';
          html += '</select>';
        } else {
          const isLong = /prompt|text|content|message|body/i.test(prop.description || key);
          if (isLong) {
            html += '<textarea class="form-input" data-field="' + esc(key) + '" data-type="string" placeholder="' + esc(prop.description || key) + '"></textarea>';
          } else {
            html += '<input class="form-input" type="text" data-field="' + esc(key) + '" data-type="string" placeholder="' + esc(prop.description || key) + '">';
          }
        }
        html += '</div>';
      }
    }

    $('drawerForm').innerHTML = html;
    $('drawerActions').style.display = 'flex';
    $('resultArea').style.display = 'none';
    $('btnRun').disabled = false;
    $('btnRun').textContent = '▶ Run Tool';

    $('drawerOverlay').classList.add('open');
    $('drawer').classList.add('open');

    // Highlight sidebar
    document.querySelectorAll('.nav-tool').forEach(el => {
      el.classList.toggle('active', parseInt(el.dataset.toolIdx) === idx && catalog === 'published');
    });
    document.querySelectorAll('.nav-avail-tool').forEach(el => {
      el.classList.toggle('active', parseInt(el.dataset.availIdx) === idx && catalog === 'available');
    });
  };

  window.openTool = function(idx) {
    const tool = TOOLS[idx];
    if (!tool) return;
    openToolDrawer(tool, idx, TOOL_COLORS, CLIENT_ID, 'published');
  };

  window.openAvailTool = function(idx) {
    const tool = AVAILABLE_TOOLS[idx];
    if (!tool) return;
    openToolDrawer(tool, idx, AVAIL_COLORS, 'broker', 'available');
  };

  // ── Run tool via broker API ──
  $('btnRun').addEventListener('click', async () => {
    if (selectedToolIdx === null) return;
    const tool = selectedCatalog === 'available' ? AVAILABLE_TOOLS[selectedToolIdx] : TOOLS[selectedToolIdx];
    const btn = $('btnRun');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Running…';

    const args = {};
    $('drawerForm').querySelectorAll('[data-field]').forEach(el => {
      const key = el.dataset.field;
      const type = el.dataset.type;
      if (type === 'boolean') args[key] = el.checked;
      else if (type === 'number' || type === 'integer') { if (el.value !== '') args[key] = Number(el.value); }
      else { if (el.value !== '') args[key] = el.value; }
    });

    try {
      const res = await fetch('/api/call-tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: CLIENT_ID, tool: tool.name, arguments: args }),
      });
      const data = await res.json();
      $('resultArea').style.display = 'block';

      if (res.ok && !data.isError) {
        $('resultHeader').innerHTML = 'Result <span class="result-status success">Success</span> <span class="result-timing">' + (data.duration || 0) + 'ms</span>';
        const text = (data.content || []).map(c => c.type === 'text' ? c.text : JSON.stringify(c)).join('\\n');
        $('resultBody').innerHTML = '<pre>' + esc(text || '(empty response)') + '</pre>';
      } else {
        $('resultHeader').innerHTML = 'Result <span class="result-status error">Error</span> <span class="result-timing">' + (data.duration || 0) + 'ms</span>';
        const errText = data.error || (data.content || []).map(c => c.text || '').join('\\n') || 'Unknown error';
        $('resultBody').innerHTML = '<pre class="error-text">' + esc(errText) + '</pre>';
      }
    } catch (err) {
      $('resultArea').style.display = 'block';
      $('resultHeader').innerHTML = 'Result <span class="result-status error">Error</span>';
      $('resultBody').innerHTML = '<pre class="error-text">' + esc('Network error: ' + err.message) + '</pre>';
    }

    btn.disabled = false;
    btn.textContent = '▶ Run Tool';
  });

  // ── Clear form ──
  $('btnClear').addEventListener('click', () => {
    $('drawerForm').querySelectorAll('[data-field]').forEach(el => {
      if (el.type === 'checkbox') el.checked = false;
      else el.value = '';
    });
    $('resultArea').style.display = 'none';
  });

  // ── Close drawer ──
  function closeDrawer() {
    $('drawerOverlay').classList.remove('open');
    $('drawer').classList.remove('open');
    document.querySelectorAll('.nav-tool').forEach(el => el.classList.remove('active'));
    selectedToolIdx = null;
  }
  $('drawerClose').addEventListener('click', closeDrawer);
  $('drawerOverlay').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

  // ── View toggle ──
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentView = btn.dataset.view;
      $('view-grid').style.display     = currentView === 'grid'     ? 'grid' : 'none';
      $('view-available').style.display = currentView === 'available' ? 'grid' : 'none';
      $('view-activity').style.display  = currentView === 'activity' ? 'block' : 'none';
    });
  });

  // ── Sidebar tool nav clicks ──
  document.querySelectorAll('.nav-tool:not(.nav-avail-tool)').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.toolIdx);
      window.openTool(idx);
    });
  });

  // ── Sidebar available tool nav clicks ──
  document.querySelectorAll('.nav-avail-tool').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.availIdx);
      window.openAvailTool(idx);
    });
  });

  // ── SSE: live updates for this client ──
  function connectSSE() {
    const evtSource = new EventSource('/api/client/' + encodeURIComponent(CLIENT_ID) + '/events');

    evtSource.onmessage = (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }

      if (data.type === 'state') {
        // Update connection state
        const client = data.clients.find(c => c.clientId === CLIENT_ID);
        const isOnline = !!client;
        $('connDot').className = 'conn-dot ' + (isOnline ? 'online' : 'offline');
        $('connLabel').textContent = isOnline ? 'Connected' : 'Disconnected';
        $('summaryDot').style.background = isOnline ? 'var(--success)' : 'var(--danger)';
        $('statStatus').style.color = isOnline ? 'var(--success)' : 'var(--danger)';

        if (isOnline && client) {
          $('statTools').textContent = client.tools.length;
          $('summaryTools').textContent = client.tools.length;
          $('topbarMeta').textContent = client.tools.length + ' tool' + (client.tools.length !== 1 ? 's' : '');
        }

        // Update uptime
        if (data.uptime) {
          $('summaryUptime').textContent = formatUptime(data.uptime);
        }
      } else if (data.type === 'activity') {
        const entry = data.entry;
        // Only show activities related to this client
        if (entry.data && entry.data.clientId === CLIENT_ID) {
          const actView = $('view-activity');
          const empty = actView.querySelector('.activity-empty');
          if (empty) empty.remove();
          const ICONS = { connect:'🟢', disconnect:'🔴', tool_call:'🔧', tool_result:'✅', tool_error:'❌', chat:'💬', notification:'🔔' };
          const div = document.createElement('div');
          div.className = 'activity-item';
          div.innerHTML =
            '<span class="activity-time">' + esc(entry.time ? new Date(entry.time).toLocaleTimeString() : '') + '</span>' +
            '<span class="activity-icon">' + (ICONS[entry.type] || '📌') + '</span>' +
            '<span class="activity-msg">' + esc(entry.message) + '</span>';
          actView.appendChild(div);
        }
      }
    };

    evtSource.onerror = () => {
      $('connDot').className = 'conn-dot offline';
      $('connLabel').textContent = 'SSE disconnected';
    };
  }

  // ── Refresh button ──
  $('refreshBtn').addEventListener('click', () => {
    window.location.reload();
  });

  // ── Init ──
  $('view-grid').style.display = 'grid';
  $('view-available').style.display = 'none';
  $('view-activity').style.display = 'none';
  connectSSE();
})();
</script>
</body>
</html>`;
}
