require('./logger').patch();
const express = require('express');
const fs = require('fs');
const path = require('path');
const { syncPhotos } = require('./parse_photos');

const app = express();
const PORT = process.env.PORT || 3000;

// SYNC CONFIGURATION
// Default to 1 hour (3600000 ms)
const SYNC_INTERVAL = process.env.SYNC_INTERVAL || 3600000;

// Middleware
app.use(express.static('public'));
// Serve photos directory if images are downloaded locally
app.use('/photos', express.static('photos'));

/**
 * Scheduled Sync function
 */
async function startScheduledSync() {
    console.log(`⏰ Scheduled sync initialized. Interval: ${SYNC_INTERVAL / 1000}s`);

    // Initial sync
    console.log('🚀 Triggering initial photo sync...');
    await syncPhotos();

    // Set interval for subsequent syncs
    setInterval(async () => {
        console.log('⏰ Triggering scheduled photo sync...');
        await syncPhotos();
    }, SYNC_INTERVAL);
}

// API Endpoint to get photos
app.get('/api/photos', (req, res) => {
    const photosPath = path.join(__dirname, 'photos.json');

    if (fs.existsSync(photosPath)) {
        try {
            const photosData = fs.readFileSync(photosPath, 'utf-8');
            const photos = JSON.parse(photosData);

            // Check if photos directory exists and has files
            const photosDir = path.join(__dirname, 'photos');
            const hasLocalPhotos = fs.existsSync(photosDir) && fs.readdirSync(photosDir).length > 0;

            const processedPhotos = photos.map(photo => {
                if (hasLocalPhotos) {
                    const localPath = path.join(photosDir, `${photo.id}.jpg`);
                    if (fs.existsSync(localPath)) {
                        // If local file exists, prefer it
                        return { ...photo, src: `/photos/${photo.id}.jpg`, type: 'local' };
                    }
                }
                // Fallback to remote URL
                return { ...photo, src: photo.url, type: 'remote' };
            });

            res.json(processedPhotos);
        } catch (err) {
            console.error('Error reading photos.json:', err);
            res.status(500).json({ error: 'Failed to parse photo data' });
        }
    } else {
        res.json([]); // Return empty array if no data found
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Press Ctrl+C to stop');

    // Start the scheduled sync process
    startScheduledSync().catch(err => {
        console.error('Failed to start scheduled sync:', err);
    });
});
