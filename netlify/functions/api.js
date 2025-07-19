const { exec } = require('child_process');
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');

// In-memory storage for download requests (in production, use a database)
let downloadRequests = new Map();

// Helper function to generate unique token
function generateToken() {
  return 'download_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Helper function to extract domain from URL
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (e) {
    return 'unknown';
  }
}

// Download website using wget
function downloadWebsite(website, token) {
  return new Promise((resolve, reject) => {
    // Update status to processing
    downloadRequests.set(token, {
      status: 'processing',
      progress: 'Starting download...',
      website: website,
      startTime: Date.now()
    });

    // For Netlify functions, we'll simulate the download process
    // In a real implementation, you'd need to use a different approach
    // since wget isn't available in serverless functions
    
    let website = extractDomain(website);
    
    // Simulate download progress
    const progressInterval = setInterval(() => {
      const download = downloadRequests.get(token);
      if (download) {
        download.progress = 'Downloading files...';
        downloadRequests.set(token, download);
      }
    }, 2000);

    // Simulate completion after 5 seconds
    setTimeout(() => {
      clearInterval(progressInterval);
      
      // Create a dummy ZIP file (in production, you'd create the actual archive)
      const filename = website + '.zip';
      const zipPath = path.join('/tmp', filename);
      
      // Create a simple ZIP file for demo purposes
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      
      archive.pipe(output);
      
      // Add a dummy HTML file
      archive.append('<html><body><h1>Downloaded Website</h1><p>This is a demo download.</p></body></html>', { name: 'index.html' });
      
      archive.finalize();
      
      output.on('close', () => {
        // Update status to completed
        downloadRequests.set(token, {
          status: 'completed',
          filename: filename,
          progress: 'Completed',
          downloadUrl: `/api/download-file/${filename}`
        });
        resolve();
      });
      
      archive.on('error', (err) => {
        clearInterval(progressInterval);
        downloadRequests.set(token, {
          status: 'error',
          error: err.message
        });
        reject(err);
      });
    }, 5000);
  });
}

exports.handler = async (event, context) => {
  // Handle CORS preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      },
      body: ''
    };
  }

  const path = event.path.replace('/.netlify/functions/api', '');
  
  try {
    // Handle health check
    if (path === '/health' && event.httpMethod === 'GET') {
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          success: true, 
          status: 'ready',
          message: 'Website Downloader API is ready'
        })
      };
    }
    
    // Handle different API endpoints
    if (path === '/download' && event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);
      const { website, token, options } = body;
      
      if (!website) {
        return {
          statusCode: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ success: false, error: 'Website URL is required' })
        };
      }
      
      if (!token) {
        return {
          statusCode: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ success: false, error: 'Token is required' })
        };
      }
      
      // Start the download process
      downloadWebsite(website, token);
      
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ success: true, token: token })
      };
    }
    
    // Handle status check
    else if (path.startsWith('/status/') && event.httpMethod === 'GET') {
      const token = path.split('/status/')[1];
      
      if (!downloadRequests.has(token)) {
        return {
          statusCode: 404,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ success: false, error: 'Download not found' })
        };
      }
      
      const download = downloadRequests.get(token);
      
      if (download.status === 'completed') {
        return {
          statusCode: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            success: true,
            status: 'completed',
            downloadUrl: download.downloadUrl,
            filename: download.filename
          })
        };
      } else if (download.status === 'error') {
        return {
          statusCode: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            success: false,
            status: 'error',
            error: download.error
          })
        };
      } else {
        return {
          statusCode: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            success: true,
            status: 'processing',
            progress: download.progress
          })
        };
      }
    }
    
    // Handle file download
    else if (path.startsWith('/download-file/') && event.httpMethod === 'GET') {
      const filename = path.split('/download-file/')[1];
      const filePath = `/tmp/${filename}`;
      
      if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath);
        
        return {
          statusCode: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${filename}"`
          },
          body: fileContent.toString('base64'),
          isBase64Encoded: true
        };
      } else {
        return {
          statusCode: 404,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ success: false, error: 'File not found' })
        };
      }
    }
    
    // Handle unknown endpoints
    else {
      return {
        statusCode: 404,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ success: false, error: 'Endpoint not found' })
      };
    }
    
  } catch (error) {
    console.error('API Error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ success: false, error: error.message })
    };
  }
}; 
