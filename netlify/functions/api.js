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

// Real website download using wget, always to /tmp/<token>
function downloadWebsite(website, token) {
  return new Promise((resolve, reject) => {
    // Update status to processing
    downloadRequests.set(token, {
      status: 'processing',
      progress: 'Starting download...',
      website: website,
      startTime: Date.now()
    });

    const downloadDir = `/tmp/${token}`;
    // Ensure the directory exists
    fs.mkdirSync(downloadDir, { recursive: true });

    // Use wget to download the website into /tmp/<token>
    // wget -mkEpnp -P /tmp/<token> <website>
    const wgetCmd = `wget -mkEpnp -P ${downloadDir} --no-check-certificate ${website}`;
    const child = exec(wgetCmd);

    // Read stderr for progress updates
    child.stderr.on('data', (response) => {
      // Update progress in tracking
      if (downloadRequests.has(token)) {
        const download = downloadRequests.get(token);
        download.progress = response;
        downloadRequests.set(token, download);
      }
    });

    child.on('close', (code) => {
      // Update status to converting
      if (downloadRequests.has(token)) {
        const download = downloadRequests.get(token);
        download.progress = 'Converting to ZIP...';
        downloadRequests.set(token, download);
      }
      // Start archiving process
      createArchive(downloadDir, token, resolve, reject);
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
function createArchive(downloadDir, token, resolve, reject) {
  try {
    const filename = `${token}.zip`;
    const zipPath = path.join('/tmp', filename);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', {
      zlib: { level: 9 }
    });

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
      // Optionally clean up the download directory
      try {
        fs.rmSync(downloadDir, { recursive: true, force: true });
      } catch (e) { /* ignore */ }
      resolve();
    });

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

    archive.pipe(output);
    // Add the entire download directory to the archive
    if (fs.existsSync(downloadDir)) {
      archive.directory(downloadDir, false);
    } else {
      archive.append('Website download completed but no files found.', { name: 'README.txt' });
    }
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
  const path = event.path.replace(/^\/api/, '');
  console.log('Processed path:', path);
  try {
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
          message: 'Website Downloader API is ready',
          timestamp: new Date().toISOString()
        })
      };
    }
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
    else {
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
