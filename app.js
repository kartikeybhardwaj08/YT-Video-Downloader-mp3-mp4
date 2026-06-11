const searchBtn = document.getElementById('search-btn');
const videoUrlInput = document.getElementById('video-url');
const videoInfoSection = document.getElementById('video-info');
const downloadOptionsSection = document.getElementById('download-options');
const tabBtns = document.querySelectorAll('.tab-btn');
const mp4Qualities = document.getElementById('mp4-qualities');
const mp3Qualities = document.getElementById('mp3-qualities');
const thumbnailImg = document.getElementById('thumbnail');
const videoTitleEl = document.getElementById('video-title');
const videoChannelEl = document.getElementById('video-channel');
const videoViewsEl = document.getElementById('video-views');
const videoDurationEl = document.getElementById('video-duration');

let currentVideoUrl = '';
let videoData = null;

searchBtn.addEventListener('click', handleSearch);
videoUrlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSearch();
});

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const format = btn.dataset.format;
        if (format === 'mp4') {
            mp4Qualities.classList.remove('hidden');
            mp3Qualities.classList.add('hidden');
        } else {
            mp3Qualities.classList.remove('hidden');
            mp4Qualities.classList.add('hidden');
        }
    });
});

async function handleSearch() {
    const url = videoUrlInput.value.trim();
    
    if (!url) {
        alert('Please enter a YouTube URL');
        return;
    }

    try {
        searchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
        searchBtn.disabled = true;
        
        const response = await fetch(`/api/video-info?url=${encodeURIComponent(url)}`);
        const data = await response.json();
        
        if (data.error) {
            alert(data.error);
            return;
        }
        
        currentVideoUrl = url;
        videoData = data;
        
        displayVideoInfo(data);
        renderQualityOptions(data.formats);
        
    } catch (error) {
        console.error('Error:', error);
        alert('Failed to get video info. Make sure the backend server is running.');
    } finally {
        searchBtn.innerHTML = '<i class="fas fa-search"></i> Search';
        searchBtn.disabled = false;
    }
}

function displayVideoInfo(data) {
    thumbnailImg.src = data.thumbnail;
    videoTitleEl.textContent = data.title;
    videoChannelEl.textContent = data.channel;
    videoViewsEl.innerHTML = `<i class="fas fa-eye"></i> ${formatNumber(data.views)} views`;
    videoDurationEl.innerHTML = `<i class="fas fa-clock"></i> ${data.duration}`;
    
    videoInfoSection.classList.remove('hidden');
    downloadOptionsSection.classList.remove('hidden');
    
    videoInfoSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderQualityOptions(formats) {
    renderMp4Qualities(formats.mp4);
    renderMp3Qualities(formats.mp3);
}

function renderMp4Qualities(qualities) {
    mp4Qualities.innerHTML = '';
    
    const qualityOrder = ['1080p', '720p', '480p', '360p'];
    const availableQualities = qualityOrder.filter(q => qualities.some(f => f.quality === q));
    
    if (availableQualities.length === 0) {
        availableQualities.push(...qualities.map(f => f.quality));
    }
    
    availableQualities.forEach(quality => {
        const format = qualities.find(f => f.quality === quality);
        const size = format && format.fileSize ? formatBytes(format.fileSize) : '~' + (parseInt(quality) * 0.5) + 'MB';
        
        const div = document.createElement('div');
        div.className = 'quality-item';
        div.innerHTML = `
            <span class="quality-label">${quality}</span>
            <span class="quality-size">${size}</span>
            <button class="download-btn" data-quality="${quality}" data-format="mp4">
                <i class="fas fa-download"></i> Download
            </button>
        `;
        mp4Qualities.appendChild(div);
    });
    
    attachDownloadListeners();
}

function renderMp3Qualities(qualities) {
    mp3Qualities.innerHTML = '';
    
    const qualityOrder = ['320kbps', '256kbps', '192kbps', '128kbps'];
    const availableQualities = qualityOrder.filter(q => qualities.some(f => f.quality === q));
    
    if (availableQualities.length === 0) {
        availableQualities.push(...qualities.map(f => f.quality));
    }
    
    availableQualities.forEach(quality => {
        const format = qualities.find(f => f.quality === quality);
        const size = format && format.fileSize ? formatBytes(format.fileSize) : '~' + (parseInt(quality) * 0.03) + 'MB';
        
        const div = document.createElement('div');
        div.className = 'quality-item';
        div.innerHTML = `
            <span class="quality-label">${quality}</span>
            <span class="quality-size">${size}</span>
            <button class="download-btn" data-quality="${quality}" data-format="mp3">
                <i class="fas fa-download"></i> Download
            </button>
        `;
        mp3Qualities.appendChild(div);
    });
    
    attachDownloadListeners();
}

function attachDownloadListeners() {
    document.querySelectorAll('.download-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const quality = btn.dataset.quality;
            const format = btn.dataset.format;
            await handleDownload(quality, format);
        });
    });
}

async function handleDownload(quality, format) {
    try {
        window.location.href = `/api/download?url=${encodeURIComponent(currentVideoUrl)}&format=${format}&quality=${quality}`;
    } catch (error) {
        console.error('Error:', error);
        alert('Failed to download. Make sure the backend server is running.');
    }
}

function formatNumber(num) {
    return new Intl.NumberFormat().format(num);
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
