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

  // Streaming variant — keeps the connection actively receiving SSE events,
  // which iOS Safari is much less likely to suspend than a silent long fetch.
  // onEvent gets called with {type:'text'|'tool_use'|'tool_result', accumulated?, name?}
  // Returns final assistant text.
  async callStream({ apiKey, system, messages, tools, maxTokens = 16000, onEvent }) {
    if (!apiKey) throw new Error('API key missing. Open Settings to add it.');

    const body = {
      model: MODEL,
      max_tokens: maxTokens,
      messages,
      stream: true,
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

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let assistantText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop();
      for (const part of parts) {
        let dataLine = '';
        for (const line of part.split('\n')) {
          if (line.startsWith('data: ')) dataLine = line.slice(6);
        }
        if (!dataLine || dataLine === '[DONE]') continue;
        let json;
        try { json = JSON.parse(dataLine); } catch (_) { continue; }

        if (json.type === 'content_block_delta') {
          if (json.delta?.type === 'text_delta' && json.delta.text) {
            assistantText += json.delta.text;
            onEvent?.({ type: 'text', accumulated: assistantText.length });
          }
        } else if (json.type === 'content_block_start') {
          const blk = json.content_block;
          if (blk?.type === 'server_tool_use') {
            onEvent?.({ type: 'tool_use', name: blk.name || 'web_search' });
          } else if (blk?.type === 'web_search_tool_result') {
            onEvent?.({ type: 'tool_result' });
          }
        } else if (json.type === 'error') {
          throw new Error(json.error?.message || 'Stream error');
        }
      }
    }

    return assistantText;
  },

  // ── Batch API ───────────────────────────────────────────
  async submitBatch({ apiKey, requests }) {
    const res = await fetch('https://api.anthropic.com/v1/messages/batches', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ requests }),
    });
    if (!res.ok) {
      let err = `HTTP ${res.status}`;
      try { err = (await res.json()).error?.message || err; } catch (_) {}
      throw new Error(err);
    }
    return await res.json();
  },

  async getBatch({ apiKey, batchId }) {
    const res = await fetch(`https://api.anthropic.com/v1/messages/batches/${batchId}`, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
    });
    if (!res.ok) {
      let err = `HTTP ${res.status}`;
      try { err = (await res.json()).error?.message || err; } catch (_) {}
      throw new Error(err);
    }
    return await res.json();
  },

  async getBatchResults({ apiKey, resultsUrl }) {
    const res = await fetch(resultsUrl, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching batch results`);
    const text = await res.text();
    return text.split('\n').filter(Boolean).map(line => JSON.parse(line));
  },

  async cancelBatch({ apiKey, batchId }) {
    try {
      await fetch(`https://api.anthropic.com/v1/messages/batches/${batchId}/cancel`, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
      });
    } catch (_) { /* best effort */ }
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
