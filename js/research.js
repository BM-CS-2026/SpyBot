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
      {"main": "Specific overlap right now", "more": "EVIDENCE on both sides. Format: 'You: <fact from user LinkedIn/bio>. Target: <fact from target>.'", "source": "https://... — URL where the TARGET's side of the overlap was found, or null"}
    ],
    "historical": [
      {"main": "Specific past overlap (school, city, employer, project)", "more": "EVIDENCE on both sides. Format: 'You: <fact>. Target: <fact>.'", "source": "https://... — URL where the TARGET's side of the overlap was found, or null"}
    ]
  },
  "career_timeline": [
    {"years": "2020 to present", "role": "Title", "company": "Company", "note": "1 short sentence on what they did/are doing"}
  ],
  "conversation_small_talk": {
    "personal_hooks": [{"main": "Specific hook tied to their actual recent work", "more": "Optional extra context", "source": "https://... where you found this"}],
    "previous_achievements": [{"main": "Specific past win", "more": null, "source": "https://..."}],
    "hobbies_interests": [{"main": "Hobby or interest", "more": null, "source": "https://..."}],
    "geography_facts": [{"main": "Fact about a place they live or work", "more": null, "source": "https://..."}],
    "history_facts": [{"main": "Historical fact about a place they lived, studied, worked", "more": null, "source": "https://..."}],
    "field_context": [{"main": "Light context about their field", "more": null, "source": "https://..."}]
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

SPECIAL CASE — NOT FOUND:
If after thorough searching you genuinely cannot find this specific person (no LinkedIn, no news, no academic record, no social presence), output ONLY this alternative JSON instead of the full profile:

{
  "not_found": true,
  "searched_for": "${target}",
  "reason": "1 to 2 sentences on what you tried and why nothing matched",
  "suggestions": [
    {"name": "Alternative spelling 1", "company": "company hint or null", "why": "1 short sentence: 'common Hebrew variant', 'with double t', 'transliterated from Cyrillic', 'maybe full first name', etc."},
    {"name": "Alternative spelling 2", "company": "...", "why": "..."}
  ]
}

Provide 3 to 6 suggestions. Focus on:
- Spelling variants differing by 1 to 2 letters (Ishay/Ishai, Atar/Attar, Steven/Stephen, Dmitri/Dmitry)
- Transliteration variants (Hebrew, Arabic, Cyrillic, East Asian)
- Nickname vs full form (Bob/Robert, Sasha/Alexander, Liz/Elizabeth)
- Reversed first/last name order
- Same surname at the same company (if a company hint was given)

Run at least one quick web search per suggestion to confirm the variant matches a real person. Do not invent names.

Use this not_found schema ONLY when truly nothing relevant turns up. If you find ANY data on the original target, even partial, fill out the regular profile schema.

COMMON_GROUND RIGOR (CRITICAL — many past mistakes here):
- Output an overlap ONLY when you have HARD EVIDENCE on BOTH sides. Both the user's record and the target's record must each independently state the same school / city / employer / project / year.
- DO NOT infer. DO NOT assume. "Both Israeli", "both engineers", "both in tech" are NOT overlaps.
- Same country alone is NOT an overlap. Same era alone is NOT an overlap. Same broad industry alone is NOT an overlap.
- For each item, the "more" field MUST be in the format: "You: <specific verifiable fact about user>. Target: <specific verifiable fact about target>." If you cannot fill both halves with concrete cited facts, OMIT the item.
- An EMPTY common_ground array is ALWAYS BETTER than a wrong overlap. Returning [] when no real overlap exists is the correct behavior.
- NEVER invent a school year, city date, or employer to make an overlap fit. If the dates don't match (e.g. user at MIT 1998-2002, target at MIT 2010-2014), that is NOT an overlap unless you specifically explain "alumni of same institution".

SOURCES on bullet items (apply to common_ground AND conversation_small_talk):
- Every item in common_ground.current, common_ground.historical, and every item under conversation_small_talk MUST include a "source" URL.
- The source URL points to where you found the TARGET's side of the fact. NEVER link to the user's own LinkedIn or bio.
- The source must be a real URL you actually found in your web searches, not a guess and not a search-page URL.
- If you genuinely have no source URL for the target side (e.g. general knowledge about a city), use null. But for common_ground specifically, if you cannot cite the target's side, you should OMIT the overlap entirely (per the rigor rule above).

Final reminders:
- Output ONLY the JSON object. No leading prose. No trailing prose. No markdown.
- For unknown facts, use empty array [] or null. Do NOT invent.
- Each "main" headline is 14 words or fewer. Do NOT cram everything into "main". Use "more" for nuance.
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

  // Stream a single research call and return parsed JSON.
  async run(apiKey, name, company, options = {}) {
    const params = this.buildParams(name, company, options);

    let searchCount = 0;
    let lastTextNotify = 0;

    const text = await API.callStream({
      apiKey,
      system: params.system,
      messages: params.messages,
      tools: params.tools,
      maxTokens: params.max_tokens,
      onEvent: (ev) => {
        if (ev.type === 'tool_use') {
          searchCount++;
          options.onProgress?.(`search ${searchCount}/30`);
        } else if (ev.type === 'text' && ev.accumulated > lastTextNotify + 300) {
          lastTextNotify = ev.accumulated;
          options.onProgress?.(`compiling · ${(ev.accumulated / 1000).toFixed(1)}k chars`);
        }
      },
    });

    const json = API.extractJson(text);
    if (!json) {
      console.error('Could not parse JSON from response. Raw text:', text);
      throw new Error('Got response but could not parse JSON');
    }
    if (!json.name && !json.not_found) json.name = name;
    return json;
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
