(function() {
  'use strict';

  // Website Downloader Embed Script (API-only, no simulation)
  window.WebsiteDownloader = {
    // Configuration
    config: {
      apiUrl: 'https://jsmc-download-site.netlify.app',
      downloadEndpoint: '/api/download',
      statusEndpoint: '/api/status',
      ready: false
    },

    // Check if API is ready
    checkApiReady: function() {
      return new Promise((resolve, reject) => {
        fetch(this.config.apiUrl + '/api/health', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          }
        })
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          return response.json();
        })
        .then(data => {
          if (data.success && data.status === 'ready') {
            this.config.ready = true;
            console.log('[WebsiteDownloader] API is ready');
            resolve(true);
          } else {
            throw new Error('API not ready');
          }
        })
        .catch(error => {
          console.error('[WebsiteDownloader] API not ready:', error);
          this.config.ready = false;
          reject(new Error('WebsiteDownloader API not found or not ready.'));
        });
      });
    },

    // Generate unique token for this download
    generateToken: function() {
      return 'download_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    },

    // Download a website (real API)
    download: function(url, options = {}) {
      return new Promise((resolve, reject) => {
        this.checkApiReady()
          .then(() => {
            const token = this.generateToken();
            const downloadData = {
              website: url,
              token: token,
              options: options
            };
            fetch(this.config.apiUrl + this.config.downloadEndpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(downloadData)
            })
            .then(response => {
              if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
              }
              return response.json();
            })
            .then(data => {
              if (data.success) {
                resolve({
                  status: 'started',
                  token: token
                });
              } else {
                reject(new Error(data.error || 'Download failed to start'));
              }
            })
            .catch(error => {
              reject(error);
            });
          })
          .catch(reject);
      });
    },

    // Poll for download status
    pollStatus: function(token, resolve, reject) {
      const checkStatus = () => {
        fetch(this.config.apiUrl + this.config.statusEndpoint + '/' + token)
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          return response.json();
        })
        .then(data => {
          if (data.status === 'completed') {
            resolve({
              status: 'completed',
              token: token,
              filename: data.filename,
              downloadUrl: this.config.apiUrl + data.downloadUrl
            });
          } else if (data.status === 'error') {
            reject(new Error(data.error || 'Download failed'));
          } else {
            // Still processing, poll again in 2 seconds
            setTimeout(checkStatus, 2000);
          }
        })
        .catch(error => {
          reject(error);
        });
      };
      checkStatus();
    },

    // Get current download status (one-shot)
    getStatus: function(token) {
      return fetch(this.config.apiUrl + this.config.statusEndpoint + '/' + token)
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          return response.json();
        });
    },

    // Download the completed file (triggers browser download)
    downloadFile: function(filename) {
      const url = this.config.apiUrl + '/api/download-file/' + encodeURIComponent(filename);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return Promise.resolve({ success: true, filename });
    },

    // Get URL from iframe (if running in iframe context)
    getUrlFromIframe: function() {
      try {
        if (window.parent && window.parent !== window) {
          return window.parent.location.href;
        }
        if (document.referrer) {
          return document.referrer;
        }
        return null;
      } catch (e) {
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
    },

    // Initialize the downloader
    init: function() {
      return this.checkApiReady()
        .then(() => true)
        .catch(() => false);
    }
  };

  // Auto-initialize when script loads
  window.WebsiteDownloader.init();

  // Expose to global scope
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.WebsiteDownloader;
  }
})(); 
