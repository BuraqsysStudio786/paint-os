"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { clearSession, createSession, requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { asBool, asList, asNumber, hexToRgb, parseJsonList, slugify } from "@/lib/paint";
import { detectWallMaskWithReplicate } from "@/lib/ai/segmentation";
import { runPaintWizard, wizardTypes } from "@/lib/ai/wizard-engine";
import { createVisualizerProject, visualizerProjectSchema } from "@/lib/visualizer-project";
import { normalizeMaskDocument, serializeMaskDocument } from "@/lib/visualizer/mask-document";

const loginSchema=z.object({email:z.string().email(),password:z.string().min(8)});
export async function loginAction(_:unknown,formData:FormData){
  const parsed=loginSchema.safeParse(Object.fromEntries(formData));if(!parsed.success)return{error:"Enter a valid email and password."};
  const user=await db.user.findUnique({where:{email:parsed.data.email.toLowerCase()}});
  if(!user||!await bcrypt.compare(parsed.data.password,user.passwordHash))return{error:"Email or password is incorrect."};
  await createSession({id:user.id,email:user.email,role:user.role});redirect("/admin");
}
export async function logoutAction(){await clearSession();redirect("/admin/login")}

const clientSchema=z.object({name:z.string().min(2),slug:z.string().regex(/^[a-z0-9-]+$/),tagline:z.string().min(2),email:z.string().email(),phone:z.string().min(6),city:z.string().min(2),country:z.string().min(2)});
export async function createClientAction(_:unknown,formData:FormData){
  await requireAdmin();const parsed=clientSchema.safeParse(Object.fromEntries(formData));if(!parsed.success)return{error:parsed.error.issues[0].message};
  const exists=await db.client.findUnique({where:{slug:parsed.data.slug}});if(exists)return{error:"That slug is already in use."};
  const client=await db.client.create({data:{...parsed.data,description:"A new paint brand powered by Paint Website OS.",primaryColor:"#183E32",secondaryColor:"#C8A35D",accentColor:"#A65338",backgroundColor:"#F2EFE8",surfaceColor:"#FAF8F3",textColor:"#17221D",mutedTextColor:"#68736D",tone:"premium",whatsappNumber:parsed.data.phone.replace(/\D/g,""),featureFlag:{create:{}}}});
  redirect(`/admin/clients/${client.id}`);
}

function clientPath(id:string, section=""){return `/admin/clients/${id}${section?`/${section}`:""}`}
function publicPath(slug?:string|null){return slug?`/site/${slug}`:"/site"}

export async function updateBrandAction(formData:FormData){
  await requireAdmin();const id=String(formData.get("clientId"));
  const client=await db.client.update({where:{id},data:{
    name:String(formData.get("name")),slug:slugify(String(formData.get("slug")||formData.get("name"))),tagline:String(formData.get("tagline")),description:String(formData.get("description")),
    logoUrl:String(formData.get("logoUrl")||""),logoLightUrl:String(formData.get("logoLightUrl")||""),logoDarkUrl:String(formData.get("logoDarkUrl")||""),faviconUrl:String(formData.get("faviconUrl")||""),
    website:String(formData.get("website")||""),tone:String(formData.get("tone")||"premium"),themePreset:String(formData.get("themePreset")||"premium-home"),
  }});
  revalidatePath(clientPath(id));revalidatePath(publicPath(client.slug),"layout");redirect(clientPath(id,"brand"));
}

export async function updateContactAction(formData:FormData){
  await requireAdmin();const id=String(formData.get("clientId"));
  const client=await db.client.update({where:{id},data:{
    phone:String(formData.get("phone")||""),whatsappNumber:String(formData.get("whatsappNumber")||""),email:String(formData.get("email")||""),address:String(formData.get("address")||""),
    city:String(formData.get("city")||""),state:String(formData.get("state")||""),country:String(formData.get("country")||""),zipCode:String(formData.get("zipCode")||""),website:String(formData.get("website")||""),
    facebookUrl:String(formData.get("facebookUrl")||""),instagramUrl:String(formData.get("instagramUrl")||""),youtubeUrl:String(formData.get("youtubeUrl")||""),linkedinUrl:String(formData.get("linkedinUrl")||""),tiktokUrl:String(formData.get("tiktokUrl")||""),
  }});
  for (const platform of ["facebook","instagram","youtube","linkedin","tiktok"]) {
    const url = String(formData.get(`${platform}Url`) || "");
    if (url) await db.socialLink.upsert({where:{clientId_platform:{clientId:id,platform}},update:{url,isActive:true,iconKey:platform},create:{clientId:id,platform,url,iconKey:platform}});
  }
  revalidatePath(clientPath(id));revalidatePath(publicPath(client.slug),"layout");redirect(clientPath(id,"contact"));
}

