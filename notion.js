// notion.js - minimal functions to save rows and fetch this week's items
// Expects Notion v1 API token and DB id for a simple database with properties:
// Date (date), Canonical Plant (title), Original Label (rich_text), Source (select)

export async function saveRowsToNotion(rows, notionToken, notionDbId){
  if(!notionToken || !notionDbId) throw new Error('Notion credentials required');
  // Create page per row
  for(const r of rows){
    const body = {
      parent: { database_id: notionDbId },
      properties: {
        "Date": { date: { start: r.date } },
        "Canonical Plant": { title: [{ text: { content: r.canonical } }] },
        "Original Label": { rich_text: [{ text: { content: r.original } }] },
        "Source": { select: { name: r.source || 'photo' } }
      }
    };
    const res = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if(!res.ok){
      const t = await res.text();
      console.error('Notion write failed', t);
      throw new Error('Notion error: ' + t);
    }
  }
  return true;
}

export async function fetchWeekEntries(notionToken, notionDbId, opts={all:false}){
  // Query Notion DB for pages in the current ISO week
  if(!notionToken || !notionDbId) return [];
  // compute ISO week start & end in ISO date
  const now = new Date();
  const start = startOfISOWeek(now).toISOString();
  const end = endOfISOWeek(now).toISOString();
  // Basic filter by Date property between start and end
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
  const res = await fetch(`https://api.notion.com/v1/databases/${notionDbId}/query`,{
    method:'POST',
    headers:{
      'Authorization':`Bearer ${notionToken}`,
      'Notion-Version':'2022-06-28',
      'Content-Type':'application/json'
    },
    body: JSON.stringify(payload)
  });
  if(!res.ok){ console.error(await res.text()); return []; }
  const data = await res.json();
  const results = data.results.map(p => {
    const get = (name) => {
      const v = p.properties[name];
      if(!v) return null;
      if(v.title) return v.title[0]?.plain_text || '';
      if(v.rich_text) return v.rich_text[0]?.plain_text || '';
      if(v.date) return v.date.start || '';
      return '';
    };
    return { canonical: get('Canonical Plant'), original: get('Original Label'), date: get('Date') };
  });
  return results;
}

function startOfISOWeek(d){
  const date = new Date(d); const day = date.getDay() || 7;
  if(day !== 1) date.setHours(-24*(day-1));
  date.setHours(0,0,0,0); return date;
}
function endOfISOWeek(d){
  const s = startOfISOWeek(d); const e = new Date(s); e.setDate(s.getDate()+6); return e;
}
