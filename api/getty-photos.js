const fetch = require('node-fetch');

// Helper function to build Getty API URL with query parameters
const buildGettyUrl = (endpoint, queryParams) => {
  const baseUrl = 'https://api.gettyimages.com/v3';
  const params = new URLSearchParams(queryParams);
  // Don't override fields or sort_order if already provided
  if (!params.has('fields')) {
    params.append('fields', 'id,title,thumb,preview,date_created');
  }
  if (!params.has('sort_order')) {
    params.append('sort_order', 'best_match');
  }
  return `${baseUrl}${endpoint}?${params.toString()}`;
};

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authToken = req.headers.authorization;
    if (!authToken || !authToken.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Invalid or missing authorization token' });
    }

    console.log('Making Getty photo request with query:', req.query);
    const response = await fetch(
      buildGettyUrl('/search/images/editorial', req.query),
      {
        method: 'GET',
        headers: {
          'Api-Key': process.env.REACT_APP_GETTY_API_KEY,
          'Authorization': authToken,
        }
      }
    );
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Getty API Error:', errorData);
      return res.status(response.status).json(errorData);
    }

    const data = await response.json();
    console.log(`Getty API photo response: ${data.images?.length || 0} images found for phrase: ${req.query.phrase}`);
    if (data.images?.length > 0) {
      console.log('Sample image result:', data.images[0]?.title);
    }
    res.json(data);
  } catch (error) {
    console.error('Getty Photos API Error:', error);
    res.status(500).json({ error: 'Failed to fetch Getty photos', details: error.message });
  }
};

