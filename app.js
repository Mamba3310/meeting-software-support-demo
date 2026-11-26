(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
  const SETTINGS_KEY = 'northstar.support.api-url';
  const ADMIN_KEY = 'northstar.support.admin-key';
  const devices = [
    { name:'DESKTOP-9B25UVA', user:'HP', os:'Windows 11', ip:'10.20.4.18', battery:96, status:'Online' },
    { name:'DESKTOP-0U6E7S9', user:'Kim', os:'Windows 10', ip:'10.20.4.23', battery:72, status:'In session' },
    { name:'ABBY-PC', user:'Abby', os:'Windows 11', ip:'Last IP 10.20.4.31', battery:null, status:'Offline' },
    { name:'MACBOOK-PRO-14', user:'Jordan', os:'macOS 14', ip:'192.168.1.42', battery:54, status:'Online' },
    { name:'TREMAINE-FS-02', user:'Alex', os:'Windows Server 2022', ip:'10.20.4.5', battery:null, status:'Online' },
    { name:'WORKSTATION-17', user:'Taylor', os:'Ubuntu 24.04', ip:'Last IP 10.20.4.42', battery:null, status:'Offline' }
  ];
  let toastTimer;
  let visitorStream = null;
  let links = [];
  const params = new URLSearchParams(location.search);
  const visitorToken = params.get('visitor');

  function apiBase() {
    const fromVisitor = params.get('api');
    const fromInput = $('#api-url')?.value.trim();
    const configured = fromVisitor || fromInput || localStorage.getItem(SETTINGS_KEY) || '';
    return (configured || location.origin).replace(/\/+$/, '');
  }
  function adminKey() { return sessionStorage.getItem(ADMIN_KEY) || $('#admin-key')?.value || ''; }
  function apiHeaders(json = false) {
    const headers = {};
    if (json) headers['content-type'] = 'application/json';
    if (!visitorToken && adminKey()) headers['x-admin-key'] = adminKey();
    return headers;
  }
  async function api(path, options = {}) {
    let response;
    try { response = await fetch(`${apiBase()}${path}`, { ...options, headers:{ ...apiHeaders(Boolean(options.body)), ...(options.headers || {}) } }); }
    catch { throw new Error('Can’t reach the backend. Check the backend URL and that the service is running.'); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Backend request failed (${response.status}).`);
    return data;
  }
  function saveSettings() {
    const base = $('#api-url')?.value.trim();
    const key = $('#admin-key')?.value;
    if (base) localStorage.setItem(SETTINGS_KEY, base.replace(/\/+$/, ''));
    if (key) sessionStorage.setItem(ADMIN_KEY, key);
  }
  function toast(message) {
    const node = $('#toast');
    if (!node) return;
    node.textContent = message; node.classList.add('visible'); clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('visible'), 3200);
  }
  function visitorUrl(link) {
    const url = new URL(location.href); url.search = ''; url.hash = '';
    url.searchParams.set('visitor', link.token);
    const configured = $('#api-url')?.value.trim() || localStorage.getItem(SETTINGS_KEY) || '';
    if (configured) url.searchParams.set('api', configured.replace(/\/+$/, ''));
    return url.href;
  }
  function setApiStatus(message, connected = false) {
    const node = $('#api-status');
    if (node) { node.textContent = message; node.classList.toggle('connected', connected); }
  }
  async function refreshLinks() {
    const result = await api('/api/links');
    links = result.links || [];
    renderLinks(); setApiStatus(`Connected · ${links.length} visitor link${links.length === 1 ? '' : 's'}`, true);
  }
  function renderDevices() {
    const query = ($('#device-search')?.value || '').trim().toLowerCase();
    const filtered = devices.filter(device => `${device.name} ${device.user} ${device.os} ${device.ip}`.toLowerCase().includes(query));
    const rows = filtered.map(device => {
      const battery = device.battery === null ? '<span class="cell-muted">—</span>' : `<span class="battery-cell"><i><b style="width:${device.battery}%"></b></i>${device.battery}%</span>`;
      const stateClass = device.status.toLowerCase().replace(' ', '-');
      return `<div class="device-row"><span class="device-primary"><span class="device-icon">${device.os.startsWith('mac') ? '▱' : device.os.startsWith('Ubuntu') ? '⌘' : '▣'}</span><span class="device-copy"><strong>${esc(device.name)}</strong><small>${esc(device.os)}</small></span></span><span class="device-user"><strong>${esc(device.user)}</strong></span><span class="device-ip">${esc(device.ip)}</span>${battery}<span class="device-status ${stateClass}"><i></i>${esc(device.status)}</span></div>`;
    }).join('') || '<div class="empty-links">No matching devices.</div>';
    if ($('#device-list')) $('#device-list').innerHTML = rows;
    if ($('#compact-devices')) $('#compact-devices').innerHTML = filtered.slice(0, 3).map(device => `<div class="compact-device"><span class="status-dot ${device.status.toLowerCase().replace(' ', '-')} "></span><strong>${esc(device.name)}</strong><small>${esc(device.status)}</small></div>`).join('');
  }
  function renderLinks() {
    const rows = links.map(link => {
      const state = link.status || 'Waiting';
      return `<article class="session-row"><span class="session-mark">${state === 'Sharing' ? '◉' : state === 'Approved' ? '✓' : '↗'}</span><span class="session-info"><strong>${esc(link.email || 'Visitor link')}</strong><small>Created ${esc(link.createdAt || 'recently')} · stays active until revoked</small><span class="session-url">${esc(visitorUrl(link))}</span></span><span class="session-badge state-${state.toLowerCase()}"><i></i>${esc(state)}</span><span class="session-actions"><button class="copy-link" type="button" data-copy-token="${esc(link.token)}">Copy link</button><button class="revoke-link" type="button" data-revoke-token="${esc(link.token)}">Revoke</button></span></article>`;
    }).join('');
    const empty = '<div class="empty-links"><span>↗</span><strong>No visitor links yet</strong><small>Invite one or more visitors with a single action.</small></div>';
    ['#overview-sessions', '#all-sessions'].forEach(selector => { if ($(selector)) $(selector).innerHTML = rows || empty; });
    if ($('#waiting-count')) $('#waiting-count').textContent = String(links.filter(link => (link.status || 'Waiting') === 'Waiting').length);
    if ($('#approval-count')) $('#approval-count').textContent = String(links.filter(link => ['Approved', 'Sharing'].includes(link.status)).length);
    if ($('#session-nav-count')) $('#session-nav-count').textContent = String(links.filter(link => ['Waiting', 'Approved', 'Sharing'].includes(link.status)).length);
  }
  function showModal({ title, copy, content = '', action = 'Done' }) {
    $('#modal-title').textContent = title; $('#modal-copy').textContent = copy;
    $('#modal-content').innerHTML = content; $('#modal-action').textContent = action;
    $('#detail-modal').showModal();
  }
  function parseEmails(text) {
    const emails = text.split(/[\s,;]+/).map(value => value.trim().toLowerCase()).filter(Boolean);
    const unique = [...new Set(emails)];
    if (!unique.length) throw new Error('Enter at least one visitor email.');
    if (unique.length > 50) throw new Error('Invite up to 50 email addresses at a time.');
    const invalid = unique.filter(email => email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
    if (invalid.length) throw new Error(`Check these email addresses: ${invalid.slice(0, 3).join(', ')}`);
    return unique;
  }
  async function createLinks() {
    const buttons = [...document.querySelectorAll('[data-action="create-link"]')];
    try {
      const emails = parseEmails($('#visitor-emails')?.value || '');
      saveSettings();
      buttons.forEach(button => button.setAttribute('disabled', ''));
      const result = await api('/api/links', { method:'POST', body:JSON.stringify({ emails }) });
      links = [...(result.links || []), ...links]; renderLinks();
      const created = result.links || [];
      const inviteRows = created.map(link => `<div class="bulk-invite-row"><strong>${esc(link.email)}</strong><input readonly value="${esc(visitorUrl(link))}"><button type="button" class="copy-link" data-copy-token="${esc(link.token)}">Copy</button></div>`).join('');
      showModal({ title:`${created.length} visitor invite${created.length === 1 ? '' : 's'} created`, copy:'Send each visitor their individual link. Links remain active until you revoke them.', content:`<div class="bulk-invite-list">${inviteRows}</div>` });
      $('#modal-action').onclick = event => { event.preventDefault(); $('#detail-modal').close(); };
      toast(`${created.length} invitation${created.length === 1 ? '' : 's'} created.`);
    } catch (error) { toast(error.message); if (/admin|authorization/i.test(error.message)) setApiStatus('Enter the backend dashboard access key.', false); }
    finally { buttons.forEach(button => button.removeAttribute('disabled')); }
  }
  async function copyLink(link) {
    const text = visitorUrl(link);
    try { await navigator.clipboard.writeText(text); toast('Visitor link copied.'); }
    catch {
      const field = document.createElement('textarea'); field.value = text; field.setAttribute('readonly', '');
      field.style.position = 'fixed'; field.style.opacity = '0'; document.body.append(field); field.select();
      const copied = document.execCommand('copy'); field.remove();
      if (copied) toast('Visitor link copied.');
      else showModal({ title:'Copy this visitor link', copy:'Select and copy the link to send it to your visitor.', content:`<div class="share-box"><input readonly value="${esc(text)}"></div>` });
    }
  }
  function setView(view) {
    document.querySelectorAll('.view').forEach(panel => panel.classList.toggle('active', panel.id === `view-${view}`));
    document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === view));
    if ($('#current-view')) $('#current-view').textContent = ({ overview:'Overview', sessions:'Visitor links', devices:'Devices', meetings:'Meetings', activity:'Activity' })[view] || 'Overview';
    $('#sidebar')?.classList.remove('open');
  }
  async function visitorMode(token) {
    $('#leader-app').hidden = true; $('#visitor-app').hidden = false;
    const state = $('#visitor-state');
    try {
      const result = await api(`/api/visitor/${encodeURIComponent(token)}`);
      const link = result.link;
      $('#visitor-copy').textContent = link.email ? `Alex Morgan from Tremaine Services invited ${link.email} to a support session.` : 'Alex Morgan from Tremaine Services invited you to a support session.';
      if (['Declined', 'Ended'].includes(link.status)) {
        $('#visitor-approve').hidden = true; $('#visitor-decline').hidden = true; state.hidden = false;
        state.textContent = link.status === 'Declined' ? 'You declined this support request.' : 'Screen sharing has ended.'; return;
      }
      if (link.status === 'Sharing') {
        $('#visitor-approve').hidden = true; $('#visitor-decline').hidden = true; state.hidden = false;
        state.textContent = 'Screen sharing was approved in another visitor page. Start sharing again here only if requested.';
      }
      $('#visitor-approve').addEventListener('click', async () => {
        if (!navigator.mediaDevices?.getDisplayMedia) { state.hidden = false; state.textContent = 'Screen sharing is unavailable. Open this page in a supported browser over HTTPS.'; return; }
        try {
          visitorStream = await navigator.mediaDevices.getDisplayMedia({ video:true, audio:false });
          try { await api(`/api/visitor/${encodeURIComponent(token)}`, { method:'POST', body:JSON.stringify({ status:'Sharing' }) }); }
          catch (error) { visitorStream.getTracks().forEach(track => track.stop()); visitorStream = null; throw error; }
          $('#visitor-approve').hidden = true; $('#screen-preview').srcObject = visitorStream; $('#screen-preview').hidden = false;
          state.hidden = false; state.innerHTML = '<span class="share-live-dot"></span> Screen sharing approved in this browser.';
          const stop = document.createElement('button'); stop.className = 'button stop-share'; stop.type = 'button'; stop.textContent = 'Stop sharing';
          stop.addEventListener('click', () => visitorStream?.getTracks().forEach(track => track.stop())); state.append(' ', stop);
          visitorStream.getVideoTracks()[0]?.addEventListener('ended', async () => {
            visitorStream = null; await api(`/api/visitor/${encodeURIComponent(token)}`, { method:'POST', body:JSON.stringify({ status:'Ended' }) }).catch(() => {});
            $('#screen-preview').hidden = true; state.textContent = 'Screen sharing has ended.';
          });
        } catch (error) { state.hidden = false; state.textContent = error.name === 'NotAllowedError' ? 'Screen sharing was declined. Nothing was shared.' : error.message || 'Could not start screen sharing.'; }
      });
      $('#visitor-decline').addEventListener('click', async () => {
        try { await api(`/api/visitor/${encodeURIComponent(token)}`, { method:'POST', body:JSON.stringify({ status:'Declined' }) });
          $('#visitor-approve').hidden = true; $('#visitor-decline').hidden = true; state.hidden = false; state.textContent = 'Request declined. Nothing was shared.';
        } catch (error) { state.hidden = false; state.textContent = error.message; }
      });
    } catch (error) {
      $('#visitor-title').textContent = 'Support link unavailable';
      $('#visitor-copy').textContent = error.message.includes('Can’t reach') ? 'The support service could not be reached. Try again later.' : 'Ask your support contact to check this invitation.';
      $('#visitor-approve').hidden = true; $('#visitor-decline').hidden = true;
    }
  }
  async function handleLinkAction(event) {
    const copy = event.target.closest('[data-copy-token]'); const revoke = event.target.closest('[data-revoke-token]');
    if (!copy && !revoke) return;
    const token = (copy || revoke).dataset[copy ? 'copyToken' : 'revokeToken'];
    const link = links.find(item => item.token === token);
    if (copy) {
      if (link) return copyLink(link);
      const item = links.find(value => value.token === token);
      if (item) return copyLink(item);
      const urlField = copy.closest('.bulk-invite-row')?.querySelector('input');
      if (urlField) { try { await navigator.clipboard.writeText(urlField.value); toast('Visitor link copied.'); } catch { urlField.select(); document.execCommand('copy'); toast('Visitor link copied.'); } }
      return;
    }
    if (revoke) {
      try { await api(`/api/links/${encodeURIComponent(token)}`, { method:'DELETE' }); await refreshLinks(); toast('Visitor link revoked.'); }
      catch (error) { toast(error.message); }
    }
  }
  async function connectDashboard() {
    try { saveSettings(); await refreshLinks(); }
    catch (error) { links = []; renderLinks(); setApiStatus(error.message, false); }
  }

  document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
  document.querySelectorAll('[data-view-link]').forEach(button => button.addEventListener('click', () => setView(button.dataset.viewLink)));
  document.querySelectorAll('[data-action="create-link"]').forEach(button => button.addEventListener('click', createLinks));
  ['#overview-sessions', '#all-sessions', '#modal-content'].forEach(selector => $(selector)?.addEventListener('click', handleLinkAction));
  $('#device-search')?.addEventListener('input', renderDevices);
  $('#mobile-menu')?.addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  $('#detail-modal')?.addEventListener('click', event => { if (event.target === $('#detail-modal')) $('#detail-modal').close(); });
  $('#api-url')?.addEventListener('change', connectDashboard);
  $('#admin-key')?.addEventListener('change', connectDashboard);
  if ($('#api-url')) $('#api-url').value = localStorage.getItem(SETTINGS_KEY) || '';
  if ($('#admin-key')) $('#admin-key').value = sessionStorage.getItem(ADMIN_KEY) || '';
  if (visitorToken) visitorMode(visitorToken);
  else { renderDevices(); connectDashboard(); setInterval(() => refreshLinks().catch(() => {}), 5000); }
})();