export async function updateThemeAction(formData:FormData){
  await requireAdmin();const id=String(formData.get("clientId"));const client=await db.client.update({where:{id},data:{primaryColor:String(formData.get("primaryColor")),secondaryColor:String(formData.get("secondaryColor")),accentColor:String(formData.get("accentColor")),backgroundColor:String(formData.get("backgroundColor")),surfaceColor:String(formData.get("surfaceColor")),textColor:String(formData.get("textColor")||"#17221D"),mutedTextColor:String(formData.get("mutedTextColor")||"#68736D"),headingFont:String(formData.get("headingFont")),bodyFont:String(formData.get("bodyFont")),buttonStyle:String(formData.get("buttonStyle")||"soft"),cardStyle:String(formData.get("cardStyle")||"editorial")}});revalidatePath("/admin");revalidatePath(publicPath(client.slug),"layout");redirect(clientPath(id,"theme"));
}

export async function updateFeatureAction(formData:FormData){
  await requireAdmin();const clientId=String(formData.get("clientId"));const key=String(formData.get("key"));const value=formData.get("value")==="true";await db.featureFlag.update({where:{clientId},data:{[key]:value}});revalidatePath(clientPath(clientId,"settings"));
}

export async function upsertCategoryAction(formData:FormData){
  await requireAdmin();const clientId=String(formData.get("clientId"));const id=String(formData.get("id")||"");const name=String(formData.get("name"));
  const data={clientId,name,slug:slugify(String(formData.get("slug")||name)),description:String(formData.get("description")||""),imageUrl:String(formData.get("imageUrl")||""),iconKey:String(formData.get("iconKey")||"PaintBucket"),order:asNumber(formData.get("order"),0),isActive:asBool(formData.get("isActive"))};
  if(id)await db.productCategory.update({where:{id,clientId},data});else await db.productCategory.create({data});
  revalidatePath(clientPath(clientId,"categories"));redirect(clientPath(clientId,"categories"));
}
export async function deleteCategoryAction(formData:FormData){await requireAdmin();const id=String(formData.get("id"));const clientId=String(formData.get("clientId"));await db.productCategory.delete({where:{id,clientId}});revalidatePath(clientPath(clientId,"categories"))}

