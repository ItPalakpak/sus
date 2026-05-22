const SUS_ITEMS = [
  { num:1,  text:"I think that I would like to use this system frequently.",                                               rev:false },
  { num:2,  text:"I found the system unnecessarily complex.",                                                              rev:true  },
  { num:3,  text:"I thought the system was easy to use.",                                                                  rev:false },
  { num:4,  text:"I think that I would need the support of a technical person to be able to use this system.",             rev:true  },
  { num:5,  text:"I found the various functions in this system were well integrated.",                                      rev:false },
  { num:6,  text:"I thought there was too much inconsistency in this system.",                                             rev:true  },
  { num:7,  text:"I would imagine that most people would learn to use this system very quickly.",                           rev:false },
  { num:8,  text:"I found the system very cumbersome or heavy to use.",                                                             rev:true  },
  { num:9,  text:"I felt very confident using the system.",                                                                rev:false },
  { num:10, text:"I needed to learn a lot of things before I could get going with this system.",                           rev:true  },
];
const RLBLS = ["SD","D","N","A","SA"];

// Build SUS items in DOM
document.addEventListener('DOMContentLoaded', () => {
  const susEl = document.getElementById('sus-items');
  if (susEl) {
    SUS_ITEMS.forEach((item, idx) => {
      const d = document.createElement('div');
      d.className = 'sus-item';
      d.id = 'si-' + item.num;
      d.innerHTML = `
        <div class="item-num">${item.num}</div>
        <div class="item-text">${item.text}${item.rev ? '<span class="rtag">R</span>' : ''}</div>
        <div class="radios">
          ${[1,2,3,4,5].map(v => `
            <label class="rb" title="${['Strongly disagree','Disagree','Neutral','Agree','Strongly agree'][v-1]}">
              <input type="radio" name="sus${item.num}" value="${v}" onchange="updateScore()">
              <div class="rbc">${v}</div>
              ${idx === 0 ? `<div class="rb-l">${RLBLS[v-1]}</div>` : ''}
            </label>`).join('')}
        </div>`;
      susEl.appendChild(d);
    });
  }

  // Build satisfaction options in DOM
  const satEl = document.getElementById('sat-row');
  if (satEl) {
    for(let i = 1; i <= 10; i++){
      const lb = document.createElement('label');
      lb.className = 'sb';
      lb.innerHTML = `<input type="radio" name="sat" value="${i}"><div class="sbc">${i}</div>`;
      satEl.appendChild(lb);
    }
  }

  const dateEl = document.getElementById('session-date');
  if (dateEl) {
    dateEl.valueAsDate = new Date();
  }

  // Fetch active session from backend settings
  const sessionEl = document.getElementById('session-name');
  if (sessionEl) {
    fetch('/.netlify/functions/submit-sus')
      .then(res => res.json())
      .then(data => {
        if (data && data.active_session) {
          sessionEl.value = data.active_session;
        } else {
          sessionEl.value = 'Session 1';
        }
      })
      .catch(() => {
        sessionEl.value = 'Session 1';
      });
  }
});

function updateScore(){
  let answered = 0, total = 0;
  SUS_ITEMS.forEach(item => {
    const sel = document.querySelector(`input[name="sus${item.num}"]:checked`);
    if(sel){
      answered++;
      const v = parseInt(sel.value);
      total += item.rev ? (5 - v) : (v - 1);
      document.getElementById('si-' + item.num).classList.add('answered');
    } else {
      document.getElementById('si-' + item.num).classList.remove('answered');
    }
  });
  const pct = Math.round(answered / 10 * 100);
  document.getElementById('prog-fill').style.width = pct + '%';
  document.getElementById('prog-text').textContent = `${answered} of 10 answered`;
  document.getElementById('prog-pct').textContent = pct + '%';

  if(answered < 10){ document.getElementById('score-panel').style.display = 'none'; return; }
  const score = total * 2.5;
  document.getElementById('score-panel').style.display = 'flex';
  document.getElementById('score-big').textContent = score.toFixed(1);
  document.getElementById('score-fill2').style.width = score + '%';
  let g, d;
  if(score >= 90)      { g = 'Best Imaginable (A+)'; d = 'Outstanding — users find the system exemplary.'; }
  else if(score >= 85) { g = 'Excellent (A)';         d = 'Excellent usability — performs very well.'; }
  else if(score >= 80) { g = 'Good (B)';              d = 'Good usability — above industry average.'; }
  else if(score >= 70) { g = 'Okay (C)';              d = 'Acceptable — some improvements recommended.'; }
  else if(score >= 68) { g = 'Above Average';          d = 'Just above the 68-point benchmark threshold.'; }
  else if(score >= 60) { g = 'Below Average (D)';     d = 'Usability concerns — improvements needed before deployment.'; }
  else                 { g = 'Poor / Unacceptable (F)'; d = 'Significant issues — core design needs rethinking.'; }
  document.getElementById('score-grade').textContent = g;
  document.getElementById('score-desc').textContent = d;
}

