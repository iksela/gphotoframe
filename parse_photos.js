#!/usr/bin/env node

/**
 * Google Photos URL Parser & Downloader
 * Extracts image URLs from scraped Google Photos HTML/URLs and downloads images
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const axios = require('axios');
const querystring = require('querystring');

// Configuration
const CONFIG_FILE = 'albums.conf';
const OUTPUT_DIR = 'photos';
const METADATA_FILE = 'photos.json';
const MAX_CONCURRENT_DOWNLOADS = 5;

// Parse command line arguments
const args = process.argv.slice(2);
const shouldDownload = true; // Always download as per user request
let inputSources = args.filter(arg => !arg.startsWith('-'));

/**
 * Fetch HTML content from a URL
 */
async function fetchAlbumHtml(url) {
    try {
        console.log(`   🌐 Fetching: ${url}`);
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            maxRedirects: 5
        });
        return response.data;
    } catch (error) {
        console.error(`   ⚠️  Failed to fetch ${url}: ${error.message}`);
        return null;
    }
}

/**
 * Extract album title from HTML
 */
function extractAlbumTitle(html) {
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    if (titleMatch) {
        return titleMatch[1].replace(' - Google Photos', '').trim();
    }
    return 'Unknown Album';
}

/**
 * Extract Auth Key from HTML
 */
function extractAuthKey(html) {
    // Look for ds:1 definition with snAcKc
    const match = html.match(/id:'snAcKc'.*?request:(\[.*?\])/);
    if (match) {
        try {
            const req = JSON.parse(match[1]);
            return req[3]; // The key is usually at index 3: [id, null, null, KEY]
        } catch (e) {
            console.error('Error parsing Auth Key JSON:', e);
        }
    }
    return null;
}

/**
 * Extract Album ID from HTML (from ds:1 key)
 */
function extractAlbumId(html) {
    const match = html.match(/id:'snAcKc'.*?request:(\[.*?\])/);
    if (match) {
        try {
            const req = JSON.parse(match[1]);
            return req[0];
        } catch (e) {
            // ignore
        }
    }
    return null;
}

/**
 * Fetch next page of photos
 */
async function fetchNextPage(albumId, token, key) {
    const rpcId = 'snAcKc';
    const url = 'https://photos.google.com/_/PhotosUi/data/batchexecute';

    const rpcPayload = [albumId, token, null, key];
    const reqData = JSON.stringify([[[rpcId, JSON.stringify(rpcPayload), null, "generic"]]]);

    // Random reqid for simulation
    const reqid = Math.floor(Math.random() * 100000) + 100000;

    const queryParams = {
        'rpcids': rpcId,
        'bl': 'boq_photosuiserver_20260107.05_p0',
        'hl': 'en-US',
        'authuser': '0',
        'soc-app': '1',
        'soc-platform': '1',
        'soc-device': '1',
        '_reqid': reqid.toString(),
        'rt': 'c'
    };

    const fullUrl = url + '?' + querystring.stringify(queryParams);
    const params = new URLSearchParams();
    params.append('f.req', reqData);

    try {
        console.log(`   🔄 Fetching next page... (Token: ${token.substring(0, 10)}...)`);
        const response = await axios.post(fullUrl, params.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
                // Important: Referer usually needed
                'Referer': `https://photos.google.com/share/${albumId}?key=${key}`
            }
        });

        // Parse stream response
        const lines = response.data.split('\n');
        let json;
        for (const line of lines) {
            if (line.trim().startsWith('[[')) {
                try {
                    json = JSON.parse(line.trim());
                    break;
                } catch (e) { }
            }
        }

        if (!json) return { photos: [], nextToken: null };

        const rpcData = JSON.parse(json[0][2]);
        const photoData = rpcData[1] || [];
        const nextToken = rpcData[2] || null;

        const newPhotos = [];
        const albumTitle = 'Unknown'; // Can't easily get title from RPC, reusing existing

        photoData.forEach(item => {
            if (Array.isArray(item) && item.length >= 2) {
                const photoId = item[0];
                const photoInfo = item[1];
                if (Array.isArray(photoInfo) && photoInfo.length >= 3) {
                    let pUrl = photoInfo[0];
                    const width = photoInfo[1];
                    const height = photoInfo[2];
                    const ts = item[2];

                    const baseUrl = pUrl.split('=')[0];
                    pUrl = `${baseUrl}=w1920-h1080`;

                    newPhotos.push({
                        id: photoId,
                        url: pUrl,
                        originalWidth: width,
                        originalHeight: height,
                        timestamp: ts,
                        date: ts ? new Date(ts).toISOString() : null
                    });
                }
            }
        });

        return { photos: newPhotos, nextToken };

    } catch (e) {
        console.error(`   ⚠️  Pagination failed: ${e.message}`);
        return { photos: [], nextToken: null };
    }
}

/**
 * Parse HTML content and extract photo data
 */
