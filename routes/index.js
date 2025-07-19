var express = require('express');
var router = express.Router();
var wget = require('../wget');
var archiver = require('../archiver');
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Website downloader - Take any website offline.' });
});

/* GET embeddable script */
router.get('/embed.js', function(req, res, next) {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Serve the static embed.js file
  res.sendFile(path.join(__dirname, '../public/embed.js'));
});

/* POST API endpoint for starting downloads */
router.post('/api/download', function(req, res, next) {
  const { website, token, options } = req.body;
  
  if (!website) {
    return res.status(400).json({ success: false, error: 'Website URL is required' });
  }
  
  if (!token) {
    return res.status(400).json({ success: false, error: 'Token is required' });
  }
  
  try {
    // Store download request in memory (in production, use Redis or database)
    if (!global.downloadRequests) {
      global.downloadRequests = new Map();
    }
    
    global.downloadRequests.set(token, {
      status: 'processing',
      progress: 'Starting download...',
      website: website,
      startTime: Date.now()
    });
    
    // Start the download process
    wget(global.io, { website, token, options });
    
    res.json({ success: true, token: token });
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/* GET API endpoint for checking download status */
router.get('/api/status/:token', function(req, res, next) {
  const token = req.params.token;
  
  if (!global.downloadRequests || !global.downloadRequests.has(token)) {
    return res.status(404).json({ success: false, error: 'Download not found' });
  }
  
  const download = global.downloadRequests.get(token);
  
  if (download.status === 'completed') {
    res.json({
      success: true,
      status: 'completed',
      downloadUrl: `/sites/${download.filename}`,
      filename: download.filename
    });
  } else if (download.status === 'error') {
    res.json({
      success: false,
      status: 'error',
      error: download.error
    });
  } else {
    res.json({
      success: true,
      status: 'processing',
      progress: download.progress
    });
  }
});

/* GET API endpoint for downloading completed files */
router.get('/sites/:filename', function(req, res, next) {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, '../public/sites', filename);
  
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ success: false, error: 'File not found' });
  }
});

module.exports = router;
