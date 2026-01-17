// ai.js - analyzeImage(dataUrl, model, openaiKey) => { plants: ['spinach','tomato'], confidence: {...} }
export async function analyzeImage(dataUrl, model='gpt-4o-mini-vision', openaiKey){
  if(!openaiKey) throw new Error('OpenAI key required');
  // trim dataUrl if very large; we post as a message content image part
  // Build Responses API payload as structured input (this mirrors OpenAI Responses docs)
  const prompt = buildPrompt();
  // Using Responses API: include an input array with input_text and input_image
  const body = {
    model,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: dataUrl }
        ]
      }
    ],
    // ask for short response
    max_output_tokens: 400
  };
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type':'application/json',
      'Authorization':`Bearer ${openaiKey}`
    },
    body: JSON.stringify(body)
  });
  if(!res.ok){
    const t = await res.text();
    throw new Error('OpenAI error: '+t);
  }
  const data = await res.json();
  // The responses endpoint returns an object; extract text output
  // We expect the model to emit a JSON blob in the first output.
  const output = data.output?.[0];
  const txt = output?.content?.find(c => c.type === 'output_text')?.text || output?.text || JSON.stringify(data);
  // try to parse JSON from output
  const json = parseJsonFromText(txt);
  if(!json) throw new Error('No JSON parsed from model response');
  return json;
}

function parseJsonFromText(txt){
  if(!txt) return null;
  // find first { ... } block
  const start = txt.indexOf('{');
  const end = txt.lastIndexOf('}');
  if(start === -1 || end === -1) return null;
  try{ return JSON.parse(txt.slice(start, end+1)); }catch(e){ return null; }
}

function buildPrompt(){
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
