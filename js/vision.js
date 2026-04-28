// Vision — extract person names from an image (photo / screenshot)

const Vision = {
  async extractNames(apiKey, imageFile) {
    const base64 = await fileToBase64(imageFile);
    const mediaType = imageFile.type || 'image/jpeg';

    const prompt = `Look at this image (likely a screenshot, photograph of a name list, business cards, or printed document). Extract every PERSON NAME you see.

Rules:
- Return ONLY first + last names of people. Skip company names, job titles, locations, emails.
- If a name is followed by "@ Company" or "from Company", include the company in a separate field.
- Strip salutations (Dr., Prof., Mr., Mrs.) — keep just the name.
- If a name appears multiple times, include it only once.

Output ONLY this JSON (no prose, no code fences):
{"names": [{"name": "Jane Doe", "company": "Acme Corp or null"}, ...]}`;

    const response = await API.call({
      apiKey,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: prompt },
        ],
      }],
      maxTokens: 1500,
    });

    const text = API.extractText(response);
    const json = API.extractJson(text);
    if (!json || !Array.isArray(json.names)) {
      throw new Error('Could not extract names from image. Try a clearer photo.');
    }
    return json.names.filter(n => n.name && n.name.trim().length > 1);
  },
};

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
