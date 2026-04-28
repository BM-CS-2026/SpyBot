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

function buildResearchPrompt(name, company, myBio, attachedTextBlobs) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const target = company ? `${name} at ${company}` : name;

  const bioBlock = myBio && myBio.trim()
    ? `\n\nABOUT THE USER (find common ground with this person):\n${myBio.trim()}\n`
    : '\n\nNO USER BIO PROVIDED. Set common_ground arrays to empty [] and add a single item explaining the bio is needed.\n';

  const textContext = attachedTextBlobs && attachedTextBlobs.length
    ? `\n\nATTACHED TEXT CONTEXT (user-provided info about the target, treat as primary source):\n${attachedTextBlobs.map((t, i) => `--- file ${i + 1} ---\n${t}`).join('\n\n')}\n`
    : '';

  return `Research this person thoroughly: ${target}
Today's date: ${today}
${bioBlock}${textContext}
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

If attached files (PDFs/images/text) were provided, treat them as PRIMARY source material and integrate their content with web findings.

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
  async run(apiKey, name, company, options = {}) {
    const { myBio, attachedFiles, onProgress } = options;
    onProgress?.('Composing query');

    // Split attached files by type
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

    const prompt = buildResearchPrompt(name, company, myBio, textBlobs);
    contentBlocks.push({ type: 'text', text: prompt });

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
      messages: [{ role: 'user', content: contentBlocks }],
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
