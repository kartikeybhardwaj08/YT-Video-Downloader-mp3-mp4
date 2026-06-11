const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const app = express();
const PORT = process.env.PORT || 3001;

// Find yt-dlp - works on both Windows and Linux
let ytDlpPath = 'yt-dlp';
if (os.platform() === 'win32') {
  const localPath = path.join(__dirname, 'yt-dlp.exe');
  if (fs.existsSync(localPath)) {
    ytDlpPath = localPath;
  }
}

app.use(cors());
app.use(express.static(path.join(__dirname)));

// Test route
app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is working!', platform: os.platform() });
});

app.get('/api/video-info', async (req, res) => {
  try {
    const { url } = req.query;
    console.log('Received request for URL:', url);
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    // Use yt-dlp to get video info
    console.log('Running yt-dlp info...');
    const { stdout } = await execFileAsync(ytDlpPath, ['-J', url]);
    const info = JSON.parse(stdout);
    console.log('Got video info successfully');
    
    const formats = {
      mp4: [],
      mp3: []
    };
    
    // Filter video formats (MP4) - prioritize smaller files with both audio and video
    const seenQualities = new Map();
    info.formats.forEach(format => {
      if (format.vcodec !== 'none' && format.acodec !== 'none' && format.height) {
        const quality = `${format.height}p`;
        const fileSize = format.filesize || format.filesize_approx || 0;
        
        if (!seenQualities.has(quality) || fileSize < seenQualities.get(quality).fileSize) {
          seenQualities.set(quality, {
            quality: quality,
            formatId: format.format_id,
            fileSize: fileSize
          });
        }
      }
    });
    
    formats.mp4 = Array.from(seenQualities.values());
    
    // Filter audio formats - very simple!
    const seenAudioQualities = new Map();
    info.formats.forEach(format => {
      if (format.acodec !== 'none') {
        let quality = '128kbps';
        if (format.abr) {
          if (format.abr >= 320) quality = '320kbps';
          else if (format.abr >= 256) quality = '256kbps';
          else if (format.abr >= 192) quality = '192kbps';
        }
        
        const fileSize = format.filesize || format.filesize_approx || 0;
        const ext = format.ext || 'mp4';
        
        if (!seenAudioQualities.has(quality)) {
          seenAudioQualities.set(quality, {
            quality: quality,
            formatId: format.format_id,
            ext: ext,
            fileSize: fileSize
          });
        }
      }
    });
    
    formats.mp3 = Array.from(seenAudioQualities.values());
    
    // If still no audio formats, add video as fallback
    if (formats.mp3.length === 0 && formats.mp4.length > 0) {
      formats.mp3.push({
        quality: '128kbps',
        formatId: formats.mp4[0].format_id,
        ext: 'mp4',
        fileSize: formats.mp4[0].fileSize
      });
    }
    
    // Sort qualities
    const qualityOrder = ['2160p', '1440p', '1080p', '720p', '480p', '360p', '240p', '144p'];
    formats.mp4.sort((a, b) => qualityOrder.indexOf(a.quality) - qualityOrder.indexOf(b.quality));
    formats.mp3.sort((a, b) => parseInt(b.quality) - parseInt(a.quality));
    
    console.log('Video formats found:', formats.mp4.length);
    console.log('Audio formats found:', formats.mp3.length);
    
    res.json({
      title: info.title,
      channel: info.uploader,
      views: info.view_count,
      duration: formatDuration(info.duration),
      thumbnail: info.thumbnail,
      formats: formats
    });
    
  } catch (error) {
    console.error('Full error:', error);
    console.error('Error message:', error.message);
    res.status(500).json({ 
      error: 'Failed to get video info',
      details: error.message 
    });
  }
});

app.get('/api/download', async (req, res) => {
  try {
    const { url, format, quality } = req.query;
    console.log('Download request:', { url, format, quality });
    
    if (!url || !format || !quality) {
      return res.status(400).json({ error: 'Missing parameters' });
    }
    
    // First get video info to find the right format id
    console.log('Getting video info for download...');
    const { stdout: infoStdout } = await execFileAsync(ytDlpPath, ['-J', url]);
    const info = JSON.parse(infoStdout);
    console.log('Got video info, finding format...');
    
    let formatId;
    let outputExt;
    
    if (format === 'mp4') {
      const targetQuality = parseInt(quality);
      console.log('Looking for MP4 quality:', targetQuality);
      
      // Find ANY video+audio format with this height
      const matchingFormat = info.formats.find(f => 
        f.height === targetQuality &&
        f.vcodec !== 'none' && 
        f.acodec !== 'none'
      );
      
      if (matchingFormat) {
        formatId = matchingFormat.format_id;
        outputExt = matchingFormat.ext || 'mp4';
        console.log('Found MP4 format:', formatId, 'ext:', outputExt);
      } else {
        // Fallback to first available video+audio
        const fallback = info.formats.find(f => 
          f.vcodec !== 'none' && f.acodec !== 'none'
        );
        if (fallback) {
          formatId = fallback.format_id;
          outputExt = fallback.ext || 'mp4';
          console.log('Using fallback format:', formatId);
        }
      }
    } else if (format === 'mp3') {
      console.log('Looking for audio format...');
      
      // First try audio-only
      let matchingFormat = info.formats.find(f => 
        f.acodec !== 'none' && f.vcodec === 'none'
      );
      
      // If not, use any format with audio
      if (!matchingFormat) {
        matchingFormat = info.formats.find(f => 
          f.acodec !== 'none'
        );
      }
      
      if (matchingFormat) {
        formatId = matchingFormat.format_id;
        outputExt = matchingFormat.ext || 'm4a';
        console.log('Found audio format:', formatId, 'ext:', outputExt);
      }
    }
    
    if (!formatId) {
      console.error('No format found!');
      return res.status(400).json({ error: 'Quality not available' });
    }
    
    // Create temp directory with simpler filename
    const tempDir = os.tmpdir();
    const safeTitle = info.title.replace(/[^\w\s]/gi, '').substring(0, 50);
    const outputPath = path.join(tempDir, `${safeTitle}.${outputExt}`);
    console.log('Output path:', outputPath);
    
    // Download with yt-dlp - SIMPLE!
    console.log('Starting download...');
    await execFileAsync(ytDlpPath, [
      '-f', formatId,
      '-o', outputPath,
      url
    ]);
    console.log('Download completed!');
    
    // Check if file exists
    if (!fs.existsSync(outputPath)) {
      console.error('File not found after download:', outputPath);
      return res.status(500).json({ error: 'Downloaded file not found' });
    }
    
    // Send the file
    console.log('Sending file to browser...');
    res.download(outputPath, `${safeTitle}.${outputExt}`, (err) => {
      // Clean up temp file
      try {
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
          console.log('Temp file cleaned up');
        }
      } catch (cleanupErr) {
        console.error('Cleanup error:', cleanupErr);
      }
      
      if (err) {
        console.error('Download send error:', err);
      }
    });
    
  } catch (error) {
    console.error('Full download error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to download video',
      details: error.message 
    });
  }
});

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
