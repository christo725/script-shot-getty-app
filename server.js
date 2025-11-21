const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Helper function to build Getty API URL with query parameters
const buildGettyUrl = (endpoint, queryString) => {
  const baseUrl = 'https://api.gettyimages.com/v3';
  const params = new URLSearchParams(queryString);
  // Don't override fields or sort_order if already provided
  if (!params.has('fields')) {
    params.append('fields', 'id,title,thumb,preview,date_created');
  }
  if (!params.has('sort_order')) {
    params.append('sort_order', 'best_match');
  }
  return `${baseUrl}${endpoint}?${params.toString()}`;
};

// Proxy endpoint for Getty Images videos
app.get('/api/getty/videos', async (req, res) => {
  try {
    const authToken = req.headers.authorization;
    if (!authToken || !authToken.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Invalid or missing authorization token' });
    }

    const token = authToken.split(' ')[1];
    console.log('Making Getty video request with query:', req.query);
    const response = await fetch(
      buildGettyUrl('/search/videos/editorial', req.query),
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
    console.log(`Getty API video response: ${data.videos?.length || 0} videos found for phrase: ${req.query.phrase}`);
    if (data.videos?.length > 0) {
      console.log('Sample video result:', data.videos[0]?.title);
    }
    res.json(data);
  } catch (error) {
    console.error('Getty Videos API Error:', error);
    res.status(500).json({ error: 'Failed to fetch Getty videos', details: error.message });
  }
});

// Proxy endpoint for Getty Images photos
app.get('/api/getty/photos', async (req, res) => {
  try {
    const authToken = req.headers.authorization;
    if (!authToken || !authToken.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Invalid or missing authorization token' });
    }

    const token = authToken.split(' ')[1];
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
});

app.listen(port, () => {
  console.log(`Proxy server running on port ${port}`);
}); 