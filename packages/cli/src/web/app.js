/* maci ui frontend — vanilla JS, no build step */

(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  // ── Tabs ──────────────────────────────────────────────────────────────────

  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-panel').forEach((p) => {
        p.classList.toggle('active', p.id === `tab-${btn.dataset.tab}`);
      });
    });
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function badge(kind, label) {
    return `<span class="badge ${kind}">${label}</span>`;
  }

  function matchBadge(value) {
    if (value === null || value === undefined) return badge('na', 'N/A');
    return value ? badge('pass', 'MATCH') : badge('fail', 'MISMATCH');
  }

  // ── Round verification ────────────────────────────────────────────────────

  const verifyForm = $('#verify-form');
  const verifyBtn = $('#verify-btn');
  const banner = $('#verify-banner');
  const errorCard = $('#verify-error');
  const stepsCard = $('#steps-card');
  const stepsList = $('#steps');
  const summaryCard = $('#summary-card');
  const summaryEl = $('#summary');
  const reportCard = $('#report-card');
  const checksBody = $('#checks');

  let currentSource = null;
  let lastResult = null;

  function resetVerifyView() {
    banner.classList.add('hidden');
    errorCard.classList.add('hidden');
    summaryCard.classList.add('hidden');
    reportCard.classList.add('hidden');
    stepsList.innerHTML = '';
    summaryEl.innerHTML = '';
    checksBody.innerHTML = '';
    stepsCard.classList.remove('hidden');
    lastResult = null;
  }

  function stepRow(step) {
    let li = stepsList.querySelector(`li[data-step="${step}"]`);
    if (!li) {
      li = el('li');
      li.dataset.step = String(step);
      li.appendChild(el('span', 'step-icon'));
      li.appendChild(el('span', 'step-label'));
      li.appendChild(el('span', 'step-detail'));
      stepsList.appendChild(li);
    }
    return li;
  }

  function renderSummary(summary) {
    const fields = [
      ['Contract', summary.contractAddress],
      ['Network', summary.network],
      ['Circuit', `${summary.circuitPower}  (${summary.circuitName})`],
      ['Status', summary.status],
      ['Operator', summary.operatorAddress],
      ['Voting', `${summary.votingStart}  \u2192  ${summary.votingEnd}`],
      ['Sign-ups', `on-chain ${summary.signUpsOnChain}  /  indexed ${summary.signUpsIndexed}`],
      ['Messages', `on-chain ${summary.messagesOnChain}  /  indexed ${summary.messagesIndexed}`],
    ];
    summaryEl.innerHTML = '';
    for (const [k, v] of fields) {
      summaryEl.appendChild(el('dt', null, k));
      summaryEl.appendChild(el('dd', null, v));
    }
    summaryCard.classList.remove('hidden');
  }

  function renderReport(report) {
    checksBody.innerHTML = '';
    for (const check of report.checks) {
      const tr = el('tr');
      const tdLabel = el('td');
      tdLabel.appendChild(el('div', 'check-label', check.label));
      if (check.detail) tdLabel.appendChild(el('div', 'check-detail', check.detail));
      const tdStatus = el('td');
      tdStatus.innerHTML = check.passed ? badge('pass', 'PASS') : badge('fail', 'FAIL');
      tr.appendChild(tdLabel);
      tr.appendChild(tdStatus);
      checksBody.appendChild(tr);
    }
    reportCard.classList.remove('hidden');

    banner.textContent = report.overallPassed ? 'Result: VERIFIED \u2713' : 'Result: FAILED \u2717';
    banner.className = `banner ${report.overallPassed ? 'pass' : 'fail'}`;
  }

  function finishVerify() {
    verifyBtn.disabled = false;
    verifyBtn.textContent = 'Verify round';
    if (currentSource) {
      currentSource.close();
      currentSource = null;
    }
  }

  verifyForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (currentSource) currentSource.close();

    const params = new URLSearchParams({
      contract: $('#contract').value.trim(),
      network: $('#network').value,
      recheck: $('#recheck').checked ? 'true' : 'false',
    });
    const rpc = $('#rpc').value.trim();
    const indexer = $('#indexer').value.trim();
    if (rpc) params.set('rpc', rpc);
    if (indexer) params.set('indexer', indexer);

    resetVerifyView();
    verifyBtn.disabled = true;
    verifyBtn.textContent = 'Verifying\u2026';

    const source = new EventSource(`/api/verify?${params}`);
    currentSource = source;

    source.addEventListener('step:start', (e) => {
      const ev = JSON.parse(e.data);
      const li = stepRow(ev.step);
      li.className = 'running';
      li.querySelector('.step-label').textContent = `[${ev.step}/${ev.total}] ${ev.label}`;
    });

    source.addEventListener('step:update', (e) => {
      const ev = JSON.parse(e.data);
      stepRow(ev.step).querySelector('.step-detail').textContent = `  ${ev.detail}`;
    });

    source.addEventListener('step:done', (e) => {
      const ev = JSON.parse(e.data);
      const li = stepRow(ev.step);
      li.className = 'done';
      li.querySelector('.step-icon').textContent = '\u2713';
      if (ev.detail) li.querySelector('.step-detail').textContent = `  ${ev.detail}`;
    });

    source.addEventListener('step:fail', (e) => {
      const ev = JSON.parse(e.data);
      const li = stepRow(ev.step);
      li.className = 'fail';
      li.querySelector('.step-icon').textContent = '\u2717';
      if (ev.detail) li.querySelector('.step-detail').textContent = `  ${ev.detail}`;
    });

    source.addEventListener('summary', (e) => {
      renderSummary(JSON.parse(e.data).summary);
    });

    source.addEventListener('report', (e) => {
      renderReport(JSON.parse(e.data).report);
    });

    source.addEventListener('result', (e) => {
      const result = JSON.parse(e.data);
      lastResult = result;
      if (result.status === 'error') {
        errorCard.textContent = `Error: ${result.message}`;
        errorCard.classList.remove('hidden');
      }
      finishVerify();
    });

    source.onerror = () => {
      // EventSource fires error on normal stream close too; only report if
      // we never received a terminal "result" event.
      if (currentSource === source && lastResult === null) {
        errorCard.textContent = 'Error: connection to local server lost.';
        errorCard.classList.remove('hidden');
      }
      finishVerify();
    };
  });

  $('#export-btn').addEventListener('click', () => {
    if (!lastResult || lastResult.status !== 'completed') return;
    const blob = new Blob([JSON.stringify(lastResult, null, 2)], { type: 'application/json' });
    const a = el('a');
    a.href = URL.createObjectURL(blob);
    const addr = lastResult.report.contractAddress;
    a.download = `maci-verification-${addr.slice(0, 12)}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // ── Registry ──────────────────────────────────────────────────────────────

  const registryRows = $('#registry-rows');
  const circuitDetail = $('#circuit-detail');

  async function loadRegistry() {
    try {
      const res = await fetch('/api/registry');
      const data = await res.json();
      registryRows.innerHTML = '';
      for (const c of data.circuits) {
        const tr = el('tr');
        tr.dataset.power = c.label;
        tr.innerHTML =
          `<td>${c.label}</td>` +
          `<td>${c.production ? badge('pass', 'production') : badge('warn', 'test-only')}</td>` +
          `<td>${c.params.stateTreeDepth}</td>` +
          `<td>${c.params.intStateTreeDepth}</td>` +
          `<td>${c.params.voteOptionTreeDepth}</td>` +
          `<td>${c.params.messageBatchSize}</td>`;
        tr.addEventListener('click', () => showCircuit(c.label));
        registryRows.appendChild(tr);
      }
    } catch {
      registryRows.innerHTML = '<tr><td colspan="6">Failed to load registry.</td></tr>';
    }
  }

  async function showCircuit(power) {
    const res = await fetch(`/api/registry/${encodeURIComponent(power)}`);
    if (!res.ok) return;
    const entry = await res.json();

    circuitDetail.innerHTML = '';
    circuitDetail.appendChild(el('h3', null, `Circuit Detail: ${entry.label}`));

    const kv = el('dl', 'kv-grid');
    const rows = [
      ['Status', entry.production ? 'production' : 'test-only'],
      ['Source', entry.source],
      ['Zkey URL', entry.zkeyUrl],
      ['Zkey SHA-256', entry.zkeyTarSha256],
      ['state_tree_depth', String(entry.params.stateTreeDepth)],
      ['int_state_tree_depth', String(entry.params.intStateTreeDepth)],
      ['vote_option_tree_depth', String(entry.params.voteOptionTreeDepth)],
      ['message_batch_size', String(entry.params.messageBatchSize)],
    ];
    for (const [k, v] of rows) {
      kv.appendChild(el('dt', null, k));
      const dd = el('dd');
      if (k === 'Zkey URL') {
        const a = el('a', null, v);
        a.href = v;
        a.target = '_blank';
        a.rel = 'noopener';
        dd.appendChild(a);
      } else {
        dd.textContent = v;
      }
      kv.appendChild(dd);
    }
    circuitDetail.appendChild(kv);

    const vkeyNames = [
      ['process', 'Process vkey (Groth16)'],
      ['tally', 'Tally vkey (Groth16)'],
      ['deactivate', 'Deactivate vkey (Groth16)'],
      ['addNewKey', 'AddNewKey vkey (Groth16)'],
    ];
    for (const [key, title] of vkeyNames) {
      const group = el('div', 'vkey-group');
      group.appendChild(el('h4', null, title));
      for (const [field, value] of Object.entries(entry.vkeys[key])) {
        const line = el('div', 'vkey-line');
        line.innerHTML = `<b>${field}</b>: ${value.slice(0, 48)}\u2026`;
        line.title = value;
        group.appendChild(line);
      }
      circuitDetail.appendChild(group);
    }

    circuitDetail.classList.remove('hidden');
    circuitDetail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ── Registry check ────────────────────────────────────────────────────────

  const checkForm = $('#check-form');
  const checkBtn = $('#check-btn');
  const checkResult = $('#check-result');

  checkForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const contract = $('#check-contract').value.trim();
    const network = $('#check-network').value;
    if (!contract) return;

    checkBtn.disabled = true;
    checkBtn.textContent = 'Checking\u2026';
    checkResult.classList.add('hidden');

    try {
      const params = new URLSearchParams({ contract, network });
      const res = await fetch(`/api/registry/check?${params}`);
      const data = await res.json();

      if (!res.ok) {
        checkResult.innerHTML = `<div class="error-card card">${data.error ?? 'Request failed'}</div>`;
      } else {
        const statusBadge = data.production
          ? badge('pass', 'production')
          : badge('warn', data.found ? 'test/legacy' : 'unknown');
        const kv = [
          ['Circuit power', `<code>${data.power}</code> ${statusBadge}`],
          ['Source', `<code>${data.source}</code>`],
          ['Process vkey', matchBadge(data.processMatch)],
          ['Tally vkey', matchBadge(data.tallyMatch)],
          ['Deactivate vkey', matchBadge(data.deactivateMatch)],
          ['AddNewKey vkey', matchBadge(data.addNewKeyMatch)],
        ];
        let html = '<dl class="kv-grid">';
        for (const [k, v] of kv) html += `<dt>${k}</dt><dd>${v}</dd>`;
        html += '</dl>';
        if (!data.found) {
          html +=
            '<p class="dim small">Warning: no matching circuit found in the aMACI registry. ' +
            'This contract may use an unregistered or custom circuit.</p>';
        }
        checkResult.innerHTML = html;
      }
    } catch (err) {
      checkResult.innerHTML = `<div class="error-card card">${err.message ?? String(err)}</div>`;
    }

    checkResult.classList.remove('hidden');
    checkBtn.disabled = false;
    checkBtn.textContent = 'Check vkeys';
  });

  loadRegistry();
})();
