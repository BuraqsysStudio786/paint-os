export type UploadKind="logo"|"product"|"room"|"visualizer"|"document"|"shade-card"|"blog"|"project";
import { createClient } from "@supabase/supabase-js";

const bucketByKind: Record<UploadKind | "import", string> = {
  logo: "client-assets",
  product: "product-images",
  room: "room-images",
  visualizer: "visualizer-spaces",
  document: "documents",
  "shade-card": "shade-cards",
  blog: "blog-images",
  project: "project-images",
  import: "imports",
};

export async function uploadFile(file:File,kind:UploadKind){
  const bucket = bucketByKind[kind];
  const key = `${kind}/${Date.now()}-${file.name.replace(/[^a-z0-9._-]/gi, "-")}`;
  if(process.env.SUPABASE_SERVICE_ROLE_KEY&&process.env.NEXT_PUBLIC_SUPABASE_URL){
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { error } = await supabase.storage.from(bucket).upload(key, file, { upsert: true, contentType: file.type || undefined });
    if (!error) {
      const { data } = supabase.storage.from(bucket).getPublicUrl(key);
      return { url: data.publicUrl, provider: "supabase" };
    }
    console.warn(`Supabase upload failed for ${bucket}/${key}:`, error.message);
  }
  return {url:`/uploads/${key}`,provider:"local-placeholder"};
}
