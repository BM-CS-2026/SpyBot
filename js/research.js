// Research orchestration — builds the prompt, calls Claude with web_search,
// extracts structured JSON profile.

const RESEARCH_SYSTEM = `You are SpyBot, an expert open-source intelligence research analyst. You research individuals using public web sources (LinkedIn, Google Scholar, Google Patents, USPTO, news, X/Twitter, company sites) and produce a thorough, factual profile.

CORE RULES:
- Use web search aggressively. Run multiple targeted searches across all categories.
- Be factual. If something is not found, say so clearly. NEVER fabricate.
- Prefer recent information (last 2 years) where relevant.
- Output ONLY a single valid JSON object. No prose, no markdown, no code fences before or after.
- Use null for missing string fields and [] for missing arrays.
- Never use em dashes or double hyphens in any output text. Use commas, colons, or periods instead.
- Bullet items use the {main, more} object form. The "main" must be a punchy short headline of 14 words or fewer. The "more" is optional, holds 1 to 2 sentences of nuance, only when it adds real value.
- The glossary MUST define every technical term, journal, acronym, or specialty area mentioned anywhere in the profile in plain English a non-expert can understand.`;

function buildResearchPrompt(name, company, myBio, myLinkedIn, attachedTextBlobs) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const target = company ? `${name} at ${company}` : name;

  const userParts = [];
  if (myLinkedIn && myLinkedIn.trim()) {
    userParts.push(`User's LinkedIn profile (look this up via web search to learn the user's career, education, and locations): ${myLinkedIn.trim()}`);
  }
  if (myBio && myBio.trim()) {
    userParts.push(`User's bio (free-form supplement):\n${myBio.trim()}`);
  }
  const bioBlock = userParts.length
    ? `\n\nABOUT THE USER (use this to find common ground with the target):\n${userParts.join('\n\n')}\n\nIMPORTANT: Do at least one explicit web search on the user's LinkedIn URL (or "site:linkedin.com/in/" pattern) so you actually know the user's background. Then COMPARE the user and the target across employers, schools, cities, fields, projects, eras, and interests.\n`
    : '\n\nNO USER LINKEDIN OR BIO PROVIDED. Set common_ground arrays to empty [] and add a single item asking the user to fill in their LinkedIn URL or bio in Settings.\n';

  const textContext = attachedTextBlobs && attachedTextBlobs.length
    ? `\n\nATTACHED TEXT CONTEXT (user-provided info about the target, treat as primary source):\n${attachedTextBlobs.map((t, i) => `--- file ${i + 1} ---\n${t}`).join('\n\n')}\n`
    : '';

  return `Research this person thoroughly: ${target}
Today's date: ${today}
${bioBlock}${textContext}
SEARCH AGGRESSIVELY. Run MANY web searches with varied queries. Do not stop after the first few hits. Use AT LEAST 15 to 25 distinct searches. Vary the queries: name alone, name + company, name + city, name + topic, name + university, name + "interview", name + "podcast", name + "speaker", name + "patent", name + "@" (for handles).

Cover ALL of these categories with explicit searches:

PROFESSIONAL & CAREER
- Current role, title, employer, location, team
- LinkedIn profile (run a "linkedin.com/in/${name}" search)
- Career history (full chronology, every employer with dates)
- Education (degrees, institutions, years, advisors)
- Patents (Google Patents, USPTO, EPO)
- Academic publications (Google Scholar, ResearchGate, ORCID)
- Books, book chapters, technical reports
- Conference talks, keynotes, panels (search "${name} speaker", "${name} keynote", "${name} talk")
- Podcast appearances (search "${name} podcast")
- Interviews and press features (search "${name} interview")
- Awards, fellowships, board seats, advisory roles

SOCIAL MEDIA — search EACH platform explicitly:
- LinkedIn: profile, posts, articles, comments, groups
- Twitter / X: handle, bio, recent posts, pinned post, what they retweet, who they reply to
- Facebook (public posts and pages)
- Instagram (handle, public bio)
- YouTube (channel, talks, videos)
- TikTok (if relevant to their field)
- Threads, Bluesky, Mastodon (newer social)
- GitHub (username, repos, README profile, contribution patterns)
- Medium and Substack (articles authored)
- ResearchGate, Academia.edu (academics)
- Reddit (username if public)
- Personal blog or website (search "${name} blog" and "${name} personal website")

NEWS, MENTIONS, PRESENCE
- Recent news (last 2 years): search news sites directly
- Press releases citing them
- Quotes in articles
- Court records, SEC filings, charity registrations (only if public)
- Alumni magazine features
- Local newspaper mentions

PERSONAL CONTEXT
- Hobbies, interests, sports, causes (look in social posts and interviews)
- Places lived, studied, worked (be specific: cities, neighborhoods)
- Family or partner mentions (only if openly public, e.g. spouse credited in book)
- Volunteer work, nonprofits, religious or community involvement
- A profile photo URL (LinkedIn headshot, company "about" page, conference speaker photo, news photo)

If attached files (PDFs/images/text) were provided, treat them as PRIMARY source material and integrate their content with web findings.

For social handles found, include them in professional_details.social with their URL. Note recent post themes if observable.

Then output ONLY this JSON object (no other text, no code fences):

{
  "name": "Full name",
  "company": "Current company or null",
  "headline": "One-line current role + company",
  "location": "City, Country (or null)",
  "photo_url": "Direct image URL (https://...) or null. Must be a real public image, not a search page.",
  "what_doing_now": [
    {"main": "Short headline 14 words or fewer", "more": "Optional 1 to 2 sentence detail or null"}
  ],
  "common_ground": {
    "current": [
      {"main": "Specific overlap right now between user and target", "more": "Why it matters or what to say about it"}
    ],
    "historical": [
      {"main": "Specific past overlap (school, city, employer, project, era)", "more": "Optional context"}
    ]
  },
  "career_timeline": [
    {"years": "2020 to present", "role": "Title", "company": "Company", "note": "1 short sentence on what they did/are doing"}
  ],
  "conversation_small_talk": {
    "personal_hooks": [{"main": "Specific hook tied to their actual recent work", "more": "Optional extra context"}],
    "previous_achievements": [{"main": "Specific past win", "more": null}],
    "hobbies_interests": [{"main": "Hobby or interest", "more": null}],
    "geography_facts": [{"main": "Fact about a place they live or work", "more": null}],
    "history_facts": [{"main": "Historical fact about a place they lived, studied, worked", "more": null}],
    "field_context": [{"main": "Light context about their field", "more": null}]
  },
  "professional_details": {
    "education": [{"main": "Degree, Institution, Year", "more": null}],
    "patents": [{"title": "Patent title", "number": "US10000000B2", "year": "2022"}],
    "publications": [{"title": "Paper title", "venue": "Journal/Conference", "year": "2023"}],
    "awards": [{"main": "Award name, year, granting body", "more": null}],
    "social": [{"platform": "LinkedIn", "url": "https://...", "themes": "What they post about"}],
    "recent_news": [{"main": "Headline (with date)", "more": "1 to 2 sentence summary"}]
  },
  "character_assessment": {
    "work_style": "Individual contributor / team player / leader / visionary. 1 sentence why.",
    "archetype": "Innovator / builder / strategist / operator / evangelist / seller / technical expert. 1 sentence why.",
    "communication_style": "Technical / business / inspirational / data-driven / storyteller.",
    "drivers": "What seems to motivate them professionally (1 to 2 sentences).",
    "looking_for": "Best inference of what this person is currently looking for. Be specific (1 to 3 sentences)."
  },
  "glossary": [
    {"term": "USPTO", "explanation": "United States Patent and Trademark Office. The federal agency that grants patents."}
  ],
  "sources": [{"title": "Source title", "url": "https://..."}]
}

Final reminders:
- Output ONLY the JSON object. No leading prose. No trailing prose. No markdown.
- For unknown facts, use empty array [] or null. Do NOT invent.
- Each "main" headline is 14 words or fewer. Do NOT cram everything into "main". Use "more" for nuance.
- "common_ground" must be SPECIFIC: name the school, the city, the company, the topic. If no overlaps found, return []. Do not invent.
- The glossary must define ALL acronyms and technical terms used elsewhere in the profile.
- No em dashes or double hyphens anywhere.`;
}

