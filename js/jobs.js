// Jobs — in-memory parallel research job manager (streaming).
// NOTE: Anthropic's batches endpoint blocks browser CORS, so we cannot
// run searches off-device without a server proxy. For now, searches
// stream from the browser and require the app to stay foreground.

const Jobs = {
  active: [],
  _wakeLock: null,

  init() {
    // Clear any leftover persistence from the batch experiment
    localStorage.removeItem('spybot:activeJobs');
    this.active = [];
    document.addEventListener('visibilitychange', () => this._maybeReacquire());
  },

  async _acquireWakeLock() {
    if (this._wakeLock || !('wakeLock' in navigator)) return;
    try {
      this._wakeLock = await navigator.wakeLock.request('screen');
      this._wakeLock.addEventListener('release', () => { this._wakeLock = null; });
    } catch (_) { /* ignore */ }
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
    if (!apiKey) throw new Error('API key missing');
    const ctx = {
      apiKey,
      myBio: Storage.getMyBio(),
      myLinkedIn: Storage.getMyLinkedIn(),
      attachedFiles: options.attachedFiles || [],
    };

    names.forEach(n => {
      const job = {
        id: 'job_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
        name: n.name,
        company: n.company || null,
        status: 'running',
        startedAt: Date.now(),
        progress: 'starting',
        error: null,
        profileId: null,
        notFoundData: null,
      };
      this.active.push(job);
      this._run(job, ctx);
    });
    this._acquireWakeLock();
    this._emit();
  },

  async _run(job, ctx) {
    const maxAttempts = 2;
    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const data = await Research.run(ctx.apiKey, job.name, job.company, {
          myBio: ctx.myBio,
          myLinkedIn: ctx.myLinkedIn,
          attachedFiles: ctx.attachedFiles,
          onProgress: (msg) => {
            job.progress = msg;
            this._emit();
          },
        });

        // Not-found path: keep the row, attach suggestions, do not save profile
        if (data.not_found) {
          job.status = 'not_found';
          job.notFoundData = {
            reason: data.reason || '',
            suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
          };
          this._emit();
          if (this.runningCount() === 0) this._releaseWakeLock();
          window.dispatchEvent(new CustomEvent('jobs:notfound', {
            detail: { name: job.name, suggestions: job.notFoundData.suggestions },
          }));
          return;
        }

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
    job.error = friendlyError((lastError && lastError.message) || String(lastError));
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
    if (!job) return;
    if (job.status !== 'failed' && job.status !== 'not_found') return;
    this.active = this.active.filter(j => j.id !== jobId);
    this._emit();
    this.start([{ name: job.name, company: job.company }]);
  },

  runningCount() {
    return this.active.filter(j => j.status === 'running').length;
  },

  _emit() {
    window.dispatchEvent(new CustomEvent('jobs:update', { detail: this.active.slice() }));
  },
};

function friendlyError(msg) {
  if (!msg) return 'Unknown error';
  if (/load failed|failed to fetch|networkerror|network error|the operation couldn.t be completed/i.test(msg)) {
    return 'Network dropped (likely phone backgrounded or screen locked). Tap retry while keeping the app open.';
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
