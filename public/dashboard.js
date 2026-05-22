const SUS_ITEMS = [
  { num:1,  text:"I think that I would like to use this system frequently.",                                               rev:false },
  { num:2,  text:"I found the system unnecessarily complex.",                                                              rev:true  },
  { num:3,  text:"I thought the system was easy to use.",                                                                  rev:false },
  { num:4,  text:"I think that I would need the support of a technical person to be able to use this system.",             rev:true  },
  { num:5,  text:"I found the various functions in this system were well integrated.",                                      rev:false },
  { num:6,  text:"I thought there was too much inconsistency in this system.",                                             rev:true  },
  { num:7,  text:"I would imagine that most people would learn to use this system very quickly.",                           rev:false },
  { num:8,  text:"I found the system very cumbersome to use.",                                                             rev:true  },
  { num:9,  text:"I felt very confident using the system.",                                                                rev:false },
  { num:10, text:"I needed to learn a lot of things before I could get going with this system.",                           rev:true  },
];

let responses = [];
let passcode = sessionStorage.getItem('sus_admin_passcode') || '';

async function verifyPasscode() {
  const passcodeField = document.getElementById('admin-passcode');
  if (!passcodeField) return;
  const pInput = passcodeField.value;
  const errorDiv = document.getElementById('passcode-error');
  if (errorDiv) errorDiv.style.display = 'none';

  if (!pInput) {
    if (errorDiv) {
      errorDiv.textContent = 'Please enter a passcode.';
      errorDiv.style.display = 'block';
    }
    return;
  }

  try {
    const res = await fetch('/.netlify/functions/admin-sus', {
      method: 'GET',
      headers: { 'Authorization': pInput }
    });

    if (res.status === 401) {
      if (errorDiv) {
        errorDiv.textContent = 'Invalid passcode. Please try again.';
        errorDiv.style.display = 'block';
      }
      return;
    }

    if (!res.ok) {
      const errBody = await res.json();
      if (errorDiv) {
        errorDiv.textContent = `Server Error: ${errBody.error || 'Unable to connect'}${errBody.detail ? ' (' + errBody.detail + ')' : ''}`;
        errorDiv.style.display = 'block';
      }
      return;
    }

    // Success
    passcode = pInput;
    sessionStorage.setItem('sus_admin_passcode', passcode);
    const overlay = document.getElementById('passcode-overlay');
    if (overlay) overlay.style.display = 'none';
    
    responses = await res.json();
    renderDash();
    fetchActiveSession();
    showToast('Dashboard unlocked!');

  } catch (err) {
    if (errorDiv) {
      errorDiv.textContent = 'Network error. Make sure your server is running.';
      errorDiv.style.display = 'block';
    }
  }
}

function gradeLabel(score){
  if(score >= 90) return 'Best imaginable';
  if(score >= 85) return 'Excellent';
  if(score >= 80) return 'Good';
  if(score >= 70) return 'Okay';
  if(score >= 68) return 'Above avg';
  if(score >= 60) return 'Below avg';
  return 'Poor';
}

