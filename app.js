(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
  const STORAGE_KEY = 'northstar.support.links.v1';
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
  let links = loadLinks();

  function loadLinks() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.filter(item => item && typeof item.token === 'string').map(item => {
        const { expiresAt, expiryLabel, ...persistentLink } = item;
        return persistentLink;
      }) : [];
    } catch { return []; }
  }
  function saveLinks() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(links)); }
    catch { toast('This browser could not save the visitor links.'); }
  }
  function toast(message) {
    const node = $('#toast');
    if (!node) return;
    node.textContent = message;
    node.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('visible'), 3000);
  }
  function status(link) { return link.status; }
  function urlFor(link) {
    const url = new URL(location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('visitor', link.token);
    return url.href;
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
    if ($('#compact-devices')) $('#compact-devices').innerHTML = filtered.slice(0, 3).map(device => `<div class="compact-device"><span class="status-dot ${device.status.toLowerCase().replace(' ', '-')}"></span><strong>${esc(device.name)}</strong><small>${esc(device.status)}</small></div>`).join('');
  }
  function renderLinks() {
    const rows = links.map(link => {
      const state = status(link);
      return `<article class="session-row"><span class="session-mark">${state === 'Sharing' ? '◉' : state === 'Approved' ? '✓' : '↗'}</span><span class="session-info"><strong>${esc(link.email || 'Visitor link')}</strong><small>Created ${esc(link.createdLabel)} · stays active until revoked</small><span class="session-url">${esc(urlFor(link))}</span></span><span class="session-badge state-${state.toLowerCase()}"><i></i>${esc(state)}</span><span class="session-actions"><button class="copy-link" type="button" data-copy-token="${esc(link.token)}">Copy link</button><button class="revoke-link" type="button" data-revoke-token="${esc(link.token)}">Revoke</button></span></article>`;
    }).join('');
    const empty = '<div class="empty-links"><span>↗</span><strong>No visitor links yet</strong><small>Create a link, then send it to the person you are helping.</small></div>';
    ['#overview-sessions', '#all-sessions'].forEach(selector => { if ($(selector)) $(selector).innerHTML = rows || empty; });
    if ($('#waiting-count')) $('#waiting-count').textContent = String(links.filter(link => status(link) === 'Waiting').length);
    if ($('#approval-count')) $('#approval-count').textContent = String(links.filter(link => ['Approved', 'Sharing'].includes(status(link))).length);
    if ($('#session-nav-count')) $('#session-nav-count').textContent = String(links.filter(link => ['Waiting', 'Approved', 'Sharing'].includes(status(link))).length);
  }
  function showModal({ title, copy, content = '', action = 'Done' }) {
    $('#modal-title').textContent = title;
    $('#modal-copy').textContent = copy;
    $('#modal-content').innerHTML = content;
    $('#modal-action').textContent = action;
    $('#detail-modal').showModal();
  }
  function createLink() {
    const email = ($('#visitor-email')?.value || '').trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast('Enter a valid email address, or leave it blank.');
    if (!crypto.randomUUID) return toast('Secure link creation requires a modern browser.');
    const link = {
      token: crypto.randomUUID().replace(/-/g, '').slice(0, 20), email,
      createdAt: Date.now(), status: 'Waiting', createdLabel: 'just now'
    };
    links.unshift(link);
    saveLinks();
    renderLinks();
    showModal({
      title: 'Send this link to your visitor',
      copy: 'They open the link, choose a screen, and approve the browser sharing prompt before anything is shared.',
      content: `<div class="share-box"><label for="share-url">Visitor link</label><div><input id="share-url" readonly value="${esc(urlFor(link))}"><button class="button primary" id="copy-share-link" type="button">Copy link</button></div></div><div class="link-meta"><span>Active until you revoke it</span><span>Visitor approval required</span></div>`
    });
    $('#copy-share-link').addEventListener('click', () => copyLink(link));
    $('#modal-action').onclick = event => { event.preventDefault(); $('#detail-modal').close(); };
  }
  async function copyLink(link) {
    const text = urlFor(link);
    try {
      await navigator.clipboard.writeText(text);
      toast('Visitor link copied.');
    } catch {
      const field = document.createElement('textarea');
      field.value = text; field.setAttribute('readonly', '');
      field.style.position = 'fixed'; field.style.opacity = '0';
      document.body.append(field); field.select();
      const copied = document.execCommand('copy'); field.remove();
      if (copied) toast('Visitor link copied.');
      else showModal({ title: 'Copy this visitor link', copy: 'Select and copy the link to send it to your visitor.', content: `<div class="share-box"><input readonly value="${esc(text)}"></div>` });
    }
  }
  function setView(view) {
    document.querySelectorAll('.view').forEach(panel => panel.classList.toggle('active', panel.id === `view-${view}`));
    document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === view));
    if ($('#current-view')) $('#current-view').textContent = ({ overview:'Overview', sessions:'Visitor links', devices:'Devices', meetings:'Meetings', activity:'Activity' })[view] || 'Overview';
    $('#sidebar')?.classList.remove('open');
  }
  function visitorMode(token) {
    const link = links.find(item => item.token === token);
    $('#leader-app').hidden = true;
    $('#visitor-app').hidden = false;
    if (!link || link.status === 'Revoked') {
      $('#visitor-title').textContent = link?.status === 'Revoked' ? 'This support request was closed' : 'This support link has expired';
      $('#visitor-copy').textContent = 'Ask your support contact to send a new link.';
      $('#visitor-approve').hidden = true; $('#visitor-decline').hidden = true;
      return;
    }
    $('#visitor-copy').textContent = link.email ? `Alex Morgan from Tremaine Services invited ${link.email} to a support session.` : 'Alex Morgan from Tremaine Services invited you to a support session.';
    if (['Declined', 'Ended'].includes(link.status)) {
      $('#visitor-approve').hidden = true; $('#visitor-decline').hidden = true;
      const state = $('#visitor-state'); state.hidden = false;
      state.textContent = link.status === 'Declined' ? 'You declined this support request.' : 'Screen sharing has ended.';
      return;
    }
    $('#visitor-approve').addEventListener('click', async () => {
      const state = $('#visitor-state');
      if (!navigator.mediaDevices?.getDisplayMedia) {
        state.hidden = false; state.textContent = 'Screen sharing is unavailable. Open this page in a supported browser over HTTPS.'; return;
      }
      try {
        visitorStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        link.status = 'Sharing'; saveLinks(); renderLinks();
        $('#visitor-approve').hidden = true;
        $('#screen-preview').srcObject = visitorStream; $('#screen-preview').hidden = false;
        state.hidden = false; state.innerHTML = '<span class="share-live-dot"></span> Screen sharing approved.';
        const stop = document.createElement('button');
        stop.className = 'button stop-share'; stop.type = 'button'; stop.textContent = 'Stop sharing';
        stop.addEventListener('click', () => visitorStream?.getTracks().forEach(track => track.stop()));
        state.append(' ', stop);
        visitorStream.getVideoTracks()[0]?.addEventListener('ended', () => {
          visitorStream = null; link.status = 'Ended'; saveLinks(); renderLinks();
          $('#screen-preview').hidden = true; state.textContent = 'Screen sharing has ended.';
        });
      } catch (error) {
        state.hidden = false;
        state.textContent = error?.name === 'NotAllowedError' ? 'Screen sharing was declined. Nothing was shared.' : 'Could not start screen sharing. Please try again.';
      }
    });
    $('#visitor-decline').addEventListener('click', () => {
      link.status = 'Declined'; saveLinks(); renderLinks();
      $('#visitor-approve').hidden = true; $('#visitor-decline').hidden = true;
      const state = $('#visitor-state'); state.hidden = false; state.textContent = 'Request declined. Nothing was shared.';
    });
  }
  async function handleLinkAction(event) {
    const copy = event.target.closest('[data-copy-token]');
    const revoke = event.target.closest('[data-revoke-token]');
    if (!copy && !revoke) return;
    const token = (copy || revoke).dataset[copy ? 'copyToken' : 'revokeToken'];
    const link = links.find(item => item.token === token);
    if (!link) return;
    if (copy) return copyLink(link);
    link.status = 'Revoked'; saveLinks(); renderLinks(); toast('Visitor link revoked.');
  }

  document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
  document.querySelectorAll('[data-view-link]').forEach(button => button.addEventListener('click', () => setView(button.dataset.viewLink)));
  document.querySelectorAll('[data-action="create-link"]').forEach(button => button.addEventListener('click', createLink));
  ['#overview-sessions', '#all-sessions'].forEach(selector => $(selector)?.addEventListener('click', handleLinkAction));
  $('#device-search')?.addEventListener('input', renderDevices);
  $('#mobile-menu')?.addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  $('#detail-modal')?.addEventListener('click', event => { if (event.target === $('#detail-modal')) $('#detail-modal').close(); });

  const token = new URLSearchParams(location.search).get('visitor');
  if (token) visitorMode(token);
  else { renderDevices(); renderLinks(); }
})();
