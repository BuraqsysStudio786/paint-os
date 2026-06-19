import { uploadFile } from "@/lib/storage";

const allowed = new Set(["image/jpeg", "image/png"]);

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ ok: false, error: "Image file is required." }, { status: 400 });
  if (!allowed.has(file.type)) return Response.json({ ok: false, error: "Upload a JPG or PNG image." }, { status: 415 });
  if (file.size > 10 * 1024 * 1024) return Response.json({ ok: false, error: "Image must be smaller than 10 MB." }, { status: 413 });
  const uploaded = await uploadFile(file, "visualizer");
  return Response.json({ ok: true, ...uploaded });
}
