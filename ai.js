// ai.js - analyzeImage(dataUrl, model, openaiKey) => { plants: ['spinach','tomato'], confidence: {...} }
export async function analyzeImage(dataUrl, model = 'gpt-4o-mini', openaiKey) {
  if (!openaiKey) throw new Error('OpenAI key required');
  
  const prompt = buildPrompt();
  
  const body = {
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { 
            type: "image_url", 
            image_url: { 
              url: dataUrl,
              detail: "low"  // Use "low" for faster/cheaper, "high" for more detail
            }
          }
        ]
      }
    ],
    max_tokens: 400
  };
  
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiKey}`
    },
    body: JSON.stringify(body)
  });
  
  if (!res.ok) {
    const t = await res.text();
    throw new Error('OpenAI error: ' + t);
  }
  
  const data = await res.json();
  const txt = data.choices?.[0]?.message?.content || '';
  
  const json = parseJsonFromText(txt);
  if (!json) throw new Error('No JSON parsed from model response');
  return json;
}

function parseJsonFromText(txt) {
  if (!txt) return null;
  const start = txt.indexOf('{');
  const end = txt.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try { 
    return JSON.parse(txt.slice(start, end + 1)); 
  } catch (e) { 
    return null; 
  }
}

function buildPrompt() {
  return `You are a helpful kitchen assistant. Analyze the provided image and return a STRICT JSON object (no extra text) with two keys:
{
 "plants": ["spinach","tomato","lentil"],
 "confidence": {"spinach":0.91,"tomato":0.87}
}
Rules:
- Return only plants/plant foods visible or strongly implied in the meal: vegetables, fruits, legumes, grains, nuts, seeds, herbs, spices (but spices can be low-confidence).
- Exclude any animal products (meat, fish, eggs, dairy) from the plants array.
- Use lowercase singular nouns. No plurals.
- If unsure about a plant, include it but set confidence < 0.6.
- If you cannot identify plants, return {"plants": [], "confidence": {}}.
- Try to split composed dishes into components (e.g., 'dal with spinach and tomato' -> 'lentil','spinach','tomato').
End.`;
}