function parseAlbumContent(html, sourceName) {
    console.log(`\n📁 Processing: ${sourceName}`);

    const albumTitle = extractAlbumTitle(html);

    // Clean up title if it's generic
    const displayTitle = albumTitle === 'Google Photos' ? 'Shared Album' : albumTitle;
    console.log(`   Album: ${displayTitle}`);

    const authKey = extractAuthKey(html);
    const extractedAlbumId = extractAlbumId(html);
    console.log(`   Auth Key: ${authKey ? 'Found' : 'Missing'}`);

    // Extract AF_initDataCallback data
    const dataCallbackRegex = /AF_initDataCallback\({key:\s*'ds:1'[^}]*data:\s*(\[.*?\])\s*,\s*sideChannel/gs;
    const matches = [...html.matchAll(dataCallbackRegex)];

    if (matches.length === 0) {
        console.error(`   ⚠️  Could not find photo data in content`);
        return { albumTitle: displayTitle, photos: [], nextToken: null, authKey, albumId: extractedAlbumId };
    }

    console.log(`   Found ${matches.length} data blocks. Parsing...`);

    const photos = [];
    let nextToken = null;

    matches.forEach((match, index) => {
        let photoData;
        try {
            photoData = JSON.parse(match[1]);
        } catch (error) {
            console.error(`   ⚠️  Error parsing JSON data in block ${index}: ${error.message}`);
            return;
        }

        // Check for token in the initial data block
        // ds:1 structure: [?, [photos], token, ...]
        if (Array.isArray(photoData) && photoData.length > 2) {
            if (typeof photoData[2] === 'string' && photoData[2].length > 10) {
                nextToken = photoData[2];
                console.log(`   Found initial pagination token.`);
            }
        }

        // Extract photos from the data structure
        if (photoData && photoData[1] && Array.isArray(photoData[1])) {
            photoData[1].forEach((item) => {
                if (Array.isArray(item) && item.length >= 2) {
                    const photoId = item[0];
                    const photoInfo = item[1];

                    if (Array.isArray(photoInfo) && photoInfo.length >= 3) {
                        let url = photoInfo[0];
                        const width = photoInfo[1];
                        const height = photoInfo[2];
                        const timestamp = item[2];

                        // Modify URL to get full resolution
                        const baseUrl = url.split('=')[0];
                        url = `${baseUrl}=w1920-h1080`;

                        photos.push({
                            id: photoId,
                            url: url,
                            album: displayTitle,
                            originalWidth: width,
                            originalHeight: height,
                            timestamp: timestamp,
                            date: timestamp ? new Date(timestamp).toISOString() : null
                        });
                    }
                }
            });
        }
    });

    console.log(`   ✓ Extracted ${photos.length} initial photos`);
    return { albumTitle: displayTitle, photos, nextToken, authKey, albumId: extractedAlbumId };
}

/**
 * Download a single image
 */
function downloadImage(photo, outputDir) {
    return new Promise((resolve, reject) => {
        const fileName = `${photo.id}.jpg`;
        const filePath = path.join(outputDir, fileName);

        // Skip if already downloaded
        if (fs.existsSync(filePath)) {
            resolve({ photo, fileName, skipped: true });
            return;
        }

        const file = fs.createWriteStream(filePath);
        const protocol = photo.url.startsWith('https') ? https : http;

        protocol.get(photo.url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode} for ${photo.id}`));
                return;
            }

            response.pipe(file);

            file.on('finish', () => {
                file.close();
                resolve({ photo, fileName, skipped: false });
            });
        }).on('error', (err) => {
            fs.unlink(filePath, () => { }); // Delete partial file
            reject(err);
        });
    });
}

/**
 * Download images with concurrency control
 */
async function downloadImages(photos, outputDir) {
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    console.log(`\n📥 Downloading ${photos.length} images to ${outputDir}/`);
    console.log(`   Concurrent downloads: ${MAX_CONCURRENT_DOWNLOADS}`);

    let completed = 0;
    let skipped = 0;
    let failed = 0;

    // Process in batches
    for (let i = 0; i < photos.length; i += MAX_CONCURRENT_DOWNLOADS) {
        const batch = photos.slice(i, i + MAX_CONCURRENT_DOWNLOADS);
        const promises = batch.map(photo =>
            downloadImage(photo, outputDir)
                .then(result => {
                    if (result.skipped) {
                        skipped++;
                    } else {
                        completed++;
                    }
                    return result;
                })
                .catch(err => {
                    failed++;
                    console.error(`   ✗ Failed: ${err.message}`);
                    return null;
                })
        );

        await Promise.all(promises);

        const progress = Math.round(((completed + skipped + failed) / photos.length) * 100);
        process.stdout.write(`\r   Progress: ${progress}% (${completed} downloaded, ${skipped} skipped, ${failed} failed)`);
    }

    console.log('\n');
    return { completed, skipped, failed };
}

/**
 * Remove files that are no longer in the photo list
 */
function cleanupOrphanedImages(photos, outputDir) {
    if (!fs.existsSync(outputDir)) return { deleted: 0 };

    console.log('🧹 Cleaning up orphaned images...');
    const validFilenames = new Set(photos.map(p => `${p.id}.jpg`));
    const startFiles = fs.readdirSync(outputDir);
    let deleted = 0;

    startFiles.forEach(file => {
        // Only verify known image types to avoid deleting config/other files if mixed
        if (file.endsWith('.jpg') && !validFilenames.has(file)) {
            const filePath = path.join(outputDir, file);
            try {
                fs.unlinkSync(filePath);
                deleted++;
            } catch (err) {
                console.error(`   ⚠️ Failed to delete ${file}: ${err.message}`);
            }
        }
    });

    if (deleted > 0) {
        console.log(`   Deleted ${deleted} orphaned files.`);
    }
    return { deleted };
}

/**
 * Main execution
 */
/**
 * Main execution
 */
let isSyncing = false;

async function syncPhotos(customSources = null) {
    if (isSyncing) {
        console.log('⚠️  Sync already in progress, skipping...');
        return;
    }
    isSyncing = true;

    try {
        console.log('🖼️  Google Photos Parser & Downloader\n');

        let sources = customSources;

        // If no input files provided, try to read from config file
        if (!sources || sources.length === 0) {
            sources = [];
            if (fs.existsSync(CONFIG_FILE)) {
                console.log(`Reading albums from configuration file: ${CONFIG_FILE}`);
                const configContent = fs.readFileSync(CONFIG_FILE, 'utf-8');
                sources = configContent
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line && !line.startsWith('#'));
            }
        }

        if (sources.length === 0) {
            console.error('No albums found to process.');
            return;
        }

        // Parse all albums
        const allPhotos = [];
        const albumStats = [];

        for (const source of sources) {
            let html = '';
            let isUrl = source.startsWith('http');

            if (isUrl) {
                html = await fetchAlbumHtml(source);
            } else {
                if (fs.existsSync(source)) {
                    html = fs.readFileSync(source, 'utf-8');
                } else {
                    console.error(`Error: File not found: ${source}`);
                    continue;
                }
            }

            if (html) {
                const { albumTitle, photos, nextToken: initialToken, authKey, albumId } = parseAlbumContent(html, source);
                allPhotos.push(...photos);

                let currentToken = initialToken;
                let totalFetched = photos.length;

                // Pagination Loop
                if (currentToken && authKey && albumId) {
                    console.log(`   🚀 Starting pagination for ${albumTitle}...`);
                    let pageCount = 1;

                    while (currentToken) {
                        // Small delay to be nice
                        await new Promise(r => setTimeout(r, 1000));

                        const res = await fetchNextPage(albumId, currentToken, authKey);
                        if (res.photos && res.photos.length > 0) {
                            // Add album title to new photos
                            res.photos.forEach(p => p.album = albumTitle);
                            allPhotos.push(...res.photos);
                            totalFetched += res.photos.length;
                            console.log(`   Page ${pageCount}: Found ${res.photos.length} photos. Total: ${totalFetched}`);
                        }

                        currentToken = res.nextToken;
                        pageCount++;

                        if (!currentToken) {
                            console.log('   🏁 Reached end of album.');
                        }
                    }
                }

                albumStats.push({ title: albumTitle, count: totalFetched });
            }
        }

        console.log(`\n📊 Summary:`);
        console.log(`   Total albums: ${sources.length}`);
        console.log(`   Total photos: ${allPhotos.length}`);

        albumStats.forEach(stat => {
            console.log(`   - ${stat.title}: ${stat.count} photos`);
        });

        // Save metadata
        const metadataPath = path.join(process.cwd(), METADATA_FILE);
        fs.writeFileSync(metadataPath, JSON.stringify(allPhotos, null, 2));
        console.log(`\n💾 Saved metadata to: ${METADATA_FILE}`);

        // Download images (Always enabled)
        const outputDir = path.join(process.cwd(), OUTPUT_DIR);

        // 1. Download new (skipped if exists)
        const stats = await downloadImages(allPhotos, outputDir);

        // 2. Remove old (orphaned)
        const cleanupStats = cleanupOrphanedImages(allPhotos, outputDir);

        console.log('✅ Sync complete!');
        console.log(`   Downloaded: ${stats.completed}`);
        console.log(`   Skipped: ${stats.skipped}`);
        console.log(`   Removed: ${cleanupStats.deleted}`);
        console.log(`   Failed: ${stats.failed}`);

        console.log('\n✨ Done!\n');
    } catch (err) {
        console.error('\n❌ Sync Error:', err.message);
    } finally {
        isSyncing = false;
    }
}

// Check if run directly
if (require.main === module) {
    const inputSources = args.filter(arg => !arg.startsWith('-'));
    syncPhotos(inputSources.length > 0 ? inputSources : null).catch(err => {
        console.error('\n❌ Fatal Error:', err.message);
        process.exit(1);
    });
}

module.exports = { syncPhotos };