const productSchema=z.object({clientId:z.string(),categoryId:z.string(),name:z.string().min(2),slug:z.string().min(2)});
export async function upsertProductAction(formData:FormData){
  await requireAdmin();const parsed=productSchema.parse(Object.fromEntries(formData));const id=String(formData.get("id")||"");
  const data={
    clientId:parsed.clientId,categoryId:parsed.categoryId,name:parsed.name,slug:slugify(parsed.slug),sku:String(formData.get("sku")||"")||null,subtitle:String(formData.get("subtitle")||""),shortDescription:String(formData.get("shortDescription")||""),longDescription:String(formData.get("longDescription")||""),
    imageUrl:String(formData.get("imageUrl")||""),bucketImageUrl:String(formData.get("bucketImageUrl")||""),heroImageUrl:String(formData.get("heroImageUrl")||""),galleryJson:asList(formData.get("galleryImages")),finish:String(formData.get("finish")||"Matt"),sheenLevel:String(formData.get("sheenLevel")||formData.get("finish")||"Matt"),surface:String(formData.get("surface")||"Walls"),productType:String(formData.get("productType")||"Emulsion"),interiorExterior:String(formData.get("interiorExterior")||"interior"),spacesJson:asList(formData.get("spaces")),colorFamiliesJson:asList(formData.get("colorFamilies")),waterBased:asBool(formData.get("waterBased")),oilBased:asBool(formData.get("oilBased")),coverageSqftPerLiterOneCoat:asNumber(formData.get("coverageSqftPerLiterOneCoat"),100),coverageSqftPerLiterTwoCoat:asNumber(formData.get("coverageSqftPerLiterTwoCoat"),50),recommendedCoats:asNumber(formData.get("recommendedCoats"),2),dryingTime:String(formData.get("dryingTime")||"2-4 hours"),recoatTime:String(formData.get("recoatTime")||"4-6 hours"),applicationToolsJson:asList(formData.get("applicationTools")),packSizesJson:asList(formData.get("packSizes")).map(Number).filter(Boolean),featuresJson:asList(formData.get("features")),benefitsJson:asList(formData.get("benefits")),recommendedSystemJson:asList(formData.get("recommendedSystem")),availableShadeIdsJson:asList(formData.get("availableShadeIds")),warrantyYears:formData.get("warrantyYears")?asNumber(formData.get("warrantyYears")):null,priceMode:String(formData.get("priceMode")||"quote") as "hidden"|"quote"|"show"|"ecommerce",startingPrice:formData.get("startingPrice")?asNumber(formData.get("startingPrice")):null,currency:String(formData.get("currency")||"PKR"),tdsUrl:String(formData.get("tdsUrl")||""),sdsUrl:String(formData.get("sdsUrl")||""),brochureUrl:String(formData.get("brochureUrl")||""),applicationGuideUrl:String(formData.get("applicationGuideUrl")||""),isFeatured:asBool(formData.get("isFeatured")),isNew:asBool(formData.get("isNew")),isBestSeller:asBool(formData.get("isBestSeller")),seoTitle:String(formData.get("seoTitle")||""),seoDescription:String(formData.get("seoDescription")||""),
  };
  const product=id?await db.product.update({where:{id,clientId:parsed.clientId},data}):await db.product.create({data});
  await db.productFeature.deleteMany({where:{productId:product.id}});
  await db.applicationStep.deleteMany({where:{productId:product.id}});
  const features=parseJsonList(formData.get("featureRows")).filter((x):x is Record<string,unknown>=>!!x&&typeof x==="object");
  const steps=parseJsonList(formData.get("stepRows")).filter((x):x is Record<string,unknown>=>!!x&&typeof x==="object");
  if(features.length)await db.productFeature.createMany({data:features.map((f,i)=>({clientId:parsed.clientId,productId:product.id,title:String(f.title||""),description:String(f.description||""),iconKey:String(f.iconKey||"ShieldCheck"),order:asNumber(f.order,i+1)})).filter(f=>f.title)});
  if(steps.length)await db.applicationStep.createMany({data:steps.map((s,i)=>({clientId:parsed.clientId,productId:product.id,stepNumber:asNumber(s.stepNumber,i+1),title:String(s.title||""),productName:String(s.productName||product.name),coats:asNumber(s.coats,1),tool:String(s.tool||"Roller"),description:String(s.description||""),iconKey:String(s.iconKey||"Paintbrush"),order:asNumber(s.order,i+1)})).filter(s=>s.title)});
  revalidatePath(clientPath(parsed.clientId,"products"));redirect(clientPath(parsed.clientId,"products"));
}
export async function createProductAction(formData:FormData){return upsertProductAction(formData)}
export async function deleteProductAction(formData:FormData){await requireAdmin();const id=String(formData.get("id"));const clientId=String(formData.get("clientId"));await db.product.delete({where:{id,clientId}});revalidatePath(clientPath(clientId,"products"))}
export async function duplicateProductAction(formData:FormData){
  await requireAdmin();const id=String(formData.get("id"));const clientId=String(formData.get("clientId"));
  const p=await db.product.findUnique({where:{id,clientId},include:{productFeatures:true,applicationSteps:true}});if(!p)return;
  const copy = { ...p } as Record<string, unknown>;
  delete copy.id; delete copy.createdAt; delete copy.updatedAt; delete copy.productFeatures; delete copy.applicationSteps;
  await db.product.create({data:{...(copy as object),name:`${p.name} Copy`,slug:`${p.slug}-copy`,sku:p.sku?`${p.sku}-COPY`:null,productFeatures:{create:p.productFeatures.map(f=>({clientId,title:f.title,description:f.description,iconKey:f.iconKey,imageUrl:f.imageUrl,order:f.order}))},applicationSteps:{create:p.applicationSteps.map(s=>({clientId,stepNumber:s.stepNumber,title:s.title,productName:s.productName,coats:s.coats,tool:s.tool,description:s.description,iconKey:s.iconKey,order:s.order}))}} as never});
  revalidatePath(clientPath(clientId,"products"));
}

