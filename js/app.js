// App — view router + UI controller

const App = {
  state: {
    view: 'home',
    pendingNames: [],
    attachedFiles: [],     // {name, type:'image'|'pdf'|'text', mediaType?, data?, content?}
    currentProfileId: null,
    history: [],
  },

  init() {
    this.$main = document.getElementById('main');
    this.$back = document.getElementById('back-btn');
    this.$settings = document.getElementById('settings-btn');
    this.$brand = document.getElementById('brand');

    this.$back.addEventListener('click', () => this.back());
    this.$settings.addEventListener('click', () => this.go('settings'));
    this.$brand.addEventListener('click', () => this.go('home'));

    // Global job event listeners (live across all views)
    window.addEventListener('jobs:done', (e) => {
      toast(`✓ ${e.detail.name} saved`);
      if (this.state.view === 'home') {
        this.refreshProfileList();
      }
    });
    window.addEventListener('jobs:failed', (e) => {
      toast(`✕ ${e.detail.name}: ${e.detail.error}`, true);
    });
    window.addEventListener('jobs:update', () => {
      if (this.state.view === 'home') this.refreshActiveJobs();
    });

    // Tick elapsed time on running jobs
    setInterval(() => {
      if (this.state.view === 'home' && Jobs.runningCount() > 0) this.refreshActiveJobs();
    }, 1000);

    this.go('home');
  },

  go(view, opts = {}) {
    if (this.state.view !== view) this.state.history.push(this.state.view);
    this.state.view = view;
    this.$back.classList.toggle('hidden', view === 'home');
    this.render(view, opts);
    window.scrollTo(0, 0);
  },

  back() {
    const prev = this.state.history.pop() || 'home';
    this.state.view = prev;
    this.$back.classList.toggle('hidden', prev === 'home');
    this.render(prev);
    window.scrollTo(0, 0);
  },

  render(view, opts) {
    const tmpl = document.getElementById(`tmpl-${view}`);
    if (!tmpl) return;
    this.$main.innerHTML = '';
    this.$main.appendChild(tmpl.content.cloneNode(true));

    if (view === 'home') this.bindHome();
    else if (view === 'confirm') this.bindConfirm();
    else if (view === 'loading') this.bindLoading(opts);
    else if (view === 'profile') this.bindProfile(opts);
    else if (view === 'settings') this.bindSettings();
  },

  // ─── Home ─────────────────────────────
  bindHome() {
    document.getElementById('run-text-btn').addEventListener('click', () => this.runFromText());
    document.getElementById('capture-btn').addEventListener('click', () => {
      document.getElementById('capture-input').click();
    });
    document.getElementById('capture-input').addEventListener('change', (e) => this.runFromImage(e.target.files[0]));

    document.getElementById('attach-btn').addEventListener('click', () => {
      document.getElementById('attach-input').click();
    });
    document.getElementById('attach-input').addEventListener('change', (e) => this.handleAttach(e.target.files));

    this.refreshAttachedList();
    this.refreshActiveJobs();
    this.refreshProfileList();
  },

  refreshActiveJobs() {
    const $panel = document.getElementById('active-jobs');
    if (!$panel) return;
    const jobs = Jobs.active;
    if (!jobs.length) {
      $panel.classList.add('hidden');
      $panel.innerHTML = '';
      return;
    }
    $panel.classList.remove('hidden');
    const rows = jobs.map(j => {
      const elapsed = Math.floor((Date.now() - j.startedAt) / 1000);
      if (j.status === 'running') {
        return `<div class="job-row running">
          <div class="job-radar">
            <div class="ring"></div>
            <div class="ring r2"></div>
            <div class="sweep"></div>
            <div class="dot"></div>
            <div class="reticle"></div>
          </div>
          <div class="job-info">
            <div class="job-name">${escHtml(j.name)}${j.company ? ` <span class="job-co">@ ${escHtml(j.company)}</span>` : ''}</div>
            <div class="job-meta">▸ scanning open sources · ${elapsed}s</div>
          </div>
        </div>`;
      }
      if (j.status === 'done') {
        return `<div class="job-row done">
          <div class="job-icon">✓</div>
          <div class="job-info">
            <div class="job-name">${escHtml(j.name)}</div>
            <div class="job-meta">complete</div>
          </div>
        </div>`;
      }
      if (j.status === 'failed') {
        return `<div class="job-row failed">
          <div class="job-icon">✕</div>
          <div class="job-info">
            <div class="job-name">${escHtml(j.name)}</div>
            <div class="job-meta">failed: ${escHtml(j.error || '')}</div>
          </div>
          <button class="job-retry" data-id="${j.id}" aria-label="Retry">↻</button>
          <button class="job-dismiss" data-id="${j.id}" aria-label="Dismiss">✕</button>
        </div>`;
      }
      return '';
    }).join('');

    const running = Jobs.runningCount();
    $panel.innerHTML = `
      <div class="active-jobs-header">
        <span class="active-jobs-title">SCANNING</span>
        <span class="active-jobs-count">${running}</span>
      </div>
      ${rows}
      ${running > 0 ? '<div class="active-jobs-tip">Keep this screen on. Locking the phone may interrupt the scan.</div>' : ''}
    `;
    $panel.querySelectorAll('.job-dismiss').forEach(b => b.addEventListener('click', (e) => {
      Jobs.dismiss(e.currentTarget.dataset.id);
    }));
    $panel.querySelectorAll('.job-retry').forEach(b => b.addEventListener('click', (e) => {
      Jobs.retry(e.currentTarget.dataset.id);
    }));
  },

  async handleAttach(fileList) {
    if (!fileList || !fileList.length) return;
    const MAX = 12 * 1024 * 1024; // 12 MB total cap
    let totalSize = this.state.attachedFiles.reduce((s, f) => s + (f.size || 0), 0);

    for (const file of fileList) {
      if (totalSize + file.size > MAX) {
        toast(`Skipping ${file.name}: 12 MB total cap`, true);
        continue;
      }
      try {
        const entry = await fileToEntry(file);
        this.state.attachedFiles.push(entry);
        totalSize += file.size;
      } catch (e) {
        toast(`Could not read ${file.name}`, true);
      }
    }
    document.getElementById('attach-input').value = '';
    this.refreshAttachedList();
  },

  refreshAttachedList() {
    const $list = document.getElementById('attached-list');
    if (!$list) return;
    if (!this.state.attachedFiles.length) {
      $list.classList.add('hidden');
      $list.innerHTML = '';
      return;
    }
    $list.classList.remove('hidden');
    $list.innerHTML = this.state.attachedFiles.map((f, i) => {
      const icon = f.type === 'image' ? '🖼' : f.type === 'pdf' ? '📄' : '📝';
      const sizeKb = Math.round((f.size || 0) / 1024);
      return `<div class="attached-row">
        <span class="attached-icon">${icon}</span>
        <span class="attached-name">${escHtml(f.name)}</span>
        <span class="attached-size">${sizeKb} KB</span>
        <button class="attached-remove" data-i="${i}" aria-label="Remove">✕</button>
      </div>`;
    }).join('');
    $list.querySelectorAll('.attached-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const i = parseInt(e.currentTarget.dataset.i, 10);
        this.state.attachedFiles.splice(i, 1);
        this.refreshAttachedList();
      });
    });
  },

  refreshProfileList() {
    const list = Storage.list();
    const $list = document.getElementById('profile-list');
    const $count = document.getElementById('dossier-count');
    const $empty = document.getElementById('empty-state');
    $count.textContent = list.length;
    $list.innerHTML = '';
    if (!list.length) {
      $empty.classList.remove('hidden');
      return;
    }
    $empty.classList.add('hidden');
    list.forEach(p => {
      const initials = getInitials(p.name || '');
      const photo = p.data?.photo_url ? `style="background-image:url('${escAttr(p.data.photo_url)}')"` : '';
      const row = document.createElement('div');
      row.className = 'profile-row';
      row.innerHTML = `
        <div class="avatar" ${photo}>${p.data?.photo_url ? '' : escHtml(initials)}</div>
        <div class="profile-info">
          <div class="profile-name">${escHtml(p.name)}</div>
          <div class="profile-meta">${escHtml(p.data?.headline || p.company || '')}</div>
        </div>
        <button class="delete-btn" data-id="${p.id}" aria-label="Delete">✕</button>
      `;
      row.querySelector('.profile-info').addEventListener('click', () => this.go('profile', { id: p.id }));
      row.querySelector('.avatar').addEventListener('click', () => this.go('profile', { id: p.id }));
      row.querySelector('.delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Delete profile for ${p.name}?`)) {
          Storage.delete(p.id);
          this.refreshProfileList();
          toast('Profile deleted');
        }
      });
      $list.appendChild(row);
    });
  },

  runFromText() {
    const apiKey = Storage.getApiKey();
    if (!apiKey) {
      toast('Add your API key in Settings first', true);
      this.go('settings');
      return;
    }
    const raw = document.getElementById('names-input').value.trim();
    if (!raw) { toast('Enter at least one name', true); return; }
    const names = parseNamesInput(raw);
    if (!names.length) { toast('No valid names found', true); return; }
    this.runResearch(names);
  },

  async runFromImage(file) {
    if (!file) return;
    const apiKey = Storage.getApiKey();
    if (!apiKey) {
      toast('Add your API key in Settings first', true);
      this.go('settings');
      return;
    }
    this.go('loading', { title: 'READING IMAGE…', sub: 'Extracting names with vision', steps: ['Decoding image', 'Detecting names'] });
    try {
      const names = await Vision.extractNames(apiKey, file);
      if (!names.length) {
        toast('No names found in image', true);
        this.go('home');
        return;
      }
      this.state.pendingNames = names;
      this.go('confirm');
    } catch (e) {
      console.error(e);
      toast(e.message || 'Vision failed', true);
      this.go('home');
    }
  },

  // ─── Confirm ──────────────────────────
  bindConfirm() {
    const $chips = document.getElementById('extracted-names');
    const renderChips = () => {
      $chips.innerHTML = '';
      this.state.pendingNames.forEach((n, idx) => {
        const chip = document.createElement('div');
        chip.className = 'name-chip';
        chip.innerHTML = `
          <input type="text" value="${escAttr(n.name)}" data-idx="${idx}" />
          <button data-idx="${idx}" aria-label="Remove">✕</button>
        `;
        chip.querySelector('input').addEventListener('change', (e) => {
          this.state.pendingNames[idx].name = e.target.value.trim();
        });
        chip.querySelector('button').addEventListener('click', () => {
          this.state.pendingNames.splice(idx, 1);
          renderChips();
        });
        $chips.appendChild(chip);
      });
    };
    renderChips();
    document.getElementById('add-name-btn').addEventListener('click', () => {
      this.state.pendingNames.push({ name: '', company: null });
      renderChips();
    });
    document.getElementById('cancel-confirm').addEventListener('click', () => this.go('home'));
    document.getElementById('confirm-run').addEventListener('click', () => {
      const names = this.state.pendingNames.filter(n => n.name && n.name.trim());
      if (!names.length) { toast('No names to search', true); return; }
      this.runResearch(names);
    });
  },

  // ─── Research run (fire-and-forget, parallel) ─────────────────────
  runResearch(names) {
    const apiKey = Storage.getApiKey();
    if (!apiKey) {
      toast('Add API key in Settings first', true);
      this.go('settings');
      return;
    }
    const attachedFiles = this.state.attachedFiles.slice();
    Jobs.start(names, { attachedFiles });
    this.state.attachedFiles = [];

    // Reset the input so the next name can be typed immediately
    const inp = document.getElementById('names-input');
    if (inp) inp.value = '';

    if (this.state.view !== 'home') this.go('home');
    else { this.refreshAttachedList(); this.refreshActiveJobs(); }

    toast(`▶ ${names.length} search${names.length > 1 ? 'es' : ''} running in background`);
  },

  bindLoading(opts) {
    if (!opts) return;
    if (opts.title) document.getElementById('loading-title').textContent = opts.title;
    if (opts.sub) document.getElementById('loading-sub').textContent = opts.sub;
    if (opts.steps) {
      const $log = document.getElementById('loading-log');
      $log.innerHTML = opts.steps.map(s => `<li>${escHtml(s)}</li>`).join('');
    }
  },

  // ─── Profile view ─────────────────────
  bindProfile(opts) {
    const id = opts?.id;
    if (!id) { this.go('home'); return; }
    const profile = Storage.get(id);
    if (!profile) { toast('Profile not found', true); this.go('home'); return; }
    this.state.currentProfileId = id;
    document.getElementById('profile-view').innerHTML = Render.profileView(profile);
    document.getElementById('rerun-btn')?.addEventListener('click', () => {
      if (!confirm(`Re-run search for ${profile.name}? This will replace the current data.`)) return;
      Storage.delete(id);
      this.runResearch([{ name: profile.name, company: profile.company }]);
    });
    document.getElementById('delete-profile-btn')?.addEventListener('click', () => {
      if (!confirm(`Delete profile for ${profile.name}?`)) return;
      Storage.delete(id);
      toast('Profile deleted');
      this.go('home');
    });
    document.getElementById('export-pdf-btn')?.addEventListener('click', () => this.exportPdf(profile));
  },

  exportPdf(profile) {
    // Force-expand all sections + bullets so they all print
    document.body.classList.add('printing');
    document.querySelectorAll('.section.collapsed').forEach(s => {
      s.dataset.wasCollapsed = '1';
      s.classList.remove('collapsed');
    });
    document.querySelectorAll('li.expandable').forEach(li => {
      li.dataset.wasCollapsed = '1';
      li.classList.add('expanded');
    });
    document.title = `SpyBot — ${profile.name}`;

    const restore = () => {
      document.body.classList.remove('printing');
      document.querySelectorAll('.section[data-was-collapsed="1"]').forEach(s => {
        s.classList.add('collapsed');
        delete s.dataset.wasCollapsed;
      });
      document.querySelectorAll('li.expandable[data-was-collapsed="1"]').forEach(li => {
        li.classList.remove('expanded');
        delete li.dataset.wasCollapsed;
      });
      document.title = 'SpyBot';
      window.removeEventListener('afterprint', restore);
    };
    window.addEventListener('afterprint', restore);

    setTimeout(() => window.print(), 100);
  },

  // ─── Settings ─────────────────────────
  bindSettings() {
    const $input = document.getElementById('api-key-input');
    const $status = document.getElementById('key-status');
    const current = Storage.getApiKey();
    if (current) {
      $input.value = current;
      $status.textContent = `✓ Key configured (${current.slice(0, 10)}…)`;
      $status.className = 'key-status ok';
    } else {
      $status.textContent = '⚠ No key set, searches will fail';
      $status.className = 'key-status miss';
    }
    document.getElementById('save-key-btn').addEventListener('click', () => {
      const k = $input.value.trim();
      if (!k) { toast('Paste a key first', true); return; }
      Storage.setApiKey(k);
      $status.textContent = `✓ Key saved`;
      $status.className = 'key-status ok';
      toast('API key saved');
    });
    document.getElementById('clear-key-btn').addEventListener('click', () => {
      Storage.setApiKey('');
      $input.value = '';
      $status.textContent = '⚠ No key set';
      $status.className = 'key-status miss';
      toast('API key cleared');
    });

    // LinkedIn URL
    const $li = document.getElementById('my-linkedin-input');
    const $liStatus = document.getElementById('linkedin-status');
    const liUrl = Storage.getMyLinkedIn();
    $li.value = liUrl;
    if (liUrl) {
      $liStatus.textContent = `✓ LinkedIn set`;
      $liStatus.className = 'key-status ok';
    } else {
      $liStatus.textContent = '⚠ No LinkedIn URL set';
      $liStatus.className = 'key-status miss';
    }
    document.getElementById('save-linkedin-btn').addEventListener('click', () => {
      const u = $li.value.trim();
      Storage.setMyLinkedIn(u);
      if (u) {
        $liStatus.textContent = `✓ LinkedIn saved`;
        $liStatus.className = 'key-status ok';
        toast('LinkedIn URL saved');
      } else {
        $liStatus.textContent = '⚠ LinkedIn cleared';
        $liStatus.className = 'key-status miss';
        toast('LinkedIn URL cleared');
      }
    });
    document.getElementById('reset-linkedin-btn').addEventListener('click', () => {
      localStorage.removeItem('spybot:myLinkedIn');
      $li.value = Storage.getMyLinkedIn();
      $liStatus.textContent = `✓ Reset to default`;
      $liStatus.className = 'key-status ok';
      toast('Reset to default LinkedIn');
    });

    // Bio
    const $bio = document.getElementById('my-profile-input');
    const $bioStatus = document.getElementById('bio-status');
    const bio = Storage.getMyBio();
    if (bio) {
      $bio.value = bio;
      $bioStatus.textContent = `✓ Bio set (${bio.length} chars)`;
      $bioStatus.className = 'key-status ok';
    } else {
      $bioStatus.textContent = '⚠ No bio yet, "what we have in common" will be empty';
      $bioStatus.className = 'key-status miss';
    }
    document.getElementById('save-bio-btn').addEventListener('click', () => {
      const b = $bio.value.trim();
      Storage.setMyBio(b);
      if (b) {
        $bioStatus.textContent = `✓ Bio saved (${b.length} chars)`;
        $bioStatus.className = 'key-status ok';
        toast('Bio saved');
      } else {
        $bioStatus.textContent = '⚠ Bio cleared';
        $bioStatus.className = 'key-status miss';
        toast('Bio cleared');
      }
    });

    document.getElementById('wipe-all-btn').addEventListener('click', () => {
      if (!confirm('Wipe ALL saved profiles? This cannot be undone.')) return;
      Storage.wipeAll();
      toast('All profiles wiped');
    });
  },
};

// ─── Helpers ──────────────────────────
function parseNamesInput(raw) {
  return raw.split(/\n|;|,(?=\s*[A-Z])/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const m = line.match(/^(.+?)\s*[@,]\s*(.+)$/);
      if (m) return { name: m[1].trim(), company: m[2].trim() };
      return { name: line, company: null };
    });
}

async function fileToEntry(file) {
  const name = file.name;
  const size = file.size;
  if (file.type.startsWith('image/')) {
    const data = await readBase64(file);
    return { name, size, type: 'image', mediaType: file.type, data };
  }
  if (file.type === 'application/pdf' || name.toLowerCase().endsWith('.pdf')) {
    const data = await readBase64(file);
    return { name, size, type: 'pdf', data };
  }
  // Treat as text
  const content = await readText(file);
  return { name, size, type: 'text', content };
}

function readBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
function readText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsText(file);
  });
}

let toastTimer = null;
function toast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast${isError ? ' error' : ''}`;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3000);
}

// Service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

document.addEventListener('DOMContentLoaded', () => App.init());
