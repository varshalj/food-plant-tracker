// api/notion.js - Vercel serverless function to proxy Notion API requests
// This avoids CORS issues since server-to-server requests don't have CORS restrictions

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, notionToken, notionDbId, payload } = req.body;

  // Validate required fields
  if (!notionToken || !notionDbId) {
    return res.status(400).json({ error: 'Missing Notion credentials' });
  }

  const headers = {
    'Authorization': `Bearer ${notionToken}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json'
  };

  try {
    let response;

    switch (action) {
      case 'createPage':
        // Create a new page (save a plant entry)
        response = await fetch('https://api.notion.com/v1/pages', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            parent: { database_id: notionDbId },
            properties: payload.properties
          })
        });
        break;

      case 'queryDatabase':
        // Query the database (fetch entries)
        response = await fetch(`https://api.notion.com/v1/databases/${notionDbId}/query`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });
        break;

      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

    const data = await response.json();

    if (!response.ok) {
      console.error('Notion API error:', data);
      return res.status(response.status).json({ error: data.message || 'Notion API error', details: data });
    }

    return res.status(200).json(data);

  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}
