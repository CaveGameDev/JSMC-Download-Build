const { spawn } = require('child_process');
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');

// In-memory storage for download requests (in production, use a database)
let downloadRequests = new Map();

// Helper: Recursively list all files in a directory
function listFilesRecursive(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  fs.readdirSync(dir).forEach(file => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      results = results.concat(listFilesRecursive(fullPath));
    } else {
      results.push(fullPath);
    }
  });
  return results;
}

function downloadAndZip(url, token, callback) {
  const downloadDir = `/tmp/${token}`;
  const zipPath = `/tmp/${token}.zip`;

  // Ensure the directory exists
  fs.mkdirSync(downloadDir, { recursive: true });

  // Add --wait=1 to slow down requests
  const wget = spawn('wget', [
    '-mkEpnp',
    '--wait=1', // Wait 1 second between requests
    '-P', downloadDir,
    url
  ]);

  let wgetOutput = '';
  let wgetError = '';

  wget.stdout.on('data', (data) => { wgetOutput += data.toString(); });
  wget.stderr.on('data', (data) => { wgetError += data.toString(); });

  wget.on('close', (code) => {
    if (code !== 0) {
      callback(new Error(`wget failed: ${wgetError}`));
      return;
    }

    // Now create the ZIP
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => callback(null, zipPath));
    archive.on('error', (err) => callback(err));

    archive.pipe(output);
    archive.directory(downloadDir, false);
    archive.finalize();
  });
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
      if (!filename.endsWith('.zip')) {
        return {
          statusCode: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ success: false, error: 'Only ZIP files can be downloaded' })
        };
      }
      const filePath = `/tmp/${filename}`;
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
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
          body: JSON.stringify({ success: false, error: 'File not found or is a directory' })
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
