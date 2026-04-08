# Raw Material Stock PWA

Phase 1.2 upgrade of the Raw Material Stock Count app, prepared for Git + Netlify deployment and starting with no hardcoded sample data.

## Included
- Transaction-based stock logic
- Safeguards to block negative stock issues
- Delivery validation for quantity and price
- Count validation for non-negative quantities with large-variance warnings
- Deliveries with unit prices in ZAR
- Issues by department with quick issue buttons
- Auto-fill for the last used supplier
- Physical counts that create automatic adjustment entries when variance exists
- Running balance in movement history
- Date filters for Today, This Week, and This Month
- Summary page with total inventory value in ZAR
- Consumption dashboard totals for received, issued, and adjustments
- CSV exports for inventory snapshot, movement history, and stock take report
- Local browser storage
- PWA install support through `vite-plugin-pwa`
- Empty first-run state with no demo products or transactions

## Run locally
```bash
npm install
npm run dev
```

## Build for production
```bash
npm run build
```

## Git + Netlify deployment
Netlify supports deploying Vite projects from a Git repository and, for Vite, its recommended build settings are `npm run build` with `dist` as the publish directory. When you connect a repository, Netlify also supports continuous deployment so each push updates the site automatically. citeturn668095search0turn668095search5turn668095search13

### 1. Create a Git repository
```bash
git init
git add .
git commit -m "Initial inventory PWA"
```

Then create an empty GitHub repository and connect it:
```bash
git branch -M main
git remote add origin <your-github-repo-url>
git push -u origin main
```

### 2. Connect the repo in Netlify
In Netlify, choose **Add new project** and deploy from your repository provider. Netlify documents repository-based deploys for GitHub, GitLab, Bitbucket, and Azure DevOps. citeturn668095search5

### 3. Confirm build settings
Use:
- Build command: `npm run build`
- Publish directory: `dist`

Those are the documented Vite defaults on Netlify. citeturn668095search0turn668095search2turn668095search7

### 4. Push changes to publish updates
Every push to your production branch triggers a new deploy. Pull or merge requests can also get deploy previews. citeturn668095search13turn668095search11

## Notes
- Data is stored in the browser with `localStorage`
- This is single-device Phase 1 storage only
- Offline use depends on visiting the app once so assets can be cached by the service worker
- Barcode scanning and cloud sync are intentionally deferred for later phases
