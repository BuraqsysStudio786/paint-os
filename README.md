# Paint Website OS

A database-powered, multi-tenant paint-brand website OS built with Next.js 16, React 19, Prisma 7, PostgreSQL/Supabase, Zod, Framer Motion, Canvas, Excel/CSV imports, Leaflet/OpenStreetMap, and secure admin authentication.

## Install

```bash
npm install
```

On Windows PowerShell, if `npm` is blocked by execution policy, use:

```powershell
npm.cmd install
```

## Environment

Create `.env` from `.env.example` and set:

```env
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."
NEXTAUTH_SECRET="replace-with-a-long-random-value"
NEXTAUTH_URL="http://localhost:3000"
```

AI and local vision:

```env
AI_PROVIDER="auto"
OPENAI_API_KEY=""
GEMINI_API_KEY=""
GROQ_API_KEY=""
OPENROUTER_API_KEY=""
HUGGINGFACE_API_KEY=""
OLLAMA_BASE_URL="http://localhost:11434"
OLLAMA_MODEL="llama3.1:8b"

VISION_PROVIDER="local"
VISION_SERVICE_URL="http://localhost:8001"
ENABLE_LOCAL_VISION="true"

REPLICATE_API_TOKEN=""
REPLICATE_SEGMENTATION_MODEL=""
REPLICATE_SEGMENTATION_VERSION=""
HUGGINGFACE_SEGMENTATION_MODEL=""
```

Other optional integrations:

```env

NEXT_PUBLIC_SUPABASE_URL=""
NEXT_PUBLIC_SUPABASE_ANON_KEY=""
SUPABASE_SERVICE_ROLE_KEY=""

CLOUDINARY_CLOUD_NAME=""
CLOUDINARY_API_KEY=""
CLOUDINARY_API_SECRET=""
RESEND_API_KEY=""
```

`DATABASE_URL` is used by the app at runtime. `DIRECT_URL` is used by Prisma CLI commands.

## Database

```bash
npx prisma generate
npx prisma db push
npx prisma db seed
```

Package scripts are also available:

```bash
npm run db:generate
npm run db:push
npm run db:seed
```

## Run Locally

```bash
npm run dev
```

Open:

- `http://localhost:3000`
- `http://localhost:3000/admin/login`
- `http://localhost:3000/admin`
- `http://localhost:3000/site/aurora-paints`

## Deploy to Vercel with Supabase

This project uses Prisma 7. Prisma 7 keeps the CLI datasource URL in
`prisma.config.ts`, rather than `url` and `directUrl` inside
`prisma/schema.prisma`. The application runtime uses `DATABASE_URL` through
the PostgreSQL driver adapter, while Prisma CLI commands use `DIRECT_URL`.

1. Create a Supabase project and copy both connection strings:

   - `DATABASE_URL`: Supabase transaction-pooler connection for the Vercel
     runtime. Include SSL settings supplied by Supabase.
   - `DIRECT_URL`: direct/session connection for Prisma CLI operations.

2. Import the repository into Vercel and keep the framework preset as
   **Next.js**.

3. Add these required Vercel environment variables for Production, Preview,
   and Development:

   ```env
   DATABASE_URL="your pooled Supabase PostgreSQL URL"
   DIRECT_URL="your direct Supabase PostgreSQL URL"
   NEXTAUTH_SECRET="a long random value"
   NEXTAUTH_URL="https://your-project.vercel.app"
   NEXT_PUBLIC_APP_URL="https://your-project.vercel.app"
   ```

4. Add Supabase Storage variables if uploads must persist:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=""
   NEXT_PUBLIC_SUPABASE_ANON_KEY=""
   SUPABASE_SERVICE_ROLE_KEY=""
   ```

5. For a quick Vercel demo without a hosted Python service, use:

   ```env
   VISION_PROVIDER="auto"
   VISION_SERVICE_URL=""
   ENABLE_LOCAL_VISION="false"
   ```

   Gallery visualizer rooms and manual polygon editing continue to work.
   Upload mode displays: “AI wall detection unavailable in this demo. Manual
   wall selection is available.”

6. AI keys are optional. Keep `AI_PROVIDER="auto"`. If no provider is
   configured, or OpenAI returns quota/rate-limit errors, the app uses its
   deterministic catalogue fallback.

7. Prepare the database once from a trusted local machine:

   ```bash
   npx prisma db push
   npm run db:seed
   ```

8. Deploy. Vercel runs `npm install`, the `postinstall` Prisma generation,
   and then:

   ```bash
   npm run build
   ```

The build script runs `prisma generate && next build`. Do not commit `.env` or
the Supabase service-role key; `.env.example` contains names only.

## Run the local Python vision service

Python 3.10 or 3.11 is recommended.

Windows:

```powershell
cd vision-service
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8001
```

macOS/Linux:

```bash
cd vision-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8001
```

Health check: `http://localhost:8001/health`