export async function upsertShadeAction(formData:FormData){
  await requireAdmin();const clientId=String(formData.get("clientId"));const id=String(formData.get("id")||"");const name=String(formData.get("name"));const hex=String(formData.get("hex")||"#d8d8d8");
  const data={clientId,name,slug:slugify(String(formData.get("slug")||name)),code:String(formData.get("code")),hex,rgb:hexToRgb(hex),colorFamily:String(formData.get("colorFamily")||"Other"),temperature:String(formData.get("temperature")||"neutral"),mood:String(formData.get("mood")||"balanced"),lightness:String(formData.get("lightness")||"medium"),season:String(formData.get("season")||""),spacesJson:asList(formData.get("spaces")),bestRoomsJson:asList(formData.get("bestRooms")),matchingShadeIdsJson:asList(formData.get("matchingShadeIds")),collection:String(formData.get("collection")||"Core"),finishAvailabilityJson:asList(formData.get("finishAvailability")),productIdsJson:asList(formData.get("productIds")),description:String(formData.get("description")||""),isTrending:asBool(formData.get("isTrending")),isColorOfYear:asBool(formData.get("isColorOfYear")),isActive:asBool(formData.get("isActive"))};
  if(id)await db.shade.update({where:{id,clientId},data});else await db.shade.create({data});revalidatePath(clientPath(clientId,"shades"));redirect(clientPath(clientId,"shades"));
}
export async function createShadeAction(formData:FormData){return upsertShadeAction(formData)}
export async function deleteShadeAction(formData:FormData){await requireAdmin();const id=String(formData.get("id"));const clientId=String(formData.get("clientId"));await db.shade.delete({where:{id,clientId}});revalidatePath(clientPath(clientId,"shades"))}

export async function upsertDealerAction(formData:FormData){
  await requireAdmin();const clientId=String(formData.get("clientId"));const id=String(formData.get("id")||"");const name=String(formData.get("name"));
  const data={clientId,name,slug:slugify(String(formData.get("slug")||name)),city:String(formData.get("city")||""),state:String(formData.get("state")||""),area:String(formData.get("area")||""),zipCode:String(formData.get("zipCode")||""),address:String(formData.get("address")||""),phone:String(formData.get("phone")||""),whatsapp:String(formData.get("whatsapp")||""),email:String(formData.get("email")||""),latitude:formData.get("latitude")?asNumber(formData.get("latitude")):null,longitude:formData.get("longitude")?asNumber(formData.get("longitude")):null,availableProductCategoryIdsJson:asList(formData.get("availableCategoryIds")),openingHours:String(formData.get("openingHours")||""),managerName:String(formData.get("managerName")||""),isFeatured:asBool(formData.get("isFeatured")),isActive:asBool(formData.get("isActive"))};
  if(id)await db.dealer.update({where:{id,clientId},data});else await db.dealer.create({data});revalidatePath(clientPath(clientId,"dealers"));redirect(clientPath(clientId,"dealers"));
}
export async function deleteDealerAction(formData:FormData){await requireAdmin();const id=String(formData.get("id"));const clientId=String(formData.get("clientId"));await db.dealer.delete({where:{id,clientId}});revalidatePath(clientPath(clientId,"dealers"))}