function computeSUS(susVals){
  let total = 0;
  SUS_ITEMS.forEach((item, i) => {
    const v = susVals[i];
    total += item.rev ? (5 - v) : (v - 1);
  });
  return parseFloat((total * 2.5).toFixed(1));
}

async function submitForm(){
  const btn = document.getElementById('submit-btn');
  const err = document.getElementById('err-submit');
  err.classList.remove('show');

  const susVals = SUS_ITEMS.map(item => {
    const sel = document.querySelector(`input[name="sus${item.num}"]:checked`);
    return sel ? parseInt(sel.value) : null;
  });
  if(susVals.some(v => v === null)){ showToast('Please answer all 10 SUS items.'); return; }
  
  const role = document.getElementById('r-role').value;
  if(!role){ showToast('Please select your role.'); return; }

  // Client-side rate limit check: max 5 per device
  const subCount = parseInt(localStorage.getItem('sus_survey_submissions') || '0');
  if (subCount >= 5) {
    err.textContent = '⚠ You have already submitted the maximum number of responses (5) from this device.';
    err.classList.add('show');
    btn.disabled = true;
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Submitting…';

  const score = computeSUS(susVals);
  const sat = document.querySelector('input[name="sat"]:checked');
  const session = document.getElementById('session-name').value || 'Session 1';
  const date = document.getElementById('session-date').value || new Date().toISOString().slice(0,10);
  
  const payload = {
    session, date,
    name: document.getElementById('r-name').value.trim() || 'Anonymous',
    role: role,
    sus: susVals, 
    score,
    sat: sat ? parseInt(sat.value) : null,
    fb: [
      document.getElementById('fb1').value.trim(),
      document.getElementById('fb2').value.trim(),
      document.getElementById('fb3').value.trim(),
      document.getElementById('fb4').value.trim()
    ]
  };

  try {
    const res = await fetch('/.netlify/functions/submit-sus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      if (res.status === 429) {
        err.textContent = `⚠ ${errorData.detail || 'Limit reached or survey closed.'}`;
        err.classList.add('show');
        btn.disabled = true;
        btn.textContent = 'Closed';
        return;
      }
      throw new Error(errorData.detail || errorData.error || 'Database insertion failed');
    }

    // Track submission count in localStorage
    localStorage.setItem('sus_survey_submissions', subCount + 1);

    document.getElementById('form-body').style.display = 'none';
    document.getElementById('thank-you').style.display = 'block';
    showToast('Response saved!');
  } catch (e) {
    err.textContent = `⚠ Submission failed: ${e.message}`;
    err.classList.add('show');
    btn.disabled = false;
    btn.textContent = 'Submit Response →';
  }
}

function resetForm(){
  document.getElementById('form-body').style.display = 'block';
  document.getElementById('thank-you').style.display = 'none';
  document.getElementById('r-name').value = '';
  document.getElementById('r-role').value = '';
  SUS_ITEMS.forEach(item => {
    document.querySelectorAll(`input[name="sus${item.num}"]`).forEach(r => r.checked = false);
    document.getElementById('si-' + item.num).classList.remove('answered');
  });
  document.querySelectorAll('input[name="sat"]').forEach(r => r.checked = false);
  ['fb1','fb2','fb3','fb4'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('score-panel').style.display = 'none';
  document.getElementById('prog-fill').style.width = '0%';
  document.getElementById('prog-text').textContent = '0 of 10 answered';
  document.getElementById('prog-pct').textContent = '0%';
  
  // Re-enable submit button if below limit
  const subCount = parseInt(localStorage.getItem('sus_survey_submissions') || '0');
  const btn = document.getElementById('submit-btn');
  if (subCount < 5) {
    btn.disabled = false;
    btn.textContent = 'Submit Response →';
  }
}

function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}
