// Render — turns a profile JSON object into the profile view DOM

const Render = {
  profileView(profile) {
    const data = profile.data || {};
    const name = data.name || profile.name || 'Unknown';
    const headline = data.headline || (data.company ? `${data.company}` : '');
    const loc = data.location || '';
    const initials = getInitials(name);
    const photo = data.photo_url ? `style="background-image:url('${escAttr(data.photo_url)}')"` : '';

    const sections = [
      this._sectionWhatNow(data),
      this._sectionCommonGround(data),
      this._sectionTimeline(data),
      this._sectionConversation(data),
      this._sectionProfessional(data),
      this._sectionCharacter(data),
      this._sectionGlossary(data),
      this._sectionSources(data),
    ].join('');

    return `
      <div class="profile-header">
        <div class="profile-photo" ${photo}>${data.photo_url ? '' : escHtml(initials)}</div>
        <div class="profile-head-info">
          <div class="profile-head-name">${escHtml(name)}</div>
          <div class="profile-head-role">${escHtml(headline)}</div>
          ${loc ? `<div class="profile-head-loc">📍 ${escHtml(loc)}</div>` : ''}
        </div>
      </div>
      ${sections}
      <div class="profile-actions" style="margin-top:24px;display:flex;gap:10px;flex-wrap:wrap;">
        <button class="btn btn-ghost" id="export-pdf-btn">📄 EXPORT PDF</button>
        <button class="btn btn-ghost" id="rerun-btn">↻ RE-RUN</button>
        <button class="btn btn-danger" id="delete-profile-btn">🗑 DELETE</button>
      </div>
    `;
  },

  _section({ icon, title, body, priority = false, openByDefault = true }) {
    if (!body || body.trim() === '') return '';
    return `
      <div class="section ${priority ? 'priority' : ''} ${openByDefault ? '' : 'collapsed'}">
        <div class="section-header" onclick="this.parentElement.classList.toggle('collapsed')">
          <div class="section-title"><span class="sec-icon">${icon}</span>${title}</div>
          <div class="section-toggle">▾</div>
        </div>
        <div class="section-body">${body}</div>
      </div>
    `;
  },

  // Accepts either string or {main, more} bullet
  _bullets(arr) {
    if (!arr || !arr.length) return '<div class="notfound">No data found.</div>';
    return `<ul class="bullet-list">${arr.map(item => this._bullet(item)).join('')}</ul>`;
  },

  _bullet(item) {
    if (typeof item === 'string') {
      return `<li><div class="bullet-main">${escHtml(item)}</div></li>`;
    }
    if (item && typeof item === 'object') {
      const main = item.main || '';
      const more = item.more;
      const source = item.source;
      const sourceLink = source && /^https?:\/\//i.test(String(source))
        ? `<a class="bullet-source" href="${escAttr(source)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">↗ source</a>`
        : '';
      if (more && String(more).trim()) {
        return `<li class="expandable" onclick="this.classList.toggle('expanded')">
          <div class="bullet-main">${escHtml(main)}<span class="bullet-toggle">▾</span></div>
          <div class="bullet-more">${escHtml(more)}</div>
          ${sourceLink}
        </li>`;
      }
      return `<li><div class="bullet-main">${escHtml(main)}</div>${sourceLink}</li>`;
    }
    return `<li><div class="bullet-main">${escHtml(String(item))}</div></li>`;
  },

  _sectionWhatNow(data) {
    const body = this._bullets(data.what_doing_now);
    return this._section({ icon: '◉', title: "WHAT THEY'RE DOING NOW", body, priority: true });
  },

  _sectionCommonGround(data) {
    const cg = data.common_ground || {};
    const cur = cg.current || [];
    const hist = cg.historical || [];
    if (!cur.length && !hist.length) return '';
    const inner = `
      ${cur.length ? `<div class="subgroup"><div class="subgroup-title">Current overlaps</div>${this._bullets(cur)}</div>` : ''}
      ${hist.length ? `<div class="subgroup"><div class="subgroup-title">Historical overlaps</div>${this._bullets(hist)}</div>` : ''}
    `;
    return this._section({ icon: '⚯', title: 'WHAT YOU HAVE IN COMMON', body: inner, priority: true });
  },

  _sectionTimeline(data) {
    const items = data.career_timeline || [];
    if (!items.length) {
      return this._section({ icon: '⏱', title: 'CAREER HISTORY', body: '<div class="notfound">No timeline found.</div>' });
    }
    const body = `<div class="timeline">${items.map(it => `
      <div class="timeline-item">
        <div class="timeline-years">${escHtml(it.years || '')}</div>
        <div class="timeline-role">${escHtml(it.role || '')}</div>
        <div class="timeline-co">${escHtml(it.company || '')}</div>
        ${it.note ? `<div class="timeline-note">${escHtml(it.note)}</div>` : ''}
      </div>
    `).join('')}</div>`;
    return this._section({ icon: '⏱', title: 'CAREER HISTORY', body });
  },

  _sectionConversation(data) {
    const c = data.conversation_small_talk || {};
    const blocks = [
      ['Personal hooks', c.personal_hooks],
      ['Previous achievements', c.previous_achievements],
      ['Hobbies & interests', c.hobbies_interests],
      ['Geography facts', c.geography_facts],
      ['History facts', c.history_facts],
      ['Field context', c.field_context],
    ];
    const has = blocks.some(([, arr]) => arr && arr.length);
    if (!has) return this._section({ icon: '💬', title: 'CONVERSATION & SMALL TALK', body: '<div class="notfound">No conversation data found.</div>', priority: true });
    const body = blocks.map(([label, arr]) => {
      if (!arr || !arr.length) return '';
      return `<div class="subgroup">
        <div class="subgroup-title">${escHtml(label)}</div>
        ${this._bullets(arr)}
      </div>`;
    }).join('');
    return this._section({ icon: '💬', title: 'CONVERSATION & SMALL TALK', body, priority: true });
  },

  _sectionProfessional(data) {
    const p = data.professional_details || {};

    const eduBody = p.education && p.education.length
      ? this._bullets(p.education) : '<div class="notfound">Not found.</div>';

    const patBody = p.patents && p.patents.length
      ? `<ul class="bullet-list">${p.patents.map(pt => `<li><div class="bullet-main"><strong>${escHtml(pt.title || '')}</strong>${pt.number ? `, ${escHtml(pt.number)}` : ''}${pt.year ? ` (${escHtml(pt.year)})` : ''}</div></li>`).join('')}</ul>`
      : '<div class="notfound">Not found.</div>';

    const pubBody = p.publications && p.publications.length
      ? `<ul class="bullet-list">${p.publications.map(pub => `<li><div class="bullet-main"><strong>${escHtml(pub.title || '')}</strong>${pub.venue ? `, ${escHtml(pub.venue)}` : ''}${pub.year ? ` (${escHtml(pub.year)})` : ''}</div></li>`).join('')}</ul>`
      : '<div class="notfound">Not found.</div>';

    const awardsBody = p.awards && p.awards.length
      ? this._bullets(p.awards) : '<div class="notfound">Not found.</div>';

    const socBody = p.social && p.social.length
      ? `<ul class="bullet-list">${p.social.map(s => `<li><div class="bullet-main"><strong>${escHtml(s.platform || '')}:</strong> ${s.url ? `<a href="${escAttr(s.url)}" target="_blank" rel="noopener" style="color:var(--cyan-soft)">${escHtml(s.url)}</a>` : ''}${s.themes ? `, ${escHtml(s.themes)}` : ''}</div></li>`).join('')}</ul>`
      : '<div class="notfound">Not found.</div>';

    const newsBody = p.recent_news && p.recent_news.length
      ? this._bullets(p.recent_news) : '<div class="notfound">Not found.</div>';

    const inner = `
      <div class="subgroup"><div class="subgroup-title">Education</div>${eduBody}</div>
      <div class="subgroup"><div class="subgroup-title">Patents</div>${patBody}</div>
      <div class="subgroup"><div class="subgroup-title">Publications</div>${pubBody}</div>
      <div class="subgroup"><div class="subgroup-title">Awards & Recognition</div>${awardsBody}</div>
      <div class="subgroup"><div class="subgroup-title">Social</div>${socBody}</div>
      <div class="subgroup"><div class="subgroup-title">Recent news</div>${newsBody}</div>
    `;
    return this._section({ icon: '📂', title: 'PROFESSIONAL DETAILS', body: inner, openByDefault: false });
  },

  _sectionCharacter(data) {
    const c = data.character_assessment || {};
    const tiles = [
      ['Work style', c.work_style],
      ['Archetype', c.archetype],
      ['Communication', c.communication_style],
      ['Drivers', c.drivers],
    ];
    const inner = `
      <div class="char-grid">
        ${tiles.filter(([, v]) => v).map(([l, v]) => `
          <div class="char-tile">
            <div class="label">${escHtml(l)}</div>
            <div class="value">${escHtml(v)}</div>
          </div>
        `).join('')}
        ${c.looking_for ? `
          <div class="char-tile full">
            <div class="label">⌖ What they're looking for</div>
            <div class="value">${escHtml(c.looking_for)}</div>
          </div>` : ''}
      </div>
    `;
    return this._section({ icon: '🧠', title: 'CHARACTER ASSESSMENT', body: inner });
  },

  _sectionGlossary(data) {
    const g = data.glossary || [];
    if (!g.length) return '';
    const body = g.map(item => `
      <div class="gloss">
        <div class="gloss-term">${escHtml(item.term || '')}</div>
        <div class="gloss-def">${escHtml(item.explanation || '')}</div>
      </div>
    `).join('');
    return this._section({ icon: '📖', title: 'GLOSSARY', body, openByDefault: false });
  },

  _sectionSources(data) {
    const s = data.sources || [];
    if (!s.length) return '';
    const body = `<div class="sources-list">${s.map(src => {
      const url = src.url || '';
      const title = src.title || url;
      return url ? `<a href="${escAttr(url)}" target="_blank" rel="noopener">${escHtml(title)}</a>` : '';
    }).join('')}</div>`;
    return this._section({ icon: '🔗', title: 'SOURCES', body, openByDefault: false });
  },
};

function escHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function escAttr(s) { return escHtml(s); }

function getInitials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}
