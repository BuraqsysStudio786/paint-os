ALTER TABLE "VisualizerSpace"
ADD COLUMN "maskStatus" TEXT NOT NULL DEFAULT 'draft',
ADD COLUMN "maskUpdatedAt" TIMESTAMP(3),
ADD COLUMN "maskUpdatedBy" TEXT;

UPDATE "VisualizerSpace"
SET
  "maskStatus" = CASE
    WHEN "maskJson"->>'status' = 'approved' THEN 'approved'
    WHEN "maskJson"->>'status' = 'needs_review' THEN 'needs_review'
    WHEN jsonb_array_length(COALESCE("maskJson"->'layers', "maskJson"->'masks', '[]'::jsonb)) > 0
      THEN 'approved'
    ELSE 'draft'
  END,
  "maskUpdatedAt" = "updatedAt"
WHERE "maskUpdatedAt" IS NULL;
