(function() {
  'use strict';
  
  // Website Downloader Embed Script
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
        // First try the serverless function
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
            this.config.useStaticFallback = false;
            resolve(true);
          } else {
            throw new Error('API not ready');
          }
        })
        .catch(error => {
          console.warn('Serverless API not ready, trying static fallback:', error);
          
          // Try static fallback
          if (window.handleAPIRequest) {
            window.handleAPIRequest('/health', 'GET')
              .then(data => {
                if (data.success && data.status === 'ready') {
                  this.config.ready = true;
                  this.config.useStaticFallback = true;
                  console.log('Using static API fallback');
                  resolve(true);
                } else {
                  throw new Error('Static API not ready');
                }
              })
              .catch(staticError => {
                console.error('Both APIs failed:', staticError);
                this.config.ready = false;
                reject(new Error('WebsiteDownloader API not found or not ready.'));
              });
          } else {
            this.config.ready = false;
            reject(new Error('WebsiteDownloader API not found or not ready.'));
          }
        });
      });
    },
    
    // Generate unique token for this download
    generateToken: function() {
      return 'download_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    },
    
    // Download a website
    download: function(url, options = {}) {
      return new Promise((resolve, reject) => {
        // First check if API is ready
        this.checkApiReady()
          .then(() => {
            const token = this.generateToken();
            const downloadData = {
              website: url,
              token: token,
              options: options
            };
            
            console.log('[Download] Attempting to download:', url);
            
            if (this.config.useStaticFallback) {
              // Use static fallback
              window.handleAPIRequest('/download', 'POST', downloadData)
                .then(data => {
                  if (data.success) {
                    console.log('[Download] Download started successfully (static)');
                    this.pollStatusStatic(token, resolve, reject);
                  } else {
                    reject(new Error(data.error || 'Download failed to start'));
                  }
                })
                .catch(error => {
                  console.error('[Download] Static API Error:', error);
                  reject(error);
                });
            } else {
              // Use serverless function
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
                  console.log('[Download] Download started successfully');
                  // Poll for status
                  this.pollStatus(token, resolve, reject);
                } else {
                  reject(new Error(data.error || 'Download failed to start'));
                }
              })
              .catch(error => {
                console.error('[Download] Error:', error);
                reject(error);
              });
            }
          })
          .catch(reject);
      });
    },
    
    // Poll for download status (serverless)
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
            console.log('[Download] Download completed successfully');
            resolve({
              status: 'completed',
              downloadUrl: this.config.apiUrl + data.downloadUrl,
              filename: data.filename
            });
          } else if (data.status === 'error') {
            reject(new Error(data.error || 'Download failed'));
          } else {
            console.log('[Download] Status:', data.progress);
            // Still processing, poll again in 2 seconds
            setTimeout(checkStatus, 2000);
          }
        })
        .catch(error => {
          console.error('[Download] Status check error:', error);
          reject(error);
        });
      };
      
      checkStatus();
    },
    
    // Poll for download status (static fallback)
    pollStatusStatic: function(token, resolve, reject) {
      const checkStatus = () => {
        window.handleAPIRequest('/status/' + token, 'GET')
        .then(data => {
          if (data.status === 'completed') {
            console.log('[Download] Download completed successfully (static)');
            resolve({
              status: 'completed',
              downloadUrl: window.location.origin + data.downloadUrl,
              filename: data.filename
            });
          } else if (data.status === 'error') {
            reject(new Error(data.error || 'Download failed'));
          } else {
            console.log('[Download] Status (static):', data.progress);
            // Still processing, poll again in 2 seconds
            setTimeout(checkStatus, 2000);
          }
        })
        .catch(error => {
          console.error('[Download] Static status check error:', error);
          reject(error);
        });
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
    },
    
    // Initialize the downloader
    init: function() {
      console.log('[WebsiteDownloader] Initializing...');
      return this.checkApiReady()
        .then(() => {
          console.log('[WebsiteDownloader] Ready!');
          return true;
        })
        .catch(error => {
          console.warn('[WebsiteDownloader] Not ready:', error.message);
          return false;
        });
    }
  };
  
  // Auto-initialize when script loads
  window.WebsiteDownloader.init();
  
  // Expose to global scope
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.WebsiteDownloader;
  }
})(); 
