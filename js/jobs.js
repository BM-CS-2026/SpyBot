// Jobs — batch-backed, persistent research job manager.
// Searches submit to Anthropic's Batches API and run on their servers.
// The phone polls for completion when it's awake. Survives screen lock,
// app close, even device reboot (jobs persist via localStorage).

const KEY_JOBS = 'spybot:activeJobs';
const POLL_INTERVAL_MS = 30000;        // 30s poll cadence when foregrounded
const POLL_INTERVAL_FAST_MS = 10000;   // 10s right after submission

const Jobs = {
  active: [],
  _pollTimer: null,

  init() {
    this._load();
    // Resume polling on app open
    if (this.active.some(j => j._isPending(j))) {
      this._schedulePoll(POLL_INTERVAL_FAST_MS);
    }
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.pollAll();
    });
    window.addEventListener('online', () => this.pollAll());
    // Initial poll on load (in case jobs finished while we were away)
    setTimeout(() => this.pollAll(), 800);
  },

  _isPending(j) {
    return j.status === 'submitting' || j.status === 'queued' || j.status === 'processing';
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

    names.forEach(n => this._submit(n, ctx));
  },

  async _submit(target, ctx) {
    const job = {
      id: 'job_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
      name: target.name,
      company: target.company || null,
      status: 'submitting',
      submittedAt: Date.now(),
      lastChecked: 0,
      batchId: null,
      progress: 'submitting to Anthropic',
      error: null,
      profileId: null,
    };
    this.active.push(job);
    this._persist();
    this._emit();

    try {
      const params = Research.buildParams(target.name, target.company, {
        myBio: ctx.myBio,
        myLinkedIn: ctx.myLinkedIn,
        attachedFiles: ctx.attachedFiles,
      });
      const batch = await API.submitBatch({
        apiKey: ctx.apiKey,
        requests: [{ custom_id: job.id, params }],
      });
      job.batchId = batch.id;
      job.status = 'queued';
      job.progress = 'queued on Anthropic servers';
      this._persist();
      this._emit();
      this._schedulePoll(POLL_INTERVAL_FAST_MS);
    } catch (e) {
      job.status = 'failed';
      job.error = friendlyError(e.message || String(e));
      this._persist();
      this._emit();
      window.dispatchEvent(new CustomEvent('jobs:failed', { detail: { name: job.name, error: job.error } }));
    }
  },

  async pollAll() {
    const apiKey = Storage.getApiKey();
    if (!apiKey) return;
    const pending = this.active.filter(j => this._isPending(j) && j.batchId);
    if (!pending.length) {
      this._cancelPollTimer();
      return;
    }
    for (const job of pending) {
      await this._pollOne(job, apiKey);
    }
    if (this.active.some(j => this._isPending(j))) {
      this._schedulePoll(POLL_INTERVAL_MS);
    } else {
      this._cancelPollTimer();
    }
  },

  async _pollOne(job, apiKey) {
    try {
      const batch = await API.getBatch({ apiKey, batchId: job.batchId });
      job.lastChecked = Date.now();

      if (batch.processing_status === 'in_progress') {
        const counts = batch.request_counts || {};
        if (counts.processing > 0) {
          job.status = 'processing';
          job.progress = 'Anthropic processing your search';
        } else {
          job.status = 'queued';
          job.progress = 'queued (waiting in line)';
        }
        this._persist();
        this._emit();
        return;
      }

      if (batch.processing_status === 'ended') {
        await this._fetchResults(job, batch, apiKey);
      }
    } catch (e) {
      // Don't mark failed on transient poll errors
      console.error('Poll failed for', job.batchId, e);
      job.progress = `poll error: ${e.message || e}`;
      this._emit();
    }
  },

  async _fetchResults(job, batch, apiKey) {
    try {
      job.progress = 'fetching result';
      this._emit();
      const results = await API.getBatchResults({ apiKey, resultsUrl: batch.results_url });
      const myResult = results.find(r => r.custom_id === job.id);
      if (!myResult) throw new Error('Result not found in batch');

      const data = Research.parseResult(myResult, job.name);

      // Not-found path: keep the row, attach suggestions, do not save profile
      if (data.not_found) {
        job.status = 'not_found';
        job.notFoundData = {
          reason: data.reason || '',
          suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
        };
        this._persist();
        this._emit();
        window.dispatchEvent(new CustomEvent('jobs:notfound', { detail: { name: job.name, suggestions: job.notFoundData.suggestions } }));
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
      this._persist();
      this._emit();
      window.dispatchEvent(new CustomEvent('jobs:done', { detail: { name: job.name, profileId: profile.id } }));

      setTimeout(() => {
        this.active = this.active.filter(j => j.id !== job.id);
        this._persist();
        this._emit();
      }, 1500);
    } catch (e) {
      job.status = 'failed';
      job.error = friendlyError(e.message || String(e));
      this._persist();
      this._emit();
      window.dispatchEvent(new CustomEvent('jobs:failed', { detail: { name: job.name, error: job.error } }));
    }
  },

  dismiss(jobId) {
    const job = this.active.find(j => j.id === jobId);
    if (job && this._isPending(job) && job.batchId) {
      // Best-effort cancel on Anthropic
      const apiKey = Storage.getApiKey();
      if (apiKey) API.cancelBatch({ apiKey, batchId: job.batchId });
    }
    this.active = this.active.filter(j => j.id !== jobId);
    this._persist();
    this._emit();
  },

  retry(jobId) {
    const job = this.active.find(j => j.id === jobId);
    if (!job || job.status !== 'failed') return;
    // Resubmit fresh
    const ctx = {
      apiKey: Storage.getApiKey(),
      myBio: Storage.getMyBio(),
      myLinkedIn: Storage.getMyLinkedIn(),
      attachedFiles: [],
    };
    this.active = this.active.filter(j => j.id !== jobId);
    this._persist();
    this._emit();
    this._submit({ name: job.name, company: job.company }, ctx);
  },

  runningCount() {
    return this.active.filter(j => this._isPending(j)).length;
  },

  _schedulePoll(delay = POLL_INTERVAL_MS) {
    this._cancelPollTimer();
    this._pollTimer = setTimeout(() => this.pollAll(), delay);
  },
  _cancelPollTimer() {
    if (this._pollTimer) { clearTimeout(this._pollTimer); this._pollTimer = null; }
  },

  _load() {
    try {
      const raw = localStorage.getItem(KEY_JOBS);
      this.active = raw ? JSON.parse(raw) : [];
    } catch (_) {
      this.active = [];
    }
  },
  _persist() {
    try {
      localStorage.setItem(KEY_JOBS, JSON.stringify(this.active));
    } catch (_) { /* quota */ }
  },

  _emit() {
    window.dispatchEvent(new CustomEvent('jobs:update', { detail: this.active.slice() }));
  },
};

function friendlyError(msg) {
  if (!msg) return 'Unknown error';
  if (/load failed|failed to fetch|networkerror|network error|the operation couldn.t be completed/i.test(msg)) {
    return 'Network dropped. Tap retry.';
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
