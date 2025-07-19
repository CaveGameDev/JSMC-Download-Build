// Static API Fallback for Website Downloader
// This provides a working API when serverless functions aren't available

class StaticAPI {
  constructor() {
    this.downloads = new Map();
    this.baseUrl = window.location.origin;
  }

  // Generate token
  generateToken() {
    return 'static_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  // Simulate health check
  async checkHealth() {
    return {
      success: true,
      status: 'ready',
      message: 'Static API is ready',
      timestamp: new Date().toISOString()
    };
  }

  // Simulate download start
  async startDownload(url, options = {}) {
    const token = this.generateToken();
    
    // Store download info
    this.downloads.set(token, {
      status: 'processing',
      progress: 'Starting download...',
      website: url,
      startTime: Date.now(),
      filename: null
    });

    // Simulate download process
    setTimeout(() => {
      const download = this.downloads.get(token);
      if (download) {
        download.progress = 'Downloading files...';
        this.downloads.set(token, download);
      }
    }, 2000);

    setTimeout(() => {
      const download = this.downloads.get(token);
      if (download) {
        download.progress = 'Converting to ZIP...';
        this.downloads.set(token, download);
      }
    }, 4000);

    setTimeout(() => {
      const download = this.downloads.get(token);
      if (download) {
        download.status = 'completed';
        download.progress = 'Completed';
        download.filename = 'demo-download.zip';
        download.downloadUrl = `/api/download-file/${download.filename}`;
        this.downloads.set(token, download);
      }
    }, 6000);

    return {
      success: true,
      token: token
    };
  }

  // Check download status
  async checkStatus(token) {
    const download = this.downloads.get(token);
    
    if (!download) {
      return {
        success: false,
        error: 'Download not found'
      };
    }

    if (download.status === 'completed') {
      return {
        success: true,
        status: 'completed',
        downloadUrl: download.downloadUrl,
        filename: download.filename
      };
    } else if (download.status === 'error') {
      return {
        success: false,
        status: 'error',
        error: download.error
      };
    } else {
      return {
        success: true,
        status: 'processing',
        progress: download.progress
      };
    }
  }

  // Simulate file download
  async downloadFile(filename) {
    // Create a dummy ZIP file content
    const dummyContent = `
      This is a demo download file.
      In a real implementation, this would be the actual website files.
      
      Filename: ${filename}
      Generated: ${new Date().toISOString()}
    `;

    // Create blob and download
    const blob = new Blob([dummyContent], { type: 'application/zip' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    return { success: true };
  }

  // Complete download process
  async download(url, options = {}) {
    const { token } = await this.startDownload(url, options);
    
    // Wait for completion
    return new Promise((resolve, reject) => {
      const checkStatus = async () => {
        const status = await this.checkStatus(token);
        
        if (status.status === 'completed') {
          status.downloadUrl = `${this.baseUrl}${status.downloadUrl}`;
          resolve(status);
        } else if (status.status === 'error') {
          reject(new Error(status.error || 'Download failed'));
        } else {
          setTimeout(checkStatus, 2000);
        }
      };
      
      checkStatus();
    });
  }
}

// API endpoint handlers
window.handleAPIRequest = async function(path, method, body) {
  const api = new StaticAPI();
  
  try {
    if (path === '/health' && method === 'GET') {
      return await api.checkHealth();
    }
    
    if (path === '/download' && method === 'POST') {
      const { website, token, options } = body;
      return await api.startDownload(website, options);
    }
    
    if (path.startsWith('/status/') && method === 'GET') {
      const token = path.split('/status/')[1];
      return await api.checkStatus(token);
    }
    
    if (path.startsWith('/download-file/') && method === 'GET') {
      const filename = path.split('/download-file/')[1];
      return await api.downloadFile(filename);
    }
    
    return {
      success: false,
      error: 'Endpoint not found',
      path: path,
      method: method
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

console.log('Static API Fallback loaded'); 