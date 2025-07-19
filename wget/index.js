var util = require('util'),
    exec = require('child_process').exec;
    var archiver = require('../archiver')


module.exports=(io,data)=>{

// download all website assets 
/**
 * wget --mirror --convert-links --adjust-extension --page-requisites 
 * --no-parent http://example.org
 * --mirror – Makes (among other things) the download recursive.
 * --convert-links – convert all the links (also to stuff like CSS stylesheets) to relative, so it will be suitable for offline viewing.
 * --adjust-extension – Adds suitable extensions to filenames (html or css) depending on their content-type.
 * --page-requisites – Download things like CSS style-sheets and images required to properly display the page offline.
 * --no-parent – When recurring do not ascend to the parent directory. It useful for restricting the download to only a portion of the site.
 */
let website ="";
const child = exec(`wget -mkEpnp ${data.website}`);

// Update status to processing
if (global.downloadRequests && global.downloadRequests.has(data.token)) {
  const download = global.downloadRequests.get(data.token);
  download.status = 'processing';
  download.progress = 'Starting download...';
  global.downloadRequests.set(data.token, download);
}

// read stdout from the current child.
child.stderr.on("data",(response)=>{

    if(response.startsWith("Resolving "))
    {
        website= response.substring(response.indexOf('Resolve ')+11,response.indexOf(' ('))
    }
    
    // Update progress in global tracking
    if (global.downloadRequests && global.downloadRequests.has(data.token)) {
      const download = global.downloadRequests.get(data.token);
      download.progress = response;
      global.downloadRequests.set(data.token, download);
    }
    
    // Emit to socket if available (for backward compatibility)
    if (io) {
      io.emit(data.token,{progress:response})
    }
})

child.stderr.on('close',(response)=>{

    // Update status to converting
    if (global.downloadRequests && global.downloadRequests.has(data.token)) {
      const download = global.downloadRequests.get(data.token);
      download.progress = "Converting to ZIP...";
      global.downloadRequests.set(data.token, download);
    }
    
    // Emit to socket if available (for backward compatibility)
    if (io) {
      io.emit(data.token,{progress:"Converting"})
    }
    
    // Start archiving process
    archiver(website, io, data)
})

// Handle errors
child.on('error', (error) => {
  console.error('Download error:', error);
  
  // Update status to error
  if (global.downloadRequests && global.downloadRequests.has(data.token)) {
    const download = global.downloadRequests.get(data.token);
    download.status = 'error';
    download.error = error.message;
    global.downloadRequests.set(data.token, download);
  }
  
  // Emit to socket if available (for backward compatibility)
  if (io) {
    io.emit(data.token, {progress: "Error: " + error.message})
  }
});
}