## Deploy the optional Python vision service to Render

The repository includes `render.yaml`, so Render can deploy the service as a
Blueprint. Alternatively, create a Python web service with:

- Root directory: `vision-service`
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Health check path: `/health`

After Render reports the service as healthy, add these variables to Vercel:

```env
VISION_PROVIDER="auto"
VISION_SERVICE_URL="https://your-service.onrender.com"
ENABLE_LOCAL_VISION="true"
```

Redeploy the Vercel project after changing environment variables. The vision
service is optional: if the URL is empty, the service is sleeping, or a request
fails, gallery rooms and manual wall selection remain available.

Seeded admin:

- Email: `admin@paintos.local`
- Password: `Admin@12345`

## What Is Database Driven

The runtime source of truth is PostgreSQL through Prisma:

- Clients, identity, contact details, socials, theme, and feature flags
- Product categories, products, product features, application steps, and documents
- Shades, color finder metadata, rooms, visualizer spaces, dealers, leads, imports, AI sessions, and visualizer projects

Seed content lives only in `prisma/seed.ts`.

## Admin Workflow

Log in and open `/admin/clients/[clientId]`.

The client workspace includes:

- Brand Identity
- Contact & Socials
- Theme & Styling
- Homepage Sections
- Products
- Product Categories
- Shades / Color Finder
- Rooms / Inspiration Gallery
- Visualizer Spaces
- Dealers / Store Locator
- Documents
- Blog / Expert Advice
- Leads
- AI Sessions
- Imports
- Settings / Feature Flags
- Preview Website

All create/edit/delete forms persist through Prisma server actions.

## Imports

Open `/admin/clients/[clientId]/imports`.

Supported imports:

- Products
- Shades
- Dealers

Workflow:

1. Choose import type.
2. Download the CSV template.
3. Drop a `.csv` or `.xlsx` file.
4. Preview rows.
5. Choose update-duplicates and skip-invalid options.
6. Import rows.
7. Review `ImportJob` history and row errors.
8. Download error CSV when failures occur.

Duplicate handling:

- Products: slug/SKU-oriented data model
- Shades: code/slug
- Dealers: slug

## Visualizer

The public visualizer is at `/site/[clientSlug]/visualizer`.

It supports:

- Approved, admin-curated gallery layers from `VisualizerSpace.maskJson`
- Multiple independent wall, ceiling, trim, or custom layers
- Uploaded JPG/PNG room photos
- Recommended click-assisted wall selection
- Auto candidates, rectangle masks, and manual corner polygons
- Draggable points, point insertion/removal, layer locking, visibility, and deletion
- Independent shade, finish, blend mode, opacity, contrast, and brightness per layer
- Shadow-preserving matt, silk, gloss, and texture rendering
- Before/after, mask visibility, zoom, fit, download, save, and WhatsApp quote
- Save project to `VisualizerProject`
- Local Python/OpenCV wall proposals with an `AISession` audit record
- Optional Replicate or Hugging Face provider fallback
- Development-only mask debug outlines, points, IDs, and coordinate checks

Mask JSON supports:

```json
{
  "version": 2,
  "status": "approved",
  "imageWidth": 1600,
  "imageHeight": 1000,
  "layers": [
    {
      "id": "wall-1",
      "name": "Main Wall",
      "type": "wall",
      "source": "gallery-admin",
      "points": [[100,100],[900,120],[880,700],[120,680]],
      "originalImageWidth": 1600,
      "originalImageHeight": 1000,
      "needsReview": false,
      "locked": true,
      "visible": true,
      "paint": {
        "shadeId": "database-shade-id",
        "shadeCode": "A-101",
        "shadeName": "Warm Linen",
        "shadeHex": "#F4E8D2",
        "finish": "matt",
        "opacity": 0.55,
        "contrast": 100,
        "brightness": 100,
        "blendMode": "multiply",
        "preserveShadows": true
      }
    }
  ]
}
```

## Wall segmentation strategy

Gallery rooms use accurate, admin-curated polygon masks stored in
`VisualizerSpace.maskJson`; they do not call AI on every visit.

Uploaded rooms use:

1. Click-assisted local Python proposals (recommended).
2. Auto candidates when useful.
3. Rectangle and manual corner tools, which are always available.
4. Draggable-point refinement before colour selection.

No paid SAM 2 API is required. Automatic wall detection is AI-assisted and
must be reviewed; users can move points, add/delete masks, and draw multiple
walls manually. If the Python service is offline, the visualizer returns a
manual-required response instead of crashing.

The Aurora seed includes eight fixed-aspect 1600×1000 visualizer templates with image-specific masks:

- Elite Living
- Master Bedroom
- Kids Room
- Office
- Kitchen
- Bathroom
- Exterior
- Compact Apartment Lounge

Run `npm run db:seed` after pulling seed changes.

In development, the debug drawer shows the last segmentation payload,
selected layer/source, mask points, image/canvas dimensions, contain offsets,
coordinate scales, and render timing. The panel is unavailable in production.

## AI Wizards

The AI dashboard and direct wizard routes are database-grounded and persist every result:

- Product Finder
- Color Palette Consultant
- Wall Problem / Seepage Solver
- Paint System Recommender
- Budget Guidance
- Shade Match Helper

Server endpoints:

```text
POST /api/site/[clientSlug]/ai/product-finder
POST /api/site/[clientSlug]/ai/color-consultant
POST /api/site/[clientSlug]/ai/problem-solver
POST /api/site/[clientSlug]/ai/system-recommender
POST /api/site/[clientSlug]/ai/budget-guidance
POST /api/site/[clientSlug]/ai/shade-match
POST /api/site/[clientSlug]/visualizer/segment
```

AI runs only on the server. In `AI_PROVIDER=auto`, the order is Gemini, Groq,
OpenRouter, OpenAI, Ollama, then deterministic catalogue rules. HTTP 429 and
other provider failures advance to the next configured provider. Product slugs
and shade codes are mapped back to tenant records before returning, and
`providerUsed`, `fallbackUsed`, and provider attempts are stored with the
`AISession` output.

## Smoke tests

- Vision health: `http://localhost:8001/health`
- Visualizer: `http://localhost:3000/site/aurora-paints/visualizer`
- AI tools: `http://localhost:3000/site/aurora-paints/ai-wizards`
- Color consultant: `http://localhost:3000/site/aurora-paints/color-consultant`
- Problem solver: `http://localhost:3000/site/aurora-paints/problem-solver`
- Redesigned homepage: `http://localhost:3000/site/aurora-paints`

To test segmentation with curl:

```bash
curl -X POST http://localhost:8001/segment-walls -F "image=@room.jpg" -F "mode=classical"
```

Expected workflow:

1. Gallery rooms use approved polygons from `VisualizerSpace.maskJson`.
2. Upload mode sends the image to the tenant Next.js route, which proxies it to
   the local Python service.
3. Weak detections return `manualRequired:true`; manual drawing and correction
   remain available.
4. Color Consultant returns Safe, Premium, and Bold database-backed palettes
   and saves an `AISession`.
5. Problem Solver returns cause, severity, preparation, inspection guidance,
   and a database product system, then saves an `AISession`.
6. The homepage presents the curated hero-to-tools-to-store journey and saves
   expert-help enquiries as leads.

## Dealer Locator

The public dealer locator is at `/site/[clientSlug]/dealers`.

It uses:

- `react-leaflet`
- `leaflet`
- OpenStreetMap tiles
- Browser geolocation for nearby sorting
- Search by dealer name, city, state/province, area, and zip/postal code
- Product category filtering
- Clickable dealer cards and map markers
- WhatsApp and OpenStreetMap directions links
- A top search/filter rail, large map, city-grouped dealer cards, and saved dealer inquiries
- List fallbacks for dealers without coordinates

Admin dealer forms include a Nominatim/OpenStreetMap coordinate lookup button and manual latitude/longitude fields.

## Supabase Storage

`src/lib/storage.ts` uploads server-side with `SUPABASE_SERVICE_ROLE_KEY` when configured.

Expected buckets:

- `client-assets`
- `product-images`
- `shade-cards`
- `documents`
- `room-images`
- `visualizer-spaces`
- `blog-images`
- `project-images`
- `imports`

If Supabase storage is not configured, the app returns a local placeholder URL.

## Create A New Client

1. Log in at `/admin/login`.
2. Open `/admin/clients`.
3. Click **Create client**.
4. Save identity and contact details.
5. Open the new client workspace.
6. Configure brand, contact, theme, features, products, shades, dealers, rooms, and visualizer spaces.
7. Preview at `/site/[clientSlug]`.

## Verification

```bash
npm run db:validate
npx tsc --noEmit
npm run build
npm run lint
```

Verified for the Aurora demo:

- All required public routes return successfully.
- Prisma schema validation, TypeScript, lint (warnings only), and production build pass.
- Seed contains 12 products, 40 shades, 8 visualizer spaces, and 12 dealers.
- Two seeded dealers intentionally omit coordinates to verify the list fallback.
- AI route smoke tests save catalogue-validated sessions; provider quota failures use the deterministic fallback without breaking the UI.

Production hardening still recommended: rate limiting, CSRF strategy for external integrations, audit logs, robust object-storage permissions, email notifications, and provider-specific AI segmentation adapters.
