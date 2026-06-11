# YouTube Video Downloader

A modern YouTube video downloader with clean UI and backend.

## How to Setup

### 1. Install Node.js
First, you need to have Node.js installed on your computer. Download and install it from: https://nodejs.org/

### 2. Install Dependencies
Open your terminal (Command Prompt or PowerShell) in this folder and run:
```bash
npm install
```

### 3. Start the Server
Run this command to start the backend server:
```bash
npm start
```

### 4. Open the App
Open your browser and go to: http://localhost:3000

## How the Backend Works

I created the backend using **Node.js** and **Express.js** framework. Here's what I did step by step:

1. **Set up Express server** (`server.js`):
   - Created an Express application
   - Added CORS middleware to allow requests from frontend
   - Served static files (HTML, CSS, JS) from the current directory

2. **API Endpoints**:
   - `/api/video-info`: Fetches video information (title, channel, thumbnail, duration, available formats)
   - `/api/download`: Downloads the video or audio in the selected quality

3. **Used ytdl-core library**:
   - This library is specifically for downloading YouTube videos
   - It fetches video metadata and streams the content
   - Filters formats for video (mp4) and audio (mp3)

## Technologies Used
- Frontend: HTML, CSS, JavaScript
- Backend: Node.js, Express.js
- Library: ytdl-core (for YouTube downloads)