export async function upsertRoomAction(formData:FormData){
  await requireAdmin();const clientId=String(formData.get("clientId"));const id=String(formData.get("id")||"");const name=String(formData.get("name"));
  const data={clientId,name,slug:slugify(String(formData.get("slug")||name)),description:String(formData.get("description")||""),imageUrl:String(formData.get("imageUrl")||""),roomType:String(formData.get("roomType")||""),space:String(formData.get("space")||""),dominantColorFamily:String(formData.get("dominantColorFamily")||""),recommendedShadeIdsJson:asList(formData.get("recommendedShadeIds")),recommendedProductIdsJson:asList(formData.get("recommendedProductIds")),designTips:String(formData.get("designTips")||""),order:asNumber(formData.get("order"),0),isActive:asBool(formData.get("isActive"))};
  if(id)await db.room.update({where:{id,clientId},data});else await db.room.create({data});revalidatePath(clientPath(clientId,"rooms"));redirect(clientPath(clientId,"rooms"));
}
export async function deleteRoomAction(formData:FormData){await requireAdmin();const id=String(formData.get("id"));const clientId=String(formData.get("clientId"));await db.room.delete({where:{id,clientId}});revalidatePath(clientPath(clientId,"rooms"))}

export async function upsertVisualizerSpaceAction(formData:FormData){
  const session=await requireAdmin();const clientId=String(formData.get("clientId"));const id=String(formData.get("id")||"");const name=String(formData.get("name"));
  const maskRaw=String(formData.get("maskJson")||"{}");let maskJson:object;try{maskJson=serializeMaskDocument(normalizeMaskDocument(JSON.parse(maskRaw),{gallery:true}))}catch{maskJson=serializeMaskDocument(normalizeMaskDocument({imageWidth:1600,imageHeight:1000,layers:[],status:"draft"},{gallery:true}))}
  const maskStatus=String((maskJson as {status?:string}).status||"draft");const data={clientId,name,slug:slugify(String(formData.get("slug")||name)),roomType:String(formData.get("roomType")||""),space:String(formData.get("space")||""),imageUrl:String(formData.get("imageUrl")||""),thumbnailUrl:String(formData.get("thumbnailUrl")||formData.get("imageUrl")||""),maskJson,maskStatus,maskUpdatedAt:new Date(),maskUpdatedBy:session.id,defaultShadeId:String(formData.get("defaultShadeId")||"")||null,isFeatured:asBool(formData.get("isFeatured")),isActive:asBool(formData.get("isActive"))};
  if(id)await db.visualizerSpace.update({where:{id,clientId},data});else await db.visualizerSpace.create({data});revalidatePath(clientPath(clientId,"visualizer-spaces"));redirect(clientPath(clientId,"visualizer-spaces"));
}

const leadSchema=z.object({clientId:z.string(),name:z.string().min(2),phone:z.string().min(7),email:z.string().email().optional().or(z.literal("")),city:z.string().optional(),source:z.string(),message:z.string().optional(),estimatedArea:z.coerce.number().optional(),estimatedLiters:z.coerce.number().optional(),metadataJson:z.string().optional()});
export async function createLeadAction(_:unknown,formData:FormData){
  const parsed=leadSchema.safeParse(Object.fromEntries(formData));if(!parsed.success)return{error:parsed.error.issues[0].message};
  const {metadataJson,...data}=parsed.data;await db.lead.create({data:{...data,email:data.email||null,metadataJson:metadataJson?JSON.parse(metadataJson):undefined}});return{success:"Your request has been saved. An advisor will follow up."};
}
export async function saveAISession(input:{clientId:string;type:string;input:unknown;output:unknown;leadId?:string}){await db.aISession.create({data:{clientId:input.clientId,type:input.type,inputJson:input.input as object,outputJson:input.output as object,leadId:input.leadId}})}
export async function saveVisualizerProject(input:z.input<typeof visualizerProjectSchema>){
  return createVisualizerProject(input);
}

export async function aiSegmentWallAction(input:{clientId:string;imageDataUrl:string;width:number;height:number}){
  const output=await detectWallMaskWithReplicate(input.imageDataUrl);
  await saveAISession({clientId:input.clientId,type:"replicate_wall_segmentation",input:{width:input.width,height:input.height},output});
  return output;
}

