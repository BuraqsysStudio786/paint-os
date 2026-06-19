import "server-only";

import Replicate from "replicate";

export type SegmentationResult =
  | {
      ok: true;
      maskDataUrl: string;
      model: string;
      source: "replicate";
    }
  | { ok: false; error: string };

const DEFAULT_MODEL = "schananas/grounded_sam";
const DEFAULT_VERSION = "ee871c19efb1941f55f66a3d7d960428c8a5afcb77449547fe8e5a3ab9ebc21c";

function dataUrl(buffer: ArrayBuffer, contentType: string) {
  return `data:${contentType};base64,${Buffer.from(buffer).toString("base64")}`;
}

async function downloadMask(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Mask download returned ${response.status}.`);
  const contentType = response.headers.get("content-type") || "image/png";
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > 12 * 1024 * 1024) throw new Error("Detected mask was too large.");
  return dataUrl(buffer, contentType);
}

function outputUrl(output: unknown) {
  if (Array.isArray(output)) {
    const urls = output.map(String);
    return urls[2] || urls.find((value) => /mask/i.test(value)) || urls[0];
  }
  if (typeof output === "string") return output;
  if (output && typeof output === "object") {
    const record = output as Record<string, unknown>;
    return String(record.mask || record.combined_mask || record.output || "");
  }
  return "";
}

export async function runReplicateWallSegmentation(imageUrl: string): Promise<SegmentationResult> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return { ok: false, error: "AI wall detection is not configured. Continue with manual polygon selection." };

  const model = process.env.REPLICATE_SEGMENTATION_MODEL || DEFAULT_MODEL;
  const configuredVersion = process.env.REPLICATE_SEGMENTATION_VERSION;

  try {
    const replicate = new Replicate({ auth: token });
    let version = configuredVersion;
    if (!version && model !== DEFAULT_MODEL) {
      const [owner, name] = model.split("/");
      if (!owner || !name) throw new Error("The configured segmentation model must use owner/name format.");
      version = (await replicate.models.get(owner, name)).latest_version?.id;
    }
    version ||= DEFAULT_VERSION;

    const target = `${model}:${version}` as `${string}/${string}:${string}`;
    const output = await replicate.run(target, {
      input: model === DEFAULT_MODEL
        ? {
            image: imageUrl,
            mask_prompt: "wall,painted wall,interior wall,exterior wall",
            negative_mask_prompt: "floor,ceiling,furniture,window,door,person",
            adjustment_factor: 2,
          }
        : {
            image: imageUrl,
            prompt: "wall",
            text_prompt: "wall",
            mask_prompt: "wall",
          },
    });
    const url = outputUrl(output);
    if (!url.startsWith("http")) throw new Error("The segmentation model did not return a usable mask.");

    return {
      ok: true,
      maskDataUrl: await downloadMask(url),
      model,
      source: "replicate",
    };
  } catch (error) {
    return {
      ok: false,
      error: `AI wall detection failed: ${error instanceof Error ? error.message : "Unknown provider error"}. Manual polygon mode is still available.`,
    };
  }
}
