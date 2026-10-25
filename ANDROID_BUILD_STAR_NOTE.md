# * ANDROID BUILD CHECKPOINT — BAD CAT 3D

Requested by user on 2026-10-25. This project is a **browser/PWA prototype**, NOT a compiled Android application yet.

**Before packaging as an Android APK/AAB, review and remove or replace the temporary browser-only mobile controls:**
- `#mobileGameBar` / `#mobileOrientation`: orientation toggle using the browser Screen Orientation API
- `#mobileFullscreen`: browser fullscreen toggle
- `#mobileInstall` and `#mobileInstallHint`: PWA install instructions
- Browser-webapp `manifest.webmanifest`, service-worker strategy (if any) and platform-specific icons/permissions; choose a native Android orientation/fullscreen implementation

Keep the responsive joystick and gameplay buttons unless a better native touch UI replaces them.
**Important:** Do not remove any of these features now; review them right before the actual Android conversion. The marker `*` in chat refers to this checklist.
