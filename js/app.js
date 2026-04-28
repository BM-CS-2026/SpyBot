// App — view router + UI controller

const App = {
  state: {
    view: 'home',
    pendingNames: [],          // {name, company}[]
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

    this.go('home');
  },

  go(view, opts = {}) {
    if (this.state.view !== view) {
      this.state.history.push(this.state.view);
    }
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

    this.refreshProfileList();
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

  // ─── Research run ─────────────────────
  async runResearch(names) {
    const apiKey = Storage.getApiKey();
    this.go('loading', {
      title: `SCANNING ${names.length} TARGET${names.length > 1 ? 'S' : ''}…`,
      sub: 'Querying open sources',
      steps: names.map(n => n.name),
    });

    const $log = document.getElementById('loading-log');
    const $sub = document.getElementById('loading-sub');

    let lastSavedId = null;
    for (let i = 0; i < names.length; i++) {
      const { name, company } = names[i];
      $sub.textContent = `[${i + 1}/${names.length}] ${name}`;
      $log.children[i]?.classList.add('active');
      try {
        const data = await Research.run(apiKey, name, company || null, (msg) => {
          $sub.textContent = `[${i + 1}/${names.length}] ${name} — ${msg}`;
        });
        const profile = {
          id: Storage.uuid(),
          name: data.name || name,
          company: data.company || company || null,
          createdAt: Date.now(),
          data,
        };
        Storage.save(profile);
        lastSavedId = profile.id;
        $log.children[i]?.classList.remove('active');
        $log.children[i]?.classList.add('done');
      } catch (e) {
        console.error(e);
        $log.children[i]?.classList.remove('active');
        toast(`${name}: ${e.message}`, true);
      }
    }

    if (names.length === 1 && lastSavedId) {
      this.go('profile', { id: lastSavedId });
    } else {
      this.go('home');
      toast(`✓ ${names.length} profiles saved`);
    }
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
      $status.textContent = '⚠ No key set — searches will fail';
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
