(function() {
  'use strict';
  
  // Website Downloader Embed Script
  window.WebsiteDownloader = {
    // Configuration
    config: {
      apiUrl: 'https://jsmc-download-site.netlify.app',
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
              downloadUrl: this.config.apiUrl + data.downloadUrl,
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