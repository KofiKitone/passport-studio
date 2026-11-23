# Ghana Passport Photo Editor with AI Background Removal

## Requirements
- Node.js 20.19+ or 22.12+
- npm

## Install and run
```bash
npm install
npm run dev
```
Open the local URL printed by Vite.

## Production build
```bash
npm run build
```
The production site is written to `dist/`. Deploy the contents of that folder to your web server.

## Background removal
Background removal is manual: upload a photo, turn on **Replace background with AI**, choose white or red, and click **Remove Background**. The first run downloads the model and WASM assets; later runs may use the browser cache. The photo itself is processed locally in the browser.

## Licensing note
`@imgly/background-removal` is distributed under AGPL-3.0. Review the license obligations before distributing or deploying this application, especially if the application is proprietary or closed source. IMG.LY lists commercial licensing inquiries at support@img.ly.
