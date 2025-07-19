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
  
  const script = `
(function() {
  'use strict';
  
  // Website Downloader Embed Script
  window.WebsiteDownloader = {
    // Configuration
    config: {
      apiUrl: '${req.protocol}://${req.get('host')}',
      downloadEndpoint: '/api/download',
      statusEndpoint: '/api/status'
    },
    
    // Generate unique token for this download
    generateToken: function() {
      return 'download_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    },
    
    // Download a website
    download: function(url, options = {}) {
      return new Promise((resolve, reject) => {
        const token = this.generateToken();
        const downloadData = {
          website: url,
          token: token,
          options: options
        };
        
        // Make API request to start download
        fetch(this.config.apiUrl + this.config.downloadEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(downloadData)
        })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            // Poll for status
            this.pollStatus(token, resolve, reject);
          } else {
            reject(new Error(data.error || 'Download failed to start'));
          }
        })
        .catch(reject);
      });
    },
    
    // Poll for download status
    pollStatus: function(token, resolve, reject) {
      const checkStatus = () => {
        fetch(this.config.apiUrl + this.config.statusEndpoint + '/' + token)
        .then(response => response.json())
        .then(data => {
          if (data.status === 'completed') {
            resolve({
              status: 'completed',
              downloadUrl: data.downloadUrl,
              filename: data.filename
            });
          } else if (data.status === 'error') {
            reject(new Error(data.error || 'Download failed'));
          } else {
            // Still processing, poll again in 2 seconds
            setTimeout(checkStatus, 2000);
          }
        })
        .catch(reject);
      };
      
      checkStatus();
    },
    
    // Get URL from iframe (if running in iframe context)
    getUrlFromIframe: function() {
      try {
        // Try to get URL from parent window
        if (window.parent && window.parent !== window) {
          return window.parent.location.href;
        }
        // Try to get URL from referrer
        if (document.referrer) {
          return document.referrer;
        }
        return null;
      } catch (e) {
        // Cross-origin restrictions
        return null;
      }
    },
    
    // Auto-download if URL is available from iframe
    autoDownload: function(options = {}) {
      const url = this.getUrlFromIframe();
      if (url) {
        return this.download(url, options);
      } else {
        return Promise.reject(new Error('No URL available from iframe context'));
      }
    }
  };
  
  // Expose to global scope
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.WebsiteDownloader;
  }
})();
  `;
  
  res.send(script);
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