const Research = {
  // Build params (model/max_tokens/system/messages/tools) for one target.
  // Used by both batch submission and (future) direct streaming.
  buildParams(name, company, options = {}) {
    const { myBio, myLinkedIn, attachedFiles } = options;

    const textBlobs = [];
    const contentBlocks = [];
    if (attachedFiles && attachedFiles.length) {
      for (const f of attachedFiles) {
        if (f.type === 'text') textBlobs.push(f.content);
        else if (f.type === 'image') {
          contentBlocks.push({
            type: 'image',
            source: { type: 'base64', media_type: f.mediaType, data: f.data },
          });
        } else if (f.type === 'pdf') {
          contentBlocks.push({
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: f.data },
          });
        }
      }
    }

    const prompt = buildResearchPrompt(name, company, myBio, myLinkedIn, textBlobs);
    contentBlocks.push({ type: 'text', text: prompt });

    return {
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 16000,
      system: RESEARCH_SYSTEM,
      messages: [{ role: 'user', content: contentBlocks }],
      tools: [
        { type: 'web_search_20250305', name: 'web_search', max_uses: 30 },
      ],
    };
  },

  // Given a single batch result entry, extract the profile JSON.
  // resultEntry shape: {custom_id, result: {type:'succeeded'|'errored'|..., message?, error?}}
  parseResult(resultEntry, fallbackName) {
    const r = resultEntry?.result;
    if (!r) throw new Error('Empty batch result');
    if (r.type !== 'succeeded') {
      const detail = r.error?.message || r.error?.type || r.type;
      throw new Error(`Batch ${r.type}: ${detail}`);
    }
    const message = r.message;
    const text = (message?.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');
    const json = API.extractJson(text);
    if (!json) {
      console.error('Could not parse JSON from batch response. Raw text:', text);
      throw new Error('Got response but could not parse JSON');
    }
    if (fallbackName && !json.name) json.name = fallbackName;
    return json;
  },
};
