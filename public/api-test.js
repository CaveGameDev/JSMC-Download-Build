// Website Downloader API Test Script
// This script demonstrates how to use the API directly

class WebsiteDownloaderAPI {
  constructor(baseUrl = 'https://jsmc-download-site.netlify.app') {
    this.baseUrl = baseUrl;
    this.apiUrl = `${baseUrl}/api`;
  }

  // Generate a unique token
  generateToken() {
    return 'download_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  // Check if API is healthy
  async checkHealth() {
    try {
      const response = await fetch(`${this.apiUrl}/health`);
      const data = await response.json();
      console.log('Health check:', data);
      return data;
    } catch (error) {
      console.error('Health check failed:', error);
      throw error;
    }
  }

  // Start a download
  async startDownload(url, options = {}) {
    try {
      const token = this.generateToken();
      const downloadData = {
        website: url,
        token: token,
        options: options
      };

      console.log('Starting download for:', url);
      console.log('Token:', token);

      const response = await fetch(`${this.apiUrl}/download`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(downloadData)
      });

      const data = await response.json();
      console.log('Download response:', data);

      if (data.success) {
        return { token, ...data };
      } else {
        throw new Error(data.error || 'Download failed to start');
      }
    } catch (error) {
      console.error('Start download failed:', error);
      throw error;
    }
  }

  // Check download status
  async checkStatus(token) {
    try {
      const response = await fetch(`${this.apiUrl}/status/${token}`);
      const data = await response.json();
      console.log('Status check:', data);
      return data;
    } catch (error) {
      console.error('Status check failed:', error);
      throw error;
    }
  }

  // Poll for download completion
  async waitForCompletion(token, maxAttempts = 30) {
    let attempts = 0;
    
    return new Promise((resolve, reject) => {
      const checkStatus = async () => {
        try {
          attempts++;
          const status = await this.checkStatus(token);
          
          if (status.status === 'completed') {
            resolve(status);
          } else if (status.status === 'error') {
            reject(new Error(status.error || 'Download failed'));
          } else if (attempts >= maxAttempts) {
            reject(new Error('Download timeout - max attempts reached'));
          } else {
            // Still processing, check again in 2 seconds
            setTimeout(checkStatus, 2000);
          }
        } catch (error) {
          reject(error);
        }
      };
      
      checkStatus();
    });
  }

  // Complete download process
  async download(url, options = {}) {
    try {
      // Start the download
      const { token } = await this.startDownload(url, options);
      
      // Wait for completion
      const result = await this.waitForCompletion(token);
      
      // Add full download URL
      result.downloadUrl = `${this.baseUrl}${result.downloadUrl}`;
      
      return result;
    } catch (error) {
      console.error('Download process failed:', error);
      throw error;
    }
  }

  // Download file
  async downloadFile(filename) {
    try {
      const response = await fetch(`${this.apiUrl}/download-file/${filename}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      // Create a blob and download link
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      console.log('File downloaded:', filename);
    } catch (error) {
      console.error('File download failed:', error);
      throw error;
    }
  }
}

// Example usage functions
function testHealthCheck() {
  const api = new WebsiteDownloaderAPI();
  api.checkHealth()
    .then(result => {
      console.log('✅ Health check passed:', result);
    })
    .catch(error => {
      console.error('❌ Health check failed:', error);
    });
}

function testDownload(url = 'https://example.com') {
  const api = new WebsiteDownloaderAPI();
  
  console.log('🚀 Starting download test for:', url);
  
  api.download(url)
    .then(result => {
      console.log('✅ Download completed:', result);
      
      // Automatically download the file
      if (result.filename) {
        api.downloadFile(result.filename)
          .then(() => {
            console.log('✅ File downloaded successfully');
          })
          .catch(error => {
            console.error('❌ File download failed:', error);
          });
      }
    })
    .catch(error => {
      console.error('❌ Download failed:', error);
    });
}

function testStepByStep(url = 'https://example.com') {
  const api = new WebsiteDownloaderAPI();
  
  console.log('🔍 Testing step by step for:', url);
  
  // Step 1: Start download
  api.startDownload(url)
    .then(({ token }) => {
      console.log('✅ Download started, token:', token);
      
      // Step 2: Check status a few times
      let attempts = 0;
      const maxAttempts = 5;
      
      const checkStatus = () => {
        attempts++;
        api.checkStatus(token)
          .then(status => {
            console.log(`📊 Status check ${attempts}:`, status);
            
            if (status.status === 'completed') {
              console.log('✅ Download completed!');
              if (status.filename) {
                api.downloadFile(status.filename);
              }
            } else if (status.status === 'error') {
              console.error('❌ Download failed:', status.error);
            } else if (attempts < maxAttempts) {
              setTimeout(checkStatus, 2000);
            } else {
              console.log('⏰ Max status checks reached');
            }
          })
          .catch(error => {
            console.error('❌ Status check failed:', error);
          });
      };
      
      checkStatus();
    })
    .catch(error => {
      console.error('❌ Start download failed:', error);
    });
}

// Make functions available globally
window.WebsiteDownloaderAPI = WebsiteDownloaderAPI;
window.testHealthCheck = testHealthCheck;
window.testDownload = testDownload;
window.testStepByStep = testStepByStep;

console.log('🌐 Website Downloader API Test Script loaded!');
console.log('Available functions:');
console.log('- testHealthCheck() - Check if API is working');
console.log('- testDownload(url) - Complete download process');
console.log('- testStepByStep(url) - Step-by-step download test');
console.log('- new WebsiteDownloaderAPI() - Create API instance'); 