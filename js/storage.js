// Storage — localStorage backed profile store + API key

const KEY_PROFILES = 'spybot:profiles';
const KEY_API = 'spybot:apiKey';
const KEY_BIO = 'spybot:myBio';
const KEY_LINKEDIN = 'spybot:myLinkedIn';
const DEFAULT_LINKEDIN = 'https://www.linkedin.com/in/boazmanash/';

const Storage = {
  getApiKey() {
    return localStorage.getItem(KEY_API) || '';
  },
  setApiKey(key) {
    if (key) localStorage.setItem(KEY_API, key);
    else localStorage.removeItem(KEY_API);
  },
  getMyBio() {
    return localStorage.getItem(KEY_BIO) || '';
  },
  setMyBio(bio) {
    if (bio) localStorage.setItem(KEY_BIO, bio);
    else localStorage.removeItem(KEY_BIO);
  },
  getMyLinkedIn() {
    const v = localStorage.getItem(KEY_LINKEDIN);
    return v === null ? DEFAULT_LINKEDIN : v;
  },
  setMyLinkedIn(url) {
    // Save explicit empty string so a cleared value sticks (does not revert to default)
    localStorage.setItem(KEY_LINKEDIN, url || '');
  },
  list() {
    try {
      const raw = localStorage.getItem(KEY_PROFILES);
      const arr = raw ? JSON.parse(raw) : [];
      return arr.sort((a, b) => b.createdAt - a.createdAt);
    } catch (e) {
      console.error('Failed to read profiles', e);
      return [];
    }
  },
  get(id) {
    return this.list().find(p => p.id === id) || null;
  },
  save(profile) {
    const all = this.list();
    const existing = all.findIndex(p => p.id === profile.id);
    if (existing >= 0) all[existing] = profile;
    else all.unshift(profile);
    localStorage.setItem(KEY_PROFILES, JSON.stringify(all));
  },
  delete(id) {
    const all = this.list().filter(p => p.id !== id);
    localStorage.setItem(KEY_PROFILES, JSON.stringify(all));
  },
  wipeAll() {
    localStorage.removeItem(KEY_PROFILES);
  },
  uuid() {
    return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  },
};
