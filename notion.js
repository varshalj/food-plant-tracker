// notion.js - Functions to save rows and fetch entries via the serverless proxy
// Uses /api/notion to avoid CORS issues with direct Notion API calls

export async function saveRowsToNotion(rows, notionToken, notionDbId) {
  if (!notionToken || !notionDbId) throw new Error('Notion credentials required');
  
  // Create page per row
  for (const r of rows) {
    const response = await fetch('/api/notion', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'createPage',
        notionToken,
        notionDbId,
        payload: {
          properties: {
            "Date": { date: { start: r.date } },
            "Canonical Plant": { title: [{ text: { content: r.canonical } }] },
            "Original Label": { rich_text: [{ text: { content: r.original } }] },
            "Source": { select: { name: r.source || 'photo' } }
          }
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Notion write failed', errorData);
      throw new Error('Notion error: ' + (errorData.error || 'Unknown error'));
    }
  }
  return true;
}

export async function fetchWeekEntries(notionToken, notionDbId, opts = { all: false }) {
  if (!notionToken || !notionDbId) return [];
  
  // Compute ISO week start & end
  const now = new Date();
  const start = startOfISOWeek(now).toISOString();
  const end = endOfISOWeek(now).toISOString();
  
  // Build filter payload
  const payload = {
    filter: {
      and: [
        {
          property: "Date",
          date: { on_or_after: start }
        },
        {
          property: "Date",
          date: { on_or_before: end }
        }
      ]
    },
    page_size: 100
  };

  const response = await fetch('/api/notion', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'queryDatabase',
      notionToken,
      notionDbId,
      payload
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error('Notion query failed:', errorData);
    return [];
  }

  const data = await response.json();
  
  const results = data.results.map(p => {
    const get = (name) => {
      const v = p.properties[name];
      if (!v) return null;
      if (v.title) return v.title[0]?.plain_text || '';
      if (v.rich_text) return v.rich_text[0]?.plain_text || '';
      if (v.date) return v.date.start || '';
      return '';
    };
    return { 
      canonical: get('Canonical Plant'), 
      original: get('Original Label'), 
      date: get('Date') 
    };
  });
  
  return results;
}

function startOfISOWeek(d) {
  const date = new Date(d);
  const day = date.getDay() || 7;
  if (day !== 1) date.setHours(-24 * (day - 1));
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfISOWeek(d) {
  const s = startOfISOWeek(d);
  const e = new Date(s);
  e.setDate(s.getDate() + 6);
  e.setHours(23, 59, 59, 999);
  return e;
}
