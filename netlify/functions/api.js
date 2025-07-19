const { exec } = require('child_process');
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');

// In-memory storage for download requests (in production, use a database)
let downloadRequests = new Map();

// Helper function to extract domain from URL
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (e) {
    return 'unknown';
  }
}

// Real website download using wget
function downloadWebsite(website, token) {
  return new Promise((resolve, reject) => {
    // Update status to processing
    downloadRequests.set(token, {
      status: 'processing',
      progress: 'Starting download...',
      website: website,
      startTime: Date.now()
    });

    let websiteDir = "";
    
    // Use wget to download the website
    // wget -mkEpnp: mirror, convert links, adjust extensions, page requisites, no parent
    const child = exec(`wget -mkEpnp ${website}`);

    // Read stderr for progress updates
    child.stderr.on("data", (response) => {
      if (response.startsWith("Resolving ")) {
        websiteDir = response.substring(response.indexOf('Resolve ') + 11, response.indexOf(' ('));
      }
      
      // Update progress in tracking
      if (downloadRequests.has(token)) {
        const download = downloadRequests.get(token);
        download.progress = response;
        downloadRequests.set(token, download);
      }
    });

    child.stderr.on('close', (response) => {
      // Update status to converting
      if (downloadRequests.has(token)) {
        const download = downloadRequests.get(token);
        download.progress = "Converting to ZIP...";
        downloadRequests.set(token, download);
      }
      
      // Start archiving process
      createArchive(websiteDir, token, resolve, reject);
    });

    // Handle errors
    child.on('error', (error) => {
      console.error('Download error:', error);
      
      if (downloadRequests.has(token)) {
        const download = downloadRequests.get(token);
        download.status = 'error';
        download.error = error.message;
        downloadRequests.set(token, download);
      }
      
      reject(error);
    });
  });
}

// Create ZIP archive of downloaded files
function createArchive(websiteDir, token, resolve, reject) {
  try {
    const filename = websiteDir + '.zip';
    const zipPath = path.join('/tmp', filename);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', {
      zlib: { level: 9 }
    });

    // Listen for archive completion
    output.on('close', function() {
      console.log(archive.pointer() + ' total bytes');
      console.log('Archive finalized');
      
      // Update status to completed
      if (downloadRequests.has(token)) {
        const download = downloadRequests.get(token);
        download.status = 'completed';
        download.filename = filename;
        download.progress = 'Completed';
        download.downloadUrl = `/api/download-file/${filename}`;
        downloadRequests.set(token, download);
      }
      
      resolve();
    });

    // Handle archive errors
    archive.on('error', function(err) {
      console.error('Archive error:', err);
      
      if (downloadRequests.has(token)) {
        const download = downloadRequests.get(token);
        download.status = 'error';
        download.error = err.message;
        downloadRequests.set(token, download);
      }
      
      reject(err);
    });

    // Pipe archive data to file
    archive.pipe(output);

    // Add the downloaded website directory to the archive
    if (fs.existsSync('./' + websiteDir)) {
      archive.directory('./' + websiteDir, false);
    } else {
      // If directory doesn't exist, create a fallback
      archive.append('Website download completed but no files found.', { name: 'README.txt' });
    }

    // Finalize the archive
    archive.finalize();
    
  } catch (error) {
    console.error('Archive creation error:', error);
    
    if (downloadRequests.has(token)) {
      const download = downloadRequests.get(token);
      download.status = 'error';
      download.error = error.message;
      downloadRequests.set(token, download);
    }
    
    reject(error);
  }
}

exports.handler = async (event, context) => {
  console.log('API Function called:', event.path, event.httpMethod);
  
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
  console.log('Processed path:', path);
  
  try {
    // Handle health check
    if (path === '/health' && event.httpMethod === 'GET') {
      console.log('Health check requested');
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          success: true, 
          status: 'ready',
          message: 'Website Downloader API is ready',
          timestamp: new Date().toISOString()
        })
      };
    }
    
    // Handle download request
    if (path === '/download' && event.httpMethod === 'POST') {
      console.log('Download requested');
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
      
      // Start the real download process
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
      console.log('Status check requested for token:', token);
      
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
      console.log('File download requested:', filename);
      
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
      console.log('Unknown endpoint:', path);
      return {
        statusCode: 404,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          success: false, 
          error: 'Endpoint not found',
          path: path,
          method: event.httpMethod
        })
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
      body: JSON.stringify({ 
        success: false, 
        error: error.message,
        stack: error.stack
      })
    };
  }
}; 
