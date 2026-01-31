import type { VercelRequest, VercelResponse } from '@vercel/node';

const MOLTBOOK_API = 'https://www.moltbook.com/api/v1';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const apiKey = req.headers['x-moltbook-identity'] as string;

  if (!apiKey) {
    return res.json({ error: 'No API key provided' });
  }

  try {
    const statusResponse = await fetch(`${MOLTBOOK_API}/agents/status`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    const statusText = await statusResponse.text();

    res.json({
      statusCode: statusResponse.status,
      statusOk: statusResponse.ok,
      responseText: statusText,
      headers: Object.fromEntries(statusResponse.headers.entries()),
    });
  } catch (error: any) {
    res.json({
      error: error.message,
      stack: error.stack,
    });
  }
}