function renderDash(){
  const sessFilter = document.getElementById('sess-filter');
  if (!sessFilter) return;
  const sessions = [...new Set(responses.map(r => r.session))].sort();
  const curSel = sessFilter.value;
  sessFilter.innerHTML = '<option value="all">All sessions</option>' + sessions.map(s => `<option value="${s}"${s === curSel ? ' selected' : ''}>${s}</option>`).join('');

  const filtered = sessFilter.value === 'all' ? responses : responses.filter(r => r.session === sessFilter.value);
  
  const filterCountEl = document.getElementById('filter-count');
  if (filterCountEl) {
    filterCountEl.textContent = `${filtered.length} response${filtered.length !== 1 ? 's' : ''}`;
  }

  const statN = document.getElementById('stat-n');
  if (statN) statN.textContent = filtered.length;

  if(filtered.length === 0){
    const statAvg = document.getElementById('stat-avg');
    const statGrade = document.getElementById('stat-grade');
    const statHi = document.getElementById('stat-hi');
    const statLo = document.getElementById('stat-lo');
    const statSat = document.getElementById('stat-sat');
    const respTbody = document.getElementById('resp-tbody');
    const itemAvgBody = document.getElementById('item-avg-body');

    if (statAvg) statAvg.textContent = '—';
    if (statGrade) statGrade.textContent = 'No data yet';
    if (statHi) statHi.textContent = '—';
    if (statLo) statLo.textContent = '—';
    if (statSat) statSat.textContent = '—';
    if (respTbody) {
      respTbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><span class="empty-icon">📋</span>No responses yet.</div></td></tr>`;
    }
    if (itemAvgBody) {
      itemAvgBody.innerHTML = `<div class="empty-state"><span class="empty-icon">📊</span>Submit at least one response.</div>`;
    }
    ['fb-q1','fb-q2','fb-q3','fb-q4'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<div class="fb-entry fb-empty">No responses yet.</div>';
    });
    return;
  }

  const scores = filtered.map(r => r.score);
  const avg = scores.reduce((a,b) => a+b, 0) / scores.length;
  
  const statAvg = document.getElementById('stat-avg');
  const statGrade = document.getElementById('stat-grade');
  const statHi = document.getElementById('stat-hi');
  const statLo = document.getElementById('stat-lo');
  const statSat = document.getElementById('stat-sat');

  if (statAvg) statAvg.textContent = avg.toFixed(1);
  if (statGrade) statGrade.textContent = gradeLabel(avg);
  if (statHi) statHi.textContent = Math.max(...scores).toFixed(1);
  if (statLo) statLo.textContent = Math.min(...scores).toFixed(1);
  const sats = filtered.filter(r => r.sat).map(r => r.sat);
  if (statSat) {
    statSat.textContent = sats.length ? (sats.reduce((a,b) => a+b, 0) / sats.length).toFixed(1) : '—';
  }

  // Item averages
  const itemAvgBody = document.getElementById('item-avg-body');
  if (itemAvgBody) {
    itemAvgBody.innerHTML = '<div class="item-avg-grid">' + SUS_ITEMS.map(item => {
      const vals = filtered.map(r => r.sus[item.num-1]);
      const iAvg = vals.reduce((a,b) => a+b, 0) / vals.length;
      const pct = ((iAvg - 1) / 4) * 100;
      return `<div class="item-avg-row">
        <span class="item-avg-num">${item.num}</span>
        <div class="item-avg-bar-wrap"><div class="item-avg-bar" style="width:${pct.toFixed(1)}%"></div></div>
        <span class="item-avg-val">${iAvg.toFixed(2)}</span>
        <span class="item-avg-text" title="${item.text}">${item.text.slice(0,65)}${item.text.length > 65 ? '…' : ''}</span>
      </div>`;
    }).join('') + '</div>';
  }

  // Responses table
  const tbody = document.getElementById('resp-tbody');
  if (tbody) {
    tbody.innerHTML = filtered.map((r, i) => {
      const cls = r.score >= 80 ? 'hi' : r.score >= 68 ? 'md' : 'lo';
      return `<tr>
        <td class="table-num-col">${i+1}</td>
        <td>${r.name}</td>
        <td class="table-muted-col">${r.role}</td>
        <td class="table-muted-col">${r.session}</td>
        <td><span class="score-pill ${cls}">${r.score}</span></td>
        <td class="table-mono-col">${r.sat || '—'}</td>
        <td class="table-dim-col">${r.date}</td>
        <td><button onclick="deleteResp(${r.id})" class="table-delete-btn" title="Delete">×</button></td>
      </tr>`;
    }).join('');
  }

  // Feedback
  ['fb-q1','fb-q2','fb-q3','fb-q4'].forEach((id, qi) => {
    const el = document.getElementById(id);
    if (el) {
      const entries = filtered.filter(r => r.fb[qi] && r.fb[qi].trim());
      el.innerHTML = entries.length
        ? entries.map(r => `<div class="fb-entry">${r.fb[qi]}<div class="fb-entry-meta">${r.name} · ${r.session} · ${r.date}</div></div>`).join('')
        : `<div class="fb-entry fb-empty-italic">No responses for this question.</div>`;
    }
  });
}

let confirmResolve = null;
let confirmPendingAction = null;

function showConfirm(title, desc, action) {
  return new Promise((resolve) => {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-desc').textContent = desc;
    document.getElementById('confirm-modal').style.display = 'flex';
    confirmResolve = resolve;
  });
}

function closeConfirm() {
  document.getElementById('confirm-modal').style.display = 'none';
  if (confirmResolve) {
    confirmResolve(false);
    confirmResolve = null;
  }
}

function handleConfirmYes() {
  document.getElementById('confirm-modal').style.display = 'none';
  if (confirmResolve) {
    confirmResolve(true);
    confirmResolve = null;
  }
}

async function deleteResp(id){
  const confirmed = await showConfirm('Delete Response', 'Are you sure you want to delete this response? This cannot be undone.');
  if(!confirmed) return;
  try {
    const res = await fetch(`/.netlify/functions/admin-sus?id=${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': passcode }
    });
    if (!res.ok) throw new Error('Deletion failed');
    
    responses = responses.filter(r => r.id !== id);
    renderDash();
    showToast('Response deleted.');
  } catch (err) {
    showToast('Error deleting response.');
  }
}

