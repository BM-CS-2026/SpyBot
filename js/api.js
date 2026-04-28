// Anthropic API — direct browser call with web_search tool

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-5-20250929';

const API = {
  async call({ apiKey, system, messages, tools, maxTokens = 16000, onProgress }) {
    if (!apiKey) throw new Error('API key missing. Open Settings to add it.');

    const body = {
      model: MODEL,
      max_tokens: maxTokens,
      messages,
    };
    if (system) body.system = system;
    if (tools) body.tools = tools;

    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let errMsg = `HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        errMsg = errJson.error?.message || errMsg;
      } catch (_) {}
      throw new Error(errMsg);
    }

    const json = await res.json();
    return json;
  },

  // Pull all text blocks out of an Anthropic response
  extractText(response) {
    if (!response?.content) return '';
    return response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');
  },

  // Find first {...} JSON block in a string
  extractJson(text) {
    if (!text) return null;
    // Strip code fences if present
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
    const first = text.indexOf('{');
    if (first < 0) return null;
    // Walk from the back for the last balanced }
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = first; i < text.length; i++) {
      const c = text[i];
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          const candidate = text.slice(first, i + 1);
          try { return JSON.parse(candidate); } catch (_) { /* keep walking */ }
        }
      }
    }
    return null;
  },
};
