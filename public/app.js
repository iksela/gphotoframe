// Configuration
const CONFIG = {
    slideDuration: 10000, // 10 seconds per slide
    transitionDuration: 1000, // 1 second fade
    idleTimeout: 3000, // Hide cursor after 3 seconds
    checkInterval: 5 * 60 * 1000, // Check for updates every 5 minutes
};

// State
let state = {
    photos: [],
    currentIndex: 0,
    isPlaying: true,
    timer: null,
    idleTimer: null,
};

// DOM Elements
const container = document.getElementById('slideshow-container');
const loading = document.getElementById('loading');
const controls = document.getElementById('controls');
const clockEl = document.getElementById('clock');
const dateEl = document.getElementById('photo-date');
const pauseBtn = document.getElementById('pause-btn');

/* Initialization */
async function init() {
    // startClock removed
    setupEventListeners();
    setupAutoRefresh();

    try {
        const response = await fetch('/api/photos');
        const photos = await response.json();

        if (photos.length > 0) {
            // Shuffle photos for random display
            shuffleArray(photos);
            state.photos = photos;
            loading.style.display = 'none';
            startSlideshow();
        } else {
            loading.innerHTML = '<p>No photos found. Please run the parser first.</p>';
        }
    } catch (error) {
        console.error('Failed to load photos:', error);
        loading.innerHTML = '<p>Error loading photos.</p>';
    }
}

/* Slideshow Logic */
function startSlideshow() {
    showSlide(state.currentIndex);
    resetTimer();
}

function showSlide(index) {
    // Ensure index is valid
    if (index >= state.photos.length) index = 0;
    if (index < 0) index = state.photos.length - 1;

    state.currentIndex = index;
    const photo = state.photos[index];

    // Create current slide element
    const slide = document.createElement('div');
    slide.className = 'slide';

    // Background Layer (Blurred & Zoomed)
    const bgLayer = document.createElement('div');
    bgLayer.className = 'slide-bg';
    bgLayer.style.backgroundImage = `url('${photo.src}')`;

    // Foreground Layer (Sharp & Contain)
    const fgLayer = document.createElement('div');
    fgLayer.className = 'slide-fg';
    fgLayer.style.backgroundImage = `url('${photo.src}')`;

    slide.appendChild(bgLayer);
    slide.appendChild(fgLayer);

    // Add to container
    container.appendChild(slide);

    // Trigger reflow to ensure transition works
    void slide.offsetWidth;

    // Fade in
    slide.classList.add('active');

    // Update info
    updatePhotoInfo(photo);

    // Clean up old slides
    const oldSlides = document.querySelectorAll('.slide:not(:last-child)');
    setTimeout(() => {
        oldSlides.forEach(el => el.remove());
    }, CONFIG.transitionDuration);

    // Preload next image
    preloadImage(getParameterizedIndex(index + 1));
}

function nextSlide() {
    showSlide(state.currentIndex + 1);
    resetTimer();
}

function prevSlide() {
    showSlide(state.currentIndex - 1);
    resetTimer();
}

function togglePlay() {
    state.isPlaying = !state.isPlaying;
    pauseBtn.textContent = state.isPlaying ? '❚❚' : '▶';

    if (state.isPlaying) {
        nextSlide(); // Immediately move to next
    } else {
        clearTimeout(state.timer);
    }
}

function resetTimer() {
    clearTimeout(state.timer);
    if (state.isPlaying) {
        state.timer = setTimeout(nextSlide, CONFIG.slideDuration);
    }
}

function getParameterizedIndex(index) {
    if (index >= state.photos.length) return 0;
    if (index < 0) return state.photos.length - 1;
    return index;
}

function preloadImage(index) {
    const img = new Image();
    img.src = state.photos[index].src;
}

/* UI Updates */
function updatePhotoInfo(photo) {
    if (photo.date) {
        const date = new Date(photo.date);
        dateEl.textContent = date.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    } else {
        dateEl.textContent = '';
    }
}
// startClock function removed

/**
 * Fisher-Yates Shuffle
 */
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}


/* Event Listeners */
function setupEventListeners() {
    // Controls
    document.getElementById('next-btn').addEventListener('click', nextSlide);
    document.getElementById('prev-btn').addEventListener('click', prevSlide);
    pauseBtn.addEventListener('click', togglePlay);

    // Keyboard
    document.addEventListener('keydown', (e) => {
        switch (e.key) {
            case 'ArrowRight': nextSlide(); break;
            case 'ArrowLeft': prevSlide(); break;
            case ' ': togglePlay(); break;
        }
        resetIdleTimer();
    });

    // Mouse movement (show/hide controls)
    document.addEventListener('mousemove', resetIdleTimer);
    document.addEventListener('click', resetIdleTimer);
    document.addEventListener('touchstart', resetIdleTimer);
    // Initial call: Start hidden (idle)
    document.body.classList.add('idle');
}

function resetIdleTimer() {
    document.body.classList.remove('idle');
    clearTimeout(state.idleTimer);
    state.idleTimer = setTimeout(() => {

        document.body.classList.add('idle');
    }, CONFIG.idleTimeout);
}

/* Auto-Refresh */
function setupAutoRefresh() {
    setInterval(checkForUpdates, CONFIG.checkInterval);
}

async function checkForUpdates() {
    try {
        const response = await fetch('/api/photos');
        const newPhotos = await response.json();

        if (newPhotos.length > 0) {
            // Check if content changed (compare sorted IDs)
            const currentIds = state.photos.map(p => p.id).sort().join(',');
            const newIds = newPhotos.map(p => p.id).sort().join(',');

            if (currentIds !== newIds) {
                console.log('📸 Photos updated! Refreshing list...');
                shuffleArray(newPhotos);
                state.photos = newPhotos;

                // Optional: Reset index if we want to restart cycle, 
                // but continuing is smoother. We just ensure index is safe.
                if (state.currentIndex >= state.photos.length) {
                    state.currentIndex = 0;
                }
            }
        }
    } catch (error) {
        console.error('Failed to check for updates:', error);
    }
}

// Start
init();
