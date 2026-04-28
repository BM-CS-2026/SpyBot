// Research orchestration — builds the prompt, calls Claude with web_search,
// extracts structured JSON profile.

const RESEARCH_SYSTEM = `You are SpyBot, an expert open-source intelligence research analyst. You research individuals using public web sources (LinkedIn, Google Scholar, Google Patents, USPTO, news, X/Twitter, company sites) and produce a thorough, factual profile.

CORE RULES:
- Use web search aggressively — run multiple targeted searches across all categories.
- Be factual. If something is not found, say so clearly. NEVER fabricate.
- Prefer recent information (last 2 years) where relevant.
- Output ONLY a single valid JSON object. No prose, no markdown, no code fences before or after.
- Use null for missing string fields and [] for missing arrays.
- The glossary MUST define every technical term, journal, acronym, or specialty area mentioned anywhere in the profile in plain English a non-expert can understand.`;

function buildResearchPrompt(name, company) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const target = company ? `${name} at ${company}` : name;

  return `Research this person thoroughly: ${target}
Today's date: ${today}

Run web searches covering ALL of these categories:
1. Current role, title, employer, location
2. LinkedIn profile and recent posts
3. Career history (full chronology)
4. Education (degrees, institutions, years)
5. Patents (Google Patents / USPTO)
6. Academic publications, papers, books
7. Twitter/X and other social media
8. Awards, board seats, keynote talks
9. Recent news, interviews, press (last 2 years)
10. Hobbies, interests, places lived
11. A profile photo URL (LinkedIn headshot, company "about" page, news photo)

Then output ONLY this JSON object (no other text, no code fences):

{
  "name": "Full name",
  "company": "Current company or null",
  "headline": "One-line current role + company",
  "location": "City, Country (or null)",
  "photo_url": "Direct image URL (https://...) or null. Must be a real public image, not a search page.",
  "what_doing_now": ["Bullet points about current focus, recent moves, latest news. 4-7 bullets."],
  "career_timeline": [
    {"years": "2020 – present", "role": "Title", "company": "Company", "note": "1 sentence on what they did/are doing"}
  ],
  "conversation_small_talk": {
    "personal_hooks": ["Specific, personal conversation starters tied to their actual recent work, posts, or achievements. 5-7 bullets. NEVER generic."],
    "previous_achievements": ["Notable past wins they'd be proud to discuss. 3-5 bullets."],
    "hobbies_interests": ["Hobbies, sports, causes, side passions if found. Otherwise []."],
    "geography_facts": ["Interesting facts about cities/countries where they currently live or work — culture, food, landmarks, recent events. 3-5 bullets."],
    "history_facts": ["Interesting historical facts about places they've lived, studied, or worked — universities, cities, companies. 3-5 bullets."],
    "field_context": ["Light, conversational context about their field — recent breakthroughs, debates, big names, interesting trivia. 3-5 bullets."]
  },
  "professional_details": {
    "education": ["Degree, Institution, Year (one per bullet)"],
    "patents": [{"title": "Patent title", "number": "US10000000B2 or similar", "year": "2022"}],
    "publications": [{"title": "Paper title", "venue": "Journal/Conference", "year": "2023"}],
    "awards": ["Award name, year, granting body"],
    "social": [{"platform": "LinkedIn", "url": "https://...", "themes": "What they post about"}],
    "recent_news": ["News item with date and brief summary"]
  },
  "character_assessment": {
    "work_style": "Individual contributor / team player / leader / visionary — pick best fit and 1 sentence why",
    "archetype": "Innovator / builder / strategist / operator / evangelist / seller / technical expert — pick 1-2 with 1 sentence why",
    "communication_style": "Technical / business / inspirational / data-driven / storyteller — pick best fit",
    "drivers": "What seems to motivate them professionally (1-2 sentences)",
    "looking_for": "Best inference of what this person is currently looking for — career-wise, professionally, intellectually. What kinds of opportunities, conversations, or partnerships would resonate. Be specific (1-3 sentences)."
  },
  "glossary": [
    {"term": "USPTO", "explanation": "United States Patent and Trademark Office — the federal agency that grants patents."},
    {"term": "Field-specific term", "explanation": "Plain-English explanation."}
  ],
  "sources": [{"title": "Source title", "url": "https://..."}]
}

Final reminders:
- Output ONLY the JSON object. No leading prose. No trailing prose. No markdown.
- For unknown facts, use empty array [] or null. Do NOT invent.
- Make conversation_small_talk hooks SPECIFIC to this person's actual work, not generic.
- The glossary must define ALL acronyms and technical terms used elsewhere in the profile.
- Ensure photo_url is a direct image URL (ends in .jpg/.png/.jpeg/.webp or is from a known image CDN). If unsure, use null.`;
}

const Research = {
  async run(apiKey, name, company, onProgress) {
    onProgress?.('Composing query');

    const prompt = buildResearchPrompt(name, company);
    onProgress?.('Querying Claude + web search');

    const response = await API.call({
      apiKey,
      system: RESEARCH_SYSTEM,
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 20,
        },
      ],
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 16000,
    });

    onProgress?.('Parsing intel');

    const text = API.extractText(response);
    const json = API.extractJson(text);
    if (!json) {
      console.error('Could not parse JSON from response. Raw text:', text);
      throw new Error('Got response but could not parse JSON. Try again or check the console.');
    }
    json.name = json.name || name;
    return json;
  },
};
