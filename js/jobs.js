// Jobs — in-memory parallel research-job manager.
// Search calls fire-and-forget; user can navigate away and start more.

const Jobs = {
  active: [],   // {id, name, company, status:'running'|'done'|'failed', startedAt, error?, profileId?}

  start(names, options = {}) {
    const apiKey = Storage.getApiKey();
    const myBio = Storage.getMyBio();
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
      this._run(job, apiKey, myBio, attachedFiles);
    });
    this._emit();
  },

  async _run(job, apiKey, myBio, attachedFiles) {
    try {
      const data = await Research.run(apiKey, job.name, job.company, { myBio, attachedFiles });
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
      // Drop from active panel after a short success flash
      setTimeout(() => {
        this.active = this.active.filter(j => j.id !== job.id);
        this._emit();
      }, 1200);
    } catch (e) {
      job.status = 'failed';
      job.error = e.message || String(e);
      this._emit();
      window.dispatchEvent(new CustomEvent('jobs:failed', { detail: { name: job.name, error: job.error } }));
    }
  },

  dismiss(jobId) {
    this.active = this.active.filter(j => j.id !== jobId);
    this._emit();
  },

  retry(jobId) {
    const job = this.active.find(j => j.id === jobId);
    if (!job || job.status !== 'failed') return;
    job.status = 'running';
    job.startedAt = Date.now();
    job.error = null;
    this._run(job, Storage.getApiKey(), Storage.getMyBio(), []);
    this._emit();
  },

  runningCount() {
    return this.active.filter(j => j.status === 'running').length;
  },

  _emit() {
    window.dispatchEvent(new CustomEvent('jobs:update', { detail: this.active.slice() }));
  },
};
