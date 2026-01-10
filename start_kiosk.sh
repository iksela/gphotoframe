#!/bin/bash
# Start script for Google Photo Frame in Kiosk Mode

# 1. Start the server in the background
echo "Starting Server..."
npm start > server.log 2>&1 &
SERVER_PID=$!

# Wait for server to be ready
echo "Waiting for server to start..."
sleep 5

# 2. Launch Chromium in Kiosk Mode
# --kiosk: Full screen mode
# --noerrdialogs: Suppress error dialogs
# --disable-infobars: Remove "Chrome is being controlled by automated test software"
# --check-for-update-interval=31536000: Stop update checks
echo "Launching Browser..."
chromium-browser \
    --kiosk \
    --noerrdialogs \
    --disable-infobars \
    --check-for-update-interval=31536000 \
    --disable-session-crashed-bubble \
    --disable-restore-session-state \
    "http://localhost:3000"

# Cleanup on exit
kill $SERVER_PID
