import { runReplicateWallSegmentation } from "@/lib/ai/replicate-segmentation";
import { z } from "zod";

export async function POST(request:Request){
  const parsed=z.object({
    imageUrl:z.string().min(20).max(15_000_000),
  }).safeParse(await request.json());
  if(!parsed.success)return Response.json({ok:false,error:"A valid room image is required."},{status:400});
  const result=await runReplicateWallSegmentation(parsed.data.imageUrl);
  return Response.json(result,{status:result.ok?200:502});
}