async function clearAll(){
  const confirmed = await showConfirm('Clear All Responses', 'Are you sure you want to clear all responses? This cannot be undone.');
  if(!confirmed) return;
  try {
    const res = await fetch('/.netlify/functions/admin-sus', {
      method: 'DELETE',
      headers: { 'Authorization': passcode }
    });
    if (!res.ok) throw new Error('Truncate failed');

    responses = [];
    renderDash();
    showToast('All responses cleared.');
  } catch (err) {
    showToast('Error clearing responses.');
  }
}

function escapeCSV(val) {
  if (val === null || val === undefined) return '';
  let str = String(val);
  str = str.replace(/"/g, '""');
  if (str.includes(',') || str.includes('\n') || str.includes('\r') || str.includes('"')) {
    return `"${str}"`;
  }
  return str;
}

function exportCSV(){
  if(!responses.length){ showToast('No data to export.'); return; }
  const sessFilter = document.getElementById('sess-filter');
  if (!sessFilter) return;
  const data = sessFilter.value === 'all' ? responses : responses.filter(r => r.session === sessFilter.value);
  
  const now = new Date();
  const dateStr = now.toLocaleDateString() + ' ' + now.toLocaleTimeString();
  
  // Compute overall stats for the exported dataset
  const scores = data.map(r => r.score);
  const avgScore = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '0.0';
  const grade = scores.length ? gradeLabel(parseFloat(avgScore)) : 'N/A';
  const sats = data.filter(r => r.sat).map(r => r.sat);
  const avgSat = sats.length ? (sats.reduce((a, b) => a + b, 0) / sats.length).toFixed(1) : 'N/A';

  // Construct metadata rows
  const metadata = [
    ['EZQueue System Usability Scale (SUS) Survey Export Report'],
    ['Generated On', dateStr],
    ['Target Session', sessFilter.value === 'all' ? 'All Sessions' : sessFilter.value],
    ['Total Exported Responses', data.length],
    ['Average SUS Score', `${avgScore} (${grade})`],
    ['Average Satisfaction Rating', `${avgSat} / 10`],
    [], // Empty row separating metadata from the dataset
  ];

  const csvRows = [];
  metadata.forEach(row => {
    csvRows.push(row.map(escapeCSV).join(','));
  });

  const hdr = ['ID', 'Name', 'Role', 'Session', 'Date', 'SUS Score', 'Grade', 'Satisfaction', ...SUS_ITEMS.map(i => `Item ${i.num}`), 'Q1 Liked', 'Q2 Challenged', 'Q3 Suggestions', 'Q4 Other'];
  csvRows.push(hdr.map(escapeCSV).join(','));

  data.forEach(r => {
    const row = [
      r.id,
      r.name,
      r.role,
      r.session,
      r.date,
      r.score,
      gradeLabel(r.score),
      r.sat || '',
      ...r.sus,
      r.fb[0] || '',
      r.fb[1] || '',
      r.fb[2] || '',
      r.fb[3] || ''
    ];
    csvRows.push(row.map(escapeCSV).join(','));
  });

  const csvContent = csvRows.join('\n');
  
  // Download using UTF-8 BOM so Excel displays correctly
  const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `EZQueue_SUS_${sessFilter.value.replace(/[^a-z0-9_-]/gi, '_')}_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Excel/CSV exported!');
}

function showToast(msg){
  const t = document.getElementById('toast');
  if (t) {
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2800);
  }
}

// Automatically verify if passcode is already stored in session
document.addEventListener('DOMContentLoaded', () => {
  if (passcode) {
    const passcodeField = document.getElementById('admin-passcode');
    if (passcodeField) {
      passcodeField.value = passcode;
    }
    verifyPasscode();
  }
});

async function fetchActiveSession() {
  try {
    const res = await fetch('/.netlify/functions/submit-sus');
    if (res.ok) {
      const data = await res.json();
      const input = document.getElementById('active-session-input');
      if (input && data.active_session) {
        input.value = data.active_session;
      }
    }
  } catch (err) {
    console.error('Failed to fetch active session:', err);
  }
}

async function saveActiveSession() {
  const input = document.getElementById('active-session-input');
  if (!input) return;
  const val = input.value.trim();
  if (!val) {
    showToast('Please enter a session name.');
    return;
  }

  const btn = document.querySelector('.btn-save-session');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Saving...';
  }

  try {
    const res = await fetch('/.netlify/functions/admin-sus', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': passcode
      },
      body: JSON.stringify({ active_session: val })
    });

    if (!res.ok) throw new Error('Failed to update active session');

    showToast('Active session updated!');
  } catch (err) {
    showToast('Error updating active session.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Update Active Session';
    }
  }
}
