# Render Deployment Setup

## Before Deploying to Render

Since your frontend and backend are in separate folders, follow these steps to integrate them for Render:

### Step 1: Build the Frontend
```bash
cd ../student-event-proj
npm run build
```

### Step 2: Copy Frontend Build to Backend
Copy the entire contents of `../student-event-proj/build/` into the `public/` folder in the backend:

**On Windows (PowerShell):**
```powershell
Copy-Item -Path "..\student-event-proj\build\*" -Destination ".\public\" -Recurse -Force
```

**On Mac/Linux:**
```bash
cp -r ../student-event-proj/build/* ./public/
```

### Step 3: Commit and Push to Git
```bash
git add public/
git commit -m "Add frontend build to public folder"
git push
```

### Step 4: Deploy to Render
1. Go to [render.com](https://render.com)
2. Connect your GitHub repository
3. Create a new **Web Service**
4. Select the backend repository
5. Configure:
   - **Build Command:** `npm install`
   - **Start Command:** `npm run start`
   - **Environment Variables:**
     - `MONGO_URI`: Your MongoDB connection string
     - `JWT_SECRET`: Your JWT secret key
     - `NODE_ENV`: `production`

## What's Configured

- Backend serves frontend static files from the `public/` folder
- All non-API routes are redirected to `index.html` (React Router compatibility)
- API routes (`/api/*`) work as normal
- Uploads are served from `/uploads`

## Testing Locally

```bash
# Build frontend
cd ../student-event-proj && npm run build

# Copy to backend public folder
cp -r build/* ../student-event-backend/public/

# Start backend
cd ../student-event-backend
npm install
npm start
```

Then visit `http://localhost:5000` to see your full application.
