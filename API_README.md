# Website Downloader API

This website downloader has been modified to support API-based downloads and can be embedded on other websites via a JavaScript script.

## Features

- **REST API**: Start downloads via HTTP requests
- **Embeddable Script**: Include download functionality on any website
- **Iframe Support**: Auto-detect URLs from iframe context
- **Real-time Status**: Poll for download progress and completion
- **Cross-origin Support**: CORS enabled for cross-domain usage

## API Endpoints

### 1. Start Download
**POST** `/api/download`

Start a new website download.

**Request Body:**
```json
{
  "website": "https://example.com",
  "token": "unique_token_here",
  "options": {
    "customOption": "value"
  }
}
```

**Response:**
```json
{
  "success": true,
  "token": "unique_token_here"
}
```

### 2. Check Status
**GET** `/api/status/:token`

Check the status of a download.

**Response (Processing):**
```json
{
  "success": true,
  "status": "processing",
  "progress": "Downloading files..."
}
```

**Response (Completed):**
```json
{
  "success": true,
  "status": "completed",
  "downloadUrl": "/sites/example.com.zip",
  "filename": "example.com.zip"
}
```

**Response (Error):**
```json
{
  "success": false,
  "status": "error",
  "error": "Download failed: Connection timeout"
}
```

### 3. Download File
**GET** `/sites/:filename`

Download the completed ZIP file.

## Embeddable Script

### Include the Script

Add this script tag to your HTML page:

```html
<script src="http://localhost:3000/embed.js"></script>
```

### Basic Usage

```javascript
// Download a specific website
WebsiteDownloader.download('https://example.com')
  .then(result => {
    console.log('Download completed:', result);
    // result.downloadUrl contains the download link
    window.open(result.downloadUrl, '_blank');
  })
  .catch(error => {
    console.error('Download failed:', error);
  });
```

### Auto-Download from Iframe

If your script is running in an iframe, you can auto-download the parent page:

```javascript
WebsiteDownloader.autoDownload()
  .then(result => {
    console.log('Auto-download completed:', result);
  })
  .catch(error => {
    console.error('Auto-download failed:', error);
  });
```

### Custom Options

```javascript
WebsiteDownloader.download('https://example.com', {
  // Add any custom options here
  customOption: 'value'
})
```

## Integration Examples

### 1. Simple Download Button

```html
<button onclick="downloadSite()">Download Website</button>

<script src="http://localhost:3000/embed.js"></script>
<script>
function downloadSite() {
  WebsiteDownloader.download('https://example.com')
    .then(result => {
      alert('Download completed!');
      window.open(result.downloadUrl, '_blank');
    })
    .catch(error => {
      alert('Download failed: ' + error.message);
    });
}
</script>
```

### 2. Form with URL Input

```html
<form onsubmit="downloadCustomSite(event)">
  <input type="url" id="urlInput" placeholder="Enter website URL" required>
  <button type="submit">Download</button>
</form>

<script src="http://localhost:3000/embed.js"></script>
<script>
function downloadCustomSite(event) {
  event.preventDefault();
  const url = document.getElementById('urlInput').value;
  
  WebsiteDownloader.download(url)
    .then(result => {
      alert('Download completed!');
      window.open(result.downloadUrl, '_blank');
    })
    .catch(error => {
      alert('Download failed: ' + error.message);
    });
}
</script>
```

### 3. Iframe Integration

```html
<!-- Embed the downloader in an iframe -->
<iframe src="http://localhost:3000/demo.html" 
        width="100%" 
        height="400px" 
        style="border: 1px solid #ccc;">
</iframe>
```

### 4. Progress Tracking

```javascript
WebsiteDownloader.download('https://example.com')
  .then(result => {
    console.log('Download completed:', result);
    document.getElementById('status').innerHTML = 
      `<a href="${result.downloadUrl}" target="_blank">Download ZIP file</a>`;
  })
  .catch(error => {
    console.error('Download failed:', error);
    document.getElementById('status').innerHTML = 
      `<span style="color: red;">Error: ${error.message}</span>`;
  });
```

## Demo Pages

- **Demo**: `http://localhost:3000/demo.html` - Shows how to use the embed script
- **Integration Example**: `http://localhost:3000/integration-example.html` - Shows how to integrate on another website

## Configuration

The embed script automatically configures itself based on the server URL. If you need to customize the configuration:

```javascript
// Override configuration (optional)
WebsiteDownloader.config.apiUrl = 'https://your-server.com';
WebsiteDownloader.config.downloadEndpoint = '/api/download';
WebsiteDownloader.config.statusEndpoint = '/api/status';
```

## Error Handling

The API and embed script handle various error scenarios:

- **Invalid URL**: Returns 400 error
- **Download failures**: Returns error status with message
- **Network issues**: Promise rejection with error details
- **Cross-origin restrictions**: Graceful fallback for iframe detection

## Security Considerations

- The API accepts requests from any origin (CORS enabled)
- No authentication is implemented (add your own if needed)
- Downloads are stored in `/public/sites/` directory
- Consider implementing rate limiting for production use

## Production Deployment

For production deployment:

1. **Change the server URL** in the embed script
2. **Add authentication** to the API endpoints
3. **Implement rate limiting** to prevent abuse
4. **Use a database** instead of in-memory storage for download tracking
5. **Add HTTPS** for secure communication
6. **Configure proper CORS** policies for your domain

## Troubleshooting

### Common Issues

1. **CORS errors**: Ensure the server is running and CORS is properly configured
2. **Download not starting**: Check that the URL is valid and accessible
3. **Status polling fails**: Verify the token is being generated correctly
4. **File not found**: Check that the `/public/sites/` directory exists and is writable

### Debug Mode

Enable debug logging by checking the browser console and server logs for detailed error information. 