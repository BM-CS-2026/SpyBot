// Jobs — in-memory parallel research-job manager.
// Search calls fire-and-forget; user can navigate away and start more.

const Jobs = {
  active: [],   // {id, name, company, status:'running'|'done'|'failed', startedAt, error?, profileId?}
  _wakeLock: null,

  async _acquireWakeLock() {
    if (this._wakeLock || !('wakeLock' in navigator)) return;
    try {
      this._wakeLock = await navigator.wakeLock.request('screen');
      this._wakeLock.addEventListener('release', () => { this._wakeLock = null; });
    } catch (e) { /* ignore */ }
  },
  _releaseWakeLock() {
    if (this._wakeLock) {
      try { this._wakeLock.release(); } catch (_) {}
      this._wakeLock = null;
    }
  },
  _maybeReacquire() {
    if (this.runningCount() > 0 && !document.hidden) this._acquireWakeLock();
  },

  start(names, options = {}) {
    const apiKey = Storage.getApiKey();
    const myBio = Storage.getMyBio();
    const myLinkedIn = Storage.getMyLinkedIn();
    const attachedFiles = options.attachedFiles || [];

    names.forEach(n => {
      const job = {
        id: 'job_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
        name: n.name,
        company: n.company || null,
        status: 'running',
        startedAt: Date.now(),
        error: null,
        profileId: null,
      };
      this.active.push(job);
      this._run(job, apiKey, myBio, myLinkedIn, attachedFiles);
    });
    this._acquireWakeLock();
    this._emit();
  },

  async _run(job, apiKey, myBio, myLinkedIn, attachedFiles) {
    const maxAttempts = 2;
    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const data = await Research.run(apiKey, job.name, job.company, {
          myBio, myLinkedIn, attachedFiles,
          onProgress: (msg) => {
            job.progress = msg;
            this._emit();
          },
        });
        const profile = {
          id: Storage.uuid(),
          name: data.name || job.name,
          company: data.company || job.company || null,
          createdAt: Date.now(),
          data,
        };
        Storage.save(profile);
        job.status = 'done';
        job.profileId = profile.id;
        this._emit();
        window.dispatchEvent(new CustomEvent('jobs:done', { detail: { name: job.name, profileId: profile.id } }));
        setTimeout(() => {
          this.active = this.active.filter(j => j.id !== job.id);
          if (this.runningCount() === 0) this._releaseWakeLock();
          this._emit();
        }, 1200);
        return;
      } catch (e) {
        lastError = e;
        const msg = (e && e.message) || String(e);
        // Don't retry on auth/quota/permission errors
        if (/401|403|invalid_api_key|authentication|permission|quota|insufficient/i.test(msg)) break;
        if (attempt < maxAttempts) {
          job.error = `${msg} (retrying)`;
          this._emit();
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
      }
    }
    job.status = 'failed';
    const rawMsg = (lastError && lastError.message) || String(lastError);
    job.error = friendlyError(rawMsg);
    this._emit();
    if (this.runningCount() === 0) this._releaseWakeLock();
    window.dispatchEvent(new CustomEvent('jobs:failed', { detail: { name: job.name, error: job.error } }));
  },

  dismiss(jobId) {
    this.active = this.active.filter(j => j.id !== jobId);
    if (this.runningCount() === 0) this._releaseWakeLock();
    this._emit();
  },

  retry(jobId) {
    const job = this.active.find(j => j.id === jobId);
    if (!job || job.status !== 'failed') return;
    job.status = 'running';
    job.startedAt = Date.now();
    job.error = null;
    this._acquireWakeLock();
    this._run(job, Storage.getApiKey(), Storage.getMyBio(), Storage.getMyLinkedIn(), []);
    this._emit();
  },

  runningCount() {
    return this.active.filter(j => j.status === 'running').length;
  },

  _emit() {
    window.dispatchEvent(new CustomEvent('jobs:update', { detail: this.active.slice() }));
  },
};

// Wake lock is auto-released when page becomes hidden; re-acquire when visible again
document.addEventListener('visibilitychange', () => Jobs._maybeReacquire());

function friendlyError(msg) {
  if (!msg) return 'Unknown error';
  if (/load failed|failed to fetch|networkerror|network error|the operation couldn.t be completed/i.test(msg)) {
    return 'Network dropped (phone may have backgrounded). Tap retry.';
  }
  if (/401|invalid_api_key|authentication/i.test(msg)) {
    return 'Bad API key. Open Settings and re-paste it.';
  }
  if (/quota|insufficient|credit/i.test(msg)) {
    return 'Anthropic quota exceeded. Check your account.';
  }
  if (/429|rate.?limit/i.test(msg)) {
    return 'Rate limited. Wait a minute and retry.';
  }
  return msg;
}