const wizardActionSchema = z.object({
  clientSlug: z.string().min(1).optional(),
  clientId: z.string().min(1).optional(),
  type: z.enum(wizardTypes),
  answers: z.record(z.string(), z.string().max(1000)).refine(
    (answers) => Object.values(answers).some((answer) => answer.trim().length > 0),
    "Answer at least one question.",
  ),
  contact: z.object({
    name: z.string().trim().min(2).max(100),
    phone: z.string().trim().min(7).max(30),
    email: z.string().trim().email().optional().or(z.literal("")),
    city: z.string().trim().max(100).optional(),
  }).optional(),
}).refine((input) => input.clientSlug || input.clientId, "Client is required.");

export async function runAIWizardAction(input:{
  clientSlug?: string;
  clientId?: string;
  type: string;
  answers: Record<string, string>;
  contact?: { name: string; phone: string; email?: string; city?: string };
}){
  const parsed = wizardActionSchema.parse(input);
  let clientSlug = parsed.clientSlug;
  if (!clientSlug && parsed.clientId) {
    clientSlug = (await db.client.findUnique({
      where: { id: parsed.clientId, isActive: true },
      select: { slug: true },
    }))?.slug;
  }
  if (!clientSlug) throw new Error("Paint brand not found.");
  return runPaintWizard({
    clientSlug,
    type: parsed.type,
    answers: parsed.answers,
    contact: parsed.contact ? { ...parsed.contact, email: parsed.contact.email || undefined } : undefined,
  });
}

