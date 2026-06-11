const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const youtubedl = require('youtube-dl-exec');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.static(path.join(__dirname)));

app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is working!' });
});

app.get('/api/video-info', async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    const info = await youtubedl(url, {
      dumpSingleJson: true,
      noWarnings: true,
      noPlaylist: true,
      formatSort: '+size'
    });
    
    const formats = {
      mp4: [],
      mp3: []
    };
    
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
    
    const seenAudioQualities = new Map();
    info.formats.forEach(format => {
      if (format.acodec !== 'none') {
        let quality = '128kbps';
        if (format.abr) {
          if (format.abr >= 320) quality = '320kbps';
          else if (format.abr >= 256) quality = '256kbps';
          else if (format.abr >= 192) quality = '192kbps';
        }
        
        const ext = format.ext || 'mp4';
        const fileSize = format.filesize || format.filesize_approx || 0;
        
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
    
    if (formats.mp3.length === 0 && formats.mp4.length > 0) {
      formats.mp3.push({
        quality: '128kbps',
        formatId: formats.mp4[0].format_id,
        ext: 'mp4',
        fileSize: formats.mp4[0].fileSize
      });
    }
    
    const qualityOrder = ['2160p', '1440p', '1080p', '720p', '480p', '360p', '240p', '144p'];
    formats.mp4.sort((a, b) => qualityOrder.indexOf(a.quality) - qualityOrder.indexOf(b.quality));
    formats.mp3.sort((a, b) => parseInt(b.quality) - parseInt(a.quality));
    
    res.json({
      title: info.title,
      channel: info.uploader,
      views: info.view_count,
      duration: formatDuration(info.duration),
      thumbnail: info.thumbnail,
      formats: formats
    });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to get video info', details: error.message });
  }
});

app.get('/api/download', async (req, res) => {
  try {
    const { url, format, quality } = req.query;
    
    if (!url || !format || !quality) {
      return res.status(400).json({ error: 'Missing parameters' });
    }
    
    const info = await youtubedl(url, {
      dumpSingleJson: true,
      noWarnings: true,
      noPlaylist: true
    });
    
    let formatId;
    let outputExt;
    
    if (format === 'mp4') {
      const targetQuality = parseInt(quality);
      let matchingFormat = info.formats.find(f => 
        f.height === targetQuality && f.vcodec !== 'none' && f.acodec !== 'none'
      );
      
      if (!matchingFormat) {
        matchingFormat = info.formats.find(f => f.vcodec !== 'none' && f.acodec !== 'none');
      }
      
      if (matchingFormat) {
        formatId = matchingFormat.format_id;
        outputExt = matchingFormat.ext || 'mp4';
      }
    } else if (format === 'mp3') {
      let matchingFormat = info.formats.find(f => 
        f.acodec !== 'none' && f.vcodec === 'none'
      );
      
      if (!matchingFormat) {
        matchingFormat = info.formats.find(f => f.acodec !== 'none');
      }
      
      if (matchingFormat) {
        formatId = matchingFormat.format_id;
        outputExt = matchingFormat.ext || 'm4a';
      }
    }
    
    if (!formatId) {
      return res.status(400).json({ error: 'Quality not available' });
    }
    
    const tempDir = os.tmpdir();
    const safeTitle = info.title.replace(/[^\w\s]/gi, '').substring(0, 50);
    const outputPath = path.join(tempDir, `${safeTitle}.${outputExt}`);
    
    await youtubedl(url, {
      format: formatId,
      output: outputPath,
      noWarnings: true
    });
    
    res.download(outputPath, `${safeTitle}.${outputExt}`, (err) => {
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
    });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to download', details: error.message });
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
