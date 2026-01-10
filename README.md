# Google Photo Frame

A premium digital photo frame web application that displays photos from shared Google Photos albums on your own hardware (e.g., Raspberry Pi).

## Features

*   **Beautiful Slideshow**: Fullscreen display with "Ken Burns" zoom effect and blurred background for vertical photos.
*   **Google Photos Integration**: Scrapes and parses shared albums to extract thousands of photos (bypassing the initial page limit).
*   **Offline Support**: identifying and downloading all images locally for resilience against network issues.
*   **Metadata Overlay**: Elegantly displays the date of the photo.
*   **Kiosk Mode**: Includes scripts to launch in a locked-down, fullscreen browser environment.
*   **Auto-Update**: Periodically checks for new photos in the album (when running in online mode).
*   **Control Visibility**: UI controls hide automatically when idle, reappearing on interaction.
*   **Performance**: Optimized for low-power devices like Raspberry Pi 3/4.

## Prerequisites

*   **Node.js**: v18 or higher
*   **Chromium Browser**: Required for Kiosk mode (`sudo apt install chromium-browser`)

## Installation

1.  **Clone/Copy the project** to your device.
2.  **Install dependencies**:
    ```bash
    npm install
    ```

## Configuration

1.  Create or edit `albums.conf` in the project root.
2.  Add the URL of your shared Google Photos album(s), one per line.
    ```text
    https://photos.app.goo.gl/YourSharedAlbumLink
    ```

## Usage

### 1. Fetching Photos

Before running the frame, you must parse the albums to build the photo database.

**Fetching Photos**
Runs the parser to download photo metadata and save images to the local `photos/` directory.
```bash
npm run parse
```

### 2. Starting the Slideshow

To start the web server:
```bash
npm start
```
The frame is now available at `http://localhost:3000`.

### 3. Kiosk Mode

To launch the server and the browser in fullscreen kiosk mode (ideal for the actual frame device):
```bash
./start_kiosk.sh
```
*Press `Alt+F4` or kill the process to exit.*

## Deployment on Raspberry Pi

To make the frame start automatically when the Pi boots:

1.  **Prepare the Autostart file**:
    ```bash
    mkdir -p ~/.config/lxsession/LXDE-pi
    nano ~/.config/lxsession/LXDE-pi/autostart
    ```

2.  **Add the startup entry**:
    Add this line to the end of the file (adjust path as needed):
    ```bash
    @/home/pi/gphotoframe/start_kiosk.sh
    ```

3.  **Disable Screen Blanking**:
    `sudo raspi-config` > Display Options > Screen Blanking > **No**.

4.  **Hide Cursor (Optional)**:
    Install `unclutter` to hide the mouse cursor permanently if needed:
    ```bash
    sudo apt install unclutter
    ```

## Customization

*   **Slide Duration**: Edit `public/app.js` (default: 10 seconds).
*   **Effects**: Edit `public/style.css` to change animations or colors.

## Troubleshooting

*   **"Error 5" / Pagination fails**: Google may have updated their RPC protocol. Check the `ids` in `parse_photos.js`.
*   **Photos not loading**: Re-run `npm run parse` to sync new photos.