export async function importRowsAction(input:{clientId:string;type:"products"|"shades"|"dealers";fileName:string;rows:Record<string,unknown>[];updateDuplicates:boolean;skipInvalid?:boolean}){
  await requireAdmin();const job=await db.importJob.create({data:{clientId:input.clientId,type:input.type,status:"validating",fileName:input.fileName,totalRows:input.rows.length,importedRows:0,failedRows:0}});
  let imported=0;const errors:{rowNumber:number;field:string;message:string;rawJson:object}[]=[];
  for(const [index,row] of input.rows.entries())try{
    if(input.type==="shades"){
      const valid=z.object({name:z.string().min(1),code:z.string().min(1),hex:z.string().regex(/^#[0-9a-f]{6}$/i)}).parse(row);const data={...valid,slug:slugify(String(row.slug||valid.name)),rgb:hexToRgb(valid.hex),colorFamily:String(row.colorFamily||"Other"),temperature:String(row.temperature||"neutral"),mood:String(row.mood||"balanced"),lightness:String(row.lightness||"medium"),season:String(row.season||""),spacesJson:String(row.spaces||"").split(",").filter(Boolean),bestRoomsJson:String(row.bestRooms||"").split(",").filter(Boolean),matchingShadeIdsJson:[],collection:String(row.collection||"Imported"),finishAvailabilityJson:String(row.finishAvailability||"Matt,Silk").split(","),productIdsJson:[],description:String(row.description||`${valid.name} imported shade.`),isTrending:asBool(row.isTrending),isColorOfYear:asBool(row.isColorOfYear),isActive:row.isActive===undefined?true:asBool(row.isActive)};
      if(input.updateDuplicates)await db.shade.upsert({where:{clientId_code:{clientId:input.clientId,code:valid.code}},update:data,create:{clientId:input.clientId,...data}});else await db.shade.create({data:{clientId:input.clientId,...data}});
    }else if(input.type==="products"){
      const valid=z.object({name:z.string().min(1),category:z.string().min(1),slug:z.string().min(1)}).parse(row);const category=await db.productCategory.findFirst({where:{clientId:input.clientId,OR:[{name:valid.category},{slug:slugify(valid.category)}]}});if(!category)throw new Error(`Unknown category: ${valid.category}`);
      const data={categoryId:category.id,name:valid.name,slug:slugify(valid.slug),sku:String(row.sku||"")||null,subtitle:String(row.subtitle||""),shortDescription:String(row.shortDescription||""),longDescription:String(row.longDescription||""),imageUrl:String(row.imageUrl||""),bucketImageUrl:String(row.bucketImageUrl||""),heroImageUrl:String(row.heroImageUrl||""),galleryJson:[],finish:String(row.finish||"Matt"),sheenLevel:String(row.sheenLevel||row.finish||"Matt"),surface:String(row.surface||"Walls"),productType:String(row.productType||"Emulsion"),interiorExterior:String(row.interiorExterior||"interior"),spacesJson:String(row.spaces||"").split(",").filter(Boolean),colorFamiliesJson:String(row.colorFamilies||"").split(",").filter(Boolean),waterBased:row.waterBased===undefined?true:asBool(row.waterBased),oilBased:asBool(row.oilBased),coverageSqftPerLiterOneCoat:Number(row.coverageSqftPerLiterOneCoat||100),coverageSqftPerLiterTwoCoat:Number(row.coverageSqftPerLiterTwoCoat||50),recommendedCoats:Number(row.recommendedCoats||2),dryingTime:String(row.dryingTime||"2-4 hours"),recoatTime:String(row.recoatTime||"4-6 hours"),applicationToolsJson:String(row.applicationTools||"Roller").split(","),packSizesJson:String(row.packSizes||"1,4,16").split(",").map(Number),featuresJson:String(row.features||"Durable").split(","),benefitsJson:String(row.benefits||"Reliable finish").split(","),recommendedSystemJson:[],availableShadeIdsJson:[],warrantyYears:row.warrantyYears?Number(row.warrantyYears):null,priceMode:String(row.priceMode||"quote") as "hidden"|"quote"|"show"|"ecommerce",startingPrice:row.startingPrice?Number(row.startingPrice):null,currency:String(row.currency||"PKR"),tdsUrl:String(row.tdsUrl||""),sdsUrl:String(row.sdsUrl||""),brochureUrl:String(row.brochureUrl||""),applicationGuideUrl:String(row.applicationGuideUrl||""),isFeatured:asBool(row.isFeatured),isNew:asBool(row.isNew),isBestSeller:asBool(row.isBestSeller),seoTitle:String(row.seoTitle||""),seoDescription:String(row.seoDescription||"")};
      if(input.updateDuplicates)await db.product.upsert({where:{clientId_slug:{clientId:input.clientId,slug:data.slug}},update:data,create:{clientId:input.clientId,...data}});else await db.product.create({data:{clientId:input.clientId,...data}});
    }else{
      const valid=z.object({name:z.string().min(1),city:z.string().min(1),address:z.string().min(1)}).parse(row);const slug=slugify(String(row.slug||valid.name));const data={name:valid.name,slug,city:valid.city,state:String(row.state||""),area:String(row.area||""),zipCode:String(row.zipCode||""),address:valid.address,phone:String(row.phone||""),whatsapp:String(row.whatsapp||row.phone||""),email:String(row.email||""),latitude:row.latitude?Number(row.latitude):null,longitude:row.longitude?Number(row.longitude):null,availableProductCategoryIdsJson:String(row.availableCategorySlugs||"").split(",").filter(Boolean),openingHours:String(row.openingHours||"Mon-Sat 9:00 AM-7:00 PM"),managerName:String(row.managerName||""),isFeatured:asBool(row.isFeatured),isActive:row.isActive===undefined?true:asBool(row.isActive)};
      if(input.updateDuplicates)await db.dealer.upsert({where:{clientId_slug:{clientId:input.clientId,slug}},update:data,create:{clientId:input.clientId,...data}});else await db.dealer.create({data:{clientId:input.clientId,...data}});
    }imported++;
  }catch(error){errors.push({rowNumber:index+2,field:"row",message:error instanceof Error?error.message:"Invalid row",rawJson:row});if(!input.skipInvalid)continue}
  if(errors.length)await db.importRowError.createMany({data:errors.map(e=>({...e,importJobId:job.id}))});await db.importJob.update({where:{id:job.id},data:{status:errors.length&&imported===0?"failed":"completed",importedRows:imported,failedRows:errors.length,errorJson:errors}});revalidatePath(clientPath(input.clientId,"imports"));return{imported,failed:errors.length,errors};
}
