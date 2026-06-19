"use client";

import { useMemo, useState } from "react";
import { Check, Download, FileSpreadsheet, Loader2, MapPin, Plus, Trash2, UploadCloud } from "lucide-react";
import { useDropzone } from "react-dropzone";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { importRowsAction, upsertDealerAction, upsertProductAction, upsertRoomAction, upsertShadeAction, upsertVisualizerSpaceAction } from "@/app/actions";
import { AdminVisualizerMaskEditor } from "./admin-visualizer-mask-editor";

type Option={id:string;name:string;slug?:string;code?:string};
type ProductSeed=Record<string, unknown> & {id?:string; productFeatures?: Record<string, unknown>[]; applicationSteps?: Record<string, unknown>[]};
const field="mt-2 w-full rounded-lg border border-black/10 bg-white px-3 py-3 text-sm outline-none focus:border-[#183E32]";
const label="grid text-[11px] font-black uppercase tracking-[.12em] text-black/45";
const spaces=["Living room","Bedroom","Kids room","Kitchen","Exterior","Office","Feature wall","Commercial"];
const families=["Whites","Neutrals","Grey","Blue","Green","Yellow","Orange","Red","Pink","Purple","Brown"];

function TextField({name,label:labelText,defaultValue="",type="text",required=false}:{name:string;label:string;defaultValue?:unknown;type?:string;required?:boolean}) {
  return <label className={label}>{labelText}<input className={field} name={name} type={type} required={required} defaultValue={String(defaultValue ?? "")}/></label>;
}
function AreaField({name,label:labelText,defaultValue=""}:{name:string;label:string;defaultValue?:unknown}) {
  return <label className={`${label} md:col-span-2`}>{labelText}<textarea className={`${field} min-h-28`} name={name} defaultValue={String(defaultValue ?? "")}/></label>;
}
function CheckField({name,label:labelText,defaultChecked=false}:{name:string;label:string;defaultChecked?:boolean}) {
  return <label className="flex items-center gap-3 rounded-lg border border-black/10 bg-white p-3 text-sm font-bold"><input name={name} type="checkbox" defaultChecked={defaultChecked} className="size-4 accent-[#183E32]"/>{labelText}</label>;
}
function SelectField({name,label:labelText,defaultValue="",children}:{name:string;label:string;defaultValue?:unknown;children:React.ReactNode}) {
  return <label className={label}>{labelText}<select className={field} name={name} defaultValue={String(defaultValue ?? "")}>{children}</select></label>;
}
function listValue(value: unknown) { return Array.isArray(value) ? value.join(", ") : ""; }

export function ProductEditor({clientId,categories,shades,product}:{clientId:string;categories:Option[];shades:Option[];product?:ProductSeed|null}) {
  const [features,setFeatures]=useState<Record<string,unknown>[]>(product?.productFeatures || [{title:"Built to last",description:"Durable performance for real homes.",iconKey:"ShieldCheck",order:1}]);
  const [steps,setSteps]=useState<Record<string,unknown>[]>(product?.applicationSteps || [{stepNumber:1,title:"Prepare",productName:"Surface preparation",coats:1,tool:"Scraper",description:"Clean and level the surface.",iconKey:"Wrench",order:1}]);
  const img=String(product?.bucketImageUrl||product?.imageUrl||"/placeholders/paint-bucket-aurora.svg");
  return <form action={upsertProductAction} className="admin-surface grid gap-5 md:grid-cols-2">
    <input type="hidden" name="clientId" value={clientId}/>{product?.id&&<input type="hidden" name="id" value={product.id}/>}
    <div className="md:col-span-2 grid gap-5 lg:grid-cols-[260px_1fr]">
      <div className="rounded-xl border border-black/10 bg-[#F7F3EA] p-5"><img src={img} alt="" className="mx-auto h-72 object-contain"/><p className="mt-4 text-xs text-black/45">Use bucket image URLs for product cards. Room photography belongs in hero/gallery only.</p></div>
      <div className="grid gap-5 md:grid-cols-2">
        <SelectField name="categoryId" label="Category" defaultValue={product?.categoryId}>{categories.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</SelectField>
        <TextField name="name" label="Product name" defaultValue={product?.name} required/>
        <TextField name="slug" label="Slug" defaultValue={product?.slug} required/>
        <TextField name="sku" label="SKU" defaultValue={product?.sku}/>
        <TextField name="subtitle" label="Subtitle" defaultValue={product?.subtitle}/>
        <TextField name="shortDescription" label="Short description" defaultValue={product?.shortDescription}/>
      </div>
    </div>
    <AreaField name="longDescription" label="Long description" defaultValue={product?.longDescription}/>
    <TextField name="bucketImageUrl" label="Bucket/product image URL" defaultValue={product?.bucketImageUrl || "/placeholders/paint-bucket-aurora.svg"}/>
    <TextField name="heroImageUrl" label="Hero room/lifestyle image URL" defaultValue={product?.heroImageUrl}/>
    <AreaField name="galleryImages" label="Gallery image URLs, comma separated" defaultValue={listValue(product?.galleryJson)}/>
    <TextField name="finish" label="Finish" defaultValue={product?.finish || "Matt"}/><TextField name="sheenLevel" label="Sheen level" defaultValue={product?.sheenLevel || "Matt"}/>
    <TextField name="surface" label="Surface" defaultValue={product?.surface || "Interior walls"}/><TextField name="productType" label="Product type" defaultValue={product?.productType || "Emulsion"}/>
    <SelectField name="interiorExterior" label="Interior / exterior" defaultValue={product?.interiorExterior || "interior"}><option>interior</option><option>exterior</option><option>both</option></SelectField>
    <TextField name="spaces" label="Spaces" defaultValue={listValue(product?.spacesJson) || spaces.slice(0,2).join(", ")}/><TextField name="colorFamilies" label="Color families" defaultValue={listValue(product?.colorFamiliesJson) || families.slice(0,4).join(", ")}/>
    <TextField name="coverageSqftPerLiterOneCoat" type="number" label="Coverage one coat" defaultValue={product?.coverageSqftPerLiterOneCoat || 110}/><TextField name="coverageSqftPerLiterTwoCoat" type="number" label="Coverage two coats" defaultValue={product?.coverageSqftPerLiterTwoCoat || 55}/>
    <TextField name="recommendedCoats" type="number" label="Recommended coats" defaultValue={product?.recommendedCoats || 2}/><TextField name="packSizes" label="Pack sizes" defaultValue={listValue(product?.packSizesJson) || "1,4,10,16"}/>
    <TextField name="dryingTime" label="Drying time" defaultValue={product?.dryingTime || "2-4 hours"}/><TextField name="recoatTime" label="Recoat time" defaultValue={product?.recoatTime || "4-6 hours"}/>
    <TextField name="applicationTools" label="Application tools" defaultValue={listValue(product?.applicationToolsJson) || "Brush,Roller,Airless spray"}/><TextField name="warrantyYears" type="number" label="Warranty years" defaultValue={product?.warrantyYears}/>
    <SelectField name="priceMode" label="Price mode" defaultValue={product?.priceMode || "quote"}><option value="hidden">Hidden</option><option value="quote">Quote</option><option value="show">Show</option><option value="ecommerce">Ecommerce</option></SelectField>
    <TextField name="startingPrice" type="number" label="Starting price" defaultValue={product?.startingPrice}/><TextField name="currency" label="Currency" defaultValue={product?.currency || "PKR"}/>
    <TextField name="tdsUrl" label="TDS URL" defaultValue={product?.tdsUrl}/><TextField name="sdsUrl" label="SDS URL" defaultValue={product?.sdsUrl}/>
    <TextField name="brochureUrl" label="Brochure URL" defaultValue={product?.brochureUrl}/><TextField name="applicationGuideUrl" label="Application guide URL" defaultValue={product?.applicationGuideUrl}/>
    <AreaField name="benefits" label="Benefits, one per line or comma separated" defaultValue={listValue(product?.benefitsJson)}/>
    <AreaField name="recommendedSystem" label="Recommended system, one per line" defaultValue={listValue(product?.recommendedSystemJson)}/>
    <label className={`${label} md:col-span-2`}>Available shade IDs<select className={field} name="availableShadeIds" multiple defaultValue={Array.isArray(product?.availableShadeIdsJson)?product?.availableShadeIdsJson as string[]:[]} size={Math.min(8, Math.max(3, shades.length))}>{shades.map(s=><option value={s.id} key={s.id}>{s.name} {s.code && `· ${s.code}`}</option>)}</select></label>
    <div className="md:col-span-2 grid gap-3 md:grid-cols-4"><CheckField name="waterBased" label="Water based" defaultChecked={product?.waterBased !== false}/><CheckField name="oilBased" label="Oil based" defaultChecked={product?.oilBased === true}/><CheckField name="isFeatured" label="Featured" defaultChecked={product?.isFeatured === true}/><CheckField name="isNew" label="New" defaultChecked={product?.isNew === true}/><CheckField name="isBestSeller" label="Best seller" defaultChecked={product?.isBestSeller === true}/></div>
    <TextField name="seoTitle" label="SEO title" defaultValue={product?.seoTitle}/><TextField name="seoDescription" label="SEO description" defaultValue={product?.seoDescription}/>
    <DynamicRows title="Feature icons" rows={features} setRows={setFeatures} keys={["title","description","iconKey","order"]}/>
    <DynamicRows title="Application steps" rows={steps} setRows={setSteps} keys={["stepNumber","title","productName","coats","tool","description","iconKey","order"]}/>
    <input type="hidden" name="featureRows" value={JSON.stringify(features)}/><input type="hidden" name="stepRows" value={JSON.stringify(steps)}/>
    <button className="admin-btn md:col-span-2"><Check size={16}/>Save product</button>
  </form>;
}

function DynamicRows({title,rows,setRows,keys}:{title:string;rows:Record<string,unknown>[];setRows:(rows:Record<string,unknown>[])=>void;keys:string[]}) {
  return <section className="md:col-span-2 rounded-xl border border-black/10 bg-white p-5"><div className="flex items-center justify-between"><h3 className="text-lg font-black">{title}</h3><button type="button" onClick={()=>setRows([...rows,{}])} className="admin-btn-light"><Plus size={14}/>Add</button></div><div className="mt-4 grid gap-4">{rows.map((row,i)=><div key={i} className="grid gap-3 rounded-lg bg-black/[.03] p-3 md:grid-cols-4">{keys.map(k=><label className="text-[10px] font-black uppercase tracking-widest text-black/35" key={k}>{k}<input className={field} value={String(row[k]??"")} onChange={e=>setRows(rows.map((r,j)=>j===i?{...r,[k]:e.target.value}:r))}/></label>)}<button type="button" onClick={()=>setRows(rows.filter((_,j)=>j!==i))} className="text-left text-xs font-bold text-red-700"><Trash2 size={14}/> Remove</button></div>)}</div></section>
}

export function ShadeEditor({clientId,products,shades,shade}:{clientId:string;products:Option[];shades:Option[];shade?:Record<string,unknown>|null}) {
  const hex=String(shade?.hex||"#F4E8D2");
  const contrast=parseInt(hex.replace("#",""),16)>0xb0b0b0?"#17221D":"#fff";
  return <form action={upsertShadeAction} className="admin-surface grid gap-5 md:grid-cols-2">
    <input type="hidden" name="clientId" value={clientId}/>{Boolean(shade?.id)&&<input type="hidden" name="id" value={String(shade?.id)}/>}
    <div className="md:col-span-2 min-h-56 rounded-xl p-8" style={{background:hex,color:contrast}}><span className="text-xs font-black uppercase tracking-widest">Live color preview</span><h2 className="mt-12 font-serif text-5xl">{String(shade?.name||"New shade")}</h2><p className="mt-2 text-sm opacity-70">Contrast preview: text remains readable against this shade.</p></div>
    <TextField name="name" label="Shade name" defaultValue={shade?.name} required/><TextField name="code" label="Code" defaultValue={shade?.code} required/>
    <TextField name="slug" label="Slug" defaultValue={shade?.slug}/><TextField name="hex" label="Hex" type="color" defaultValue={hex}/>
    <SelectField name="colorFamily" label="Color family" defaultValue={shade?.colorFamily}>{families.map(f=><option key={f}>{f}</option>)}</SelectField>
    <SelectField name="temperature" label="Temperature" defaultValue={shade?.temperature || "neutral"}><option>warm</option><option>cool</option><option>neutral</option></SelectField>
    <TextField name="mood" label="Mood" defaultValue={shade?.mood || "calm"}/><SelectField name="lightness" label="Lightness" defaultValue={shade?.lightness || "medium"}><option>light</option><option>medium</option><option>dark</option></SelectField>
    <TextField name="season" label="Season" defaultValue={shade?.season || "All season"}/><TextField name="collection" label="Collection" defaultValue={shade?.collection || "Core"}/>
    <TextField name="spaces" label="Spaces" defaultValue={listValue(shade?.spacesJson)}/><TextField name="bestRooms" label="Best rooms" defaultValue={listValue(shade?.bestRoomsJson)}/>
    <TextField name="finishAvailability" label="Finish availability" defaultValue={listValue(shade?.finishAvailabilityJson) || "Matt,Silk"}/>
    <label className={label}>Products<select className={field} name="productIds" multiple defaultValue={Array.isArray(shade?.productIdsJson)?shade?.productIdsJson as string[]:[]} size={5}>{products.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
    <label className={label}>Matching shades<select className={field} name="matchingShadeIds" multiple defaultValue={Array.isArray(shade?.matchingShadeIdsJson)?shade?.matchingShadeIdsJson as string[]:[]} size={5}>{shades.filter(s=>s.id!==shade?.id).map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
    <AreaField name="description" label="Description" defaultValue={shade?.description}/>
    <div className="md:col-span-2 grid gap-3 md:grid-cols-3"><CheckField name="isTrending" label="Trending" defaultChecked={shade?.isTrending===true}/><CheckField name="isColorOfYear" label="Color of year" defaultChecked={shade?.isColorOfYear===true}/><CheckField name="isActive" label="Active" defaultChecked={shade?.isActive!==false}/></div>
    <button className="admin-btn md:col-span-2"><Check size={16}/>Save shade</button>
  </form>;
}

export function DealerEditor({clientId,categories,dealer}:{clientId:string;categories:Option[];dealer?:Record<string,unknown>|null}) {
  const [busy,setBusy]=useState(false);
  async function geocode() {
    setBusy(true);
    const address=(document.querySelector("[name='address']") as HTMLInputElement)?.value;
    const city=(document.querySelector("[name='city']") as HTMLInputElement)?.value;
    try{
      const res=await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(`${address}, ${city}`)}`);
      const data=await res.json();
      if(data?.[0]){(document.querySelector("[name='latitude']") as HTMLInputElement).value=data[0].lat;(document.querySelector("[name='longitude']") as HTMLInputElement).value=data[0].lon;}
    } finally { setBusy(false); }
  }
  return <form action={upsertDealerAction} className="admin-surface grid gap-5 md:grid-cols-2"><input type="hidden" name="clientId" value={clientId}/>{Boolean(dealer?.id)&&<input type="hidden" name="id" value={String(dealer?.id)}/>}
    <TextField name="name" label="Dealer name" defaultValue={dealer?.name} required/><TextField name="slug" label="Slug" defaultValue={dealer?.slug}/>
    <TextField name="city" label="City" defaultValue={dealer?.city} required/><TextField name="state" label="State/province" defaultValue={dealer?.state}/>
    <TextField name="area" label="Area" defaultValue={dealer?.area}/><TextField name="zipCode" label="Zip/postal code" defaultValue={dealer?.zipCode}/>
    <AreaField name="address" label="Address" defaultValue={dealer?.address}/>
    <TextField name="phone" label="Phone" defaultValue={dealer?.phone}/><TextField name="whatsapp" label="WhatsApp" defaultValue={dealer?.whatsapp}/>
    <TextField name="email" label="Email" defaultValue={dealer?.email}/><TextField name="managerName" label="Manager name" defaultValue={dealer?.managerName}/>
    <TextField name="latitude" label="Latitude" defaultValue={dealer?.latitude}/><TextField name="longitude" label="Longitude" defaultValue={dealer?.longitude}/>
    <button type="button" onClick={geocode} className="admin-btn-light md:col-span-2"><MapPin size={15}/>{busy?"Finding coordinates...":"Get coordinates from address"}</button>
    <TextField name="openingHours" label="Opening hours" defaultValue={dealer?.openingHours || "Mon-Sat 9:00 AM-7:00 PM"}/>
    <label className={label}>Available categories<select className={field} name="availableCategoryIds" multiple defaultValue={Array.isArray(dealer?.availableProductCategoryIdsJson)?dealer?.availableProductCategoryIdsJson as string[]:[]} size={5}>{categories.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
    <div className="md:col-span-2 grid gap-3 md:grid-cols-2"><CheckField name="isFeatured" label="Featured" defaultChecked={dealer?.isFeatured===true}/><CheckField name="isActive" label="Active" defaultChecked={dealer?.isActive!==false}/></div>
    <button className="admin-btn md:col-span-2"><Check size={16}/>Save dealer</button>
  </form>;
}

export function RoomEditor({clientId,products,shades,room}:{clientId:string;products:Option[];shades:Option[];room?:Record<string,unknown>|null}) {
  return <form action={upsertRoomAction} className="admin-surface grid gap-5 md:grid-cols-2"><input type="hidden" name="clientId" value={clientId}/>{Boolean(room?.id)&&<input type="hidden" name="id" value={String(room?.id)}/>}
    <TextField name="name" label="Room name" defaultValue={room?.name} required/><TextField name="slug" label="Slug" defaultValue={room?.slug}/>
    <TextField name="roomType" label="Room type" defaultValue={room?.roomType}/><SelectField name="space" label="Space" defaultValue={room?.space || room?.roomType}>{spaces.map(s=><option key={s}>{s}</option>)}</SelectField>
    <TextField name="imageUrl" label="Image URL" defaultValue={room?.imageUrl}/><SelectField name="dominantColorFamily" label="Dominant color family" defaultValue={room?.dominantColorFamily}>{families.map(f=><option key={f}>{f}</option>)}</SelectField>
    <AreaField name="description" label="Description" defaultValue={room?.description}/><AreaField name="designTips" label="Design tips" defaultValue={room?.designTips}/>
    <label className={label}>Recommended shades<select className={field} name="recommendedShadeIds" multiple defaultValue={Array.isArray(room?.recommendedShadeIdsJson)?room?.recommendedShadeIdsJson as string[]:[]} size={5}>{shades.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
    <label className={label}>Recommended products<select className={field} name="recommendedProductIds" multiple defaultValue={Array.isArray(room?.recommendedProductIdsJson)?room?.recommendedProductIdsJson as string[]:[]} size={5}>{products.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
    <TextField name="order" label="Order" type="number" defaultValue={room?.order || 0}/><CheckField name="isActive" label="Active" defaultChecked={room?.isActive!==false}/>
    <button className="admin-btn md:col-span-2"><Check size={16}/>Save room</button>
  </form>;
}

export function VisualizerSpaceEditor({clientId,clientSlug,shades,space}:{clientId:string;clientSlug:string;shades:Option[];space?:Record<string,unknown>|null}) {
  return <form action={upsertVisualizerSpaceAction} className="admin-surface grid gap-5 md:grid-cols-2"><input type="hidden" name="clientId" value={clientId}/>{Boolean(space?.id)&&<input type="hidden" name="id" value={String(space?.id)}/>}
    <TextField name="name" label="Space name" defaultValue={space?.name} required/><TextField name="slug" label="Slug" defaultValue={space?.slug}/>
    <TextField name="roomType" label="Room type" defaultValue={space?.roomType}/><SelectField name="space" label="Space" defaultValue={space?.space || space?.roomType}>{spaces.map(s=><option key={s}>{s}</option>)}</SelectField>
    <TextField name="thumbnailUrl" label="Thumbnail URL" defaultValue={space?.thumbnailUrl}/>
    <SelectField name="defaultShadeId" label="Default shade" defaultValue={space?.defaultShadeId}>{<option value="">None</option>}{shades.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</SelectField>
    <AdminVisualizerMaskEditor clientSlug={clientSlug} initialImageUrl={String(space?.imageUrl || "")} initialMaskJson={space?.maskJson || {imageWidth:1600,imageHeight:1000,masks:[]}} shades={shades}/>
    <div className="md:col-span-2 grid gap-3 md:grid-cols-2"><CheckField name="isFeatured" label="Featured" defaultChecked={space?.isFeatured===true}/><CheckField name="isActive" label="Active" defaultChecked={space?.isActive!==false}/></div>
    <button className="admin-btn md:col-span-2"><Check size={16}/>Save visualizer space</button>
  </form>;
}

export function ImportStudio({clientId}:{clientId:string}) {
  const [type,setType]=useState<"products"|"shades"|"dealers">("products");const [rows,setRows]=useState<Record<string,unknown>[]>([]);const [fileName,setFileName]=useState("");const [result,setResult]=useState<{imported:number;failed:number;errors?:{rowNumber:number;field:string;message:string;rawJson:object}[]}|null>(null);const [busy,setBusy]=useState(false);const [update,setUpdate]=useState(true);const [skip,setSkip]=useState(true);
  const headers=useMemo(()=>type==="products"?["category","name","slug","sku","subtitle","shortDescription","longDescription","finish","sheenLevel","surface","productType","interiorExterior","spaces","colorFamilies","waterBased","oilBased","coverageSqftPerLiterOneCoat","coverageSqftPerLiterTwoCoat","recommendedCoats","dryingTime","recoatTime","applicationTools","packSizes","features","benefits","warrantyYears","priceMode","startingPrice","currency","tdsUrl","sdsUrl","brochureUrl","applicationGuideUrl","isFeatured","isNew","isBestSeller","seoTitle","seoDescription"]:type==="shades"?["name","code","hex","colorFamily","temperature","mood","lightness","season","spaces","bestRooms","collection","description","isTrending","isColorOfYear","productSlugsOrSkus","matchingShadeCodes","isActive"]:["name","slug","city","state","area","zipCode","address","phone","whatsapp","email","latitude","longitude","openingHours","managerName","availableCategorySlugs","isFeatured","isActive"],[type]);
  const onDrop=async(files:File[])=>{const file=files[0];if(!file)return;setFileName(file.name);setResult(null);if(file.name.endsWith(".csv"))Papa.parse<Record<string,unknown>>(file,{header:true,skipEmptyLines:true,complete:r=>setRows(r.data)});else{const data=await file.arrayBuffer();const book=XLSX.read(data);setRows(XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]]))}};
  const {getRootProps,getInputProps,isDragActive}=useDropzone({onDrop,accept:{"text/csv":[".csv"],"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":[".xlsx"]},multiple:false});
  const run=async()=>{setBusy(true);setResult(await importRowsAction({clientId,type,fileName,rows,updateDuplicates:update,skipInvalid:skip}));setBusy(false)};
  const template=()=>{const blob=new Blob([headers.join(",")+"\n"],{type:"text/csv"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`${type}-template.csv`;a.click()};
  const errorCsv=()=>{if(!result?.errors?.length)return;const csv=Papa.unparse(result.errors.map(e=>({row:e.rowNumber,field:e.field,message:e.message,raw:JSON.stringify(e.rawJson)})));const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download=`${type}-errors.csv`;a.click()};
  return <div className="grid gap-6 lg:grid-cols-[.7fr_1.3fr]"><aside className="admin-surface"><h2 className="text-xl font-black">Import workflow</h2><div className="mt-6 grid gap-2">{(["products","shades","dealers"] as const).map(x=><button type="button" onClick={()=>{setType(x);setRows([]);setResult(null)}} key={x} className={`rounded-lg px-4 py-3 text-left text-sm font-bold capitalize ${type===x?"bg-[#183E32] text-white":"bg-black/4"}`}>{x}</button>)}</div><button type="button" onClick={template} className="admin-btn-light mt-5 w-full"><Download size={15}/>Download template</button><div className="mt-6 grid gap-3 border-t border-black/8 pt-5"><label className="flex items-center gap-3 text-sm font-bold"><input type="checkbox" checked={update} onChange={e=>setUpdate(e.target.checked)} className="size-4 accent-[#183E32]"/>Update duplicates</label><label className="flex items-center gap-3 text-sm font-bold"><input type="checkbox" checked={skip} onChange={e=>setSkip(e.target.checked)} className="size-4 accent-[#183E32]"/>Skip invalid rows</label></div></aside><section className="admin-surface"><div {...getRootProps()} className={`grid min-h-52 place-items-center rounded-xl border border-dashed p-8 text-center ${isDragActive?"border-[#183E32] bg-[#183E32]/5":"border-black/20"}`}><input {...getInputProps()}/><div><UploadCloud className="mx-auto text-[#A55337]" size={34}/><h3 className="mt-4 font-black">Drop an Excel or CSV file</h3><p className="mt-2 text-sm text-black/40">Preview, validate, persist job history, and save row-level errors.</p></div></div>{rows.length>0&&<><div className="mt-6 flex items-center justify-between gap-4"><div><span className="text-xs text-black/40">{fileName}</span><h3 className="font-black">{rows.length} rows ready</h3></div><button disabled={busy} onClick={run} className="admin-btn">{busy?<Loader2 className="animate-spin" size={16}/>:<FileSpreadsheet size={16}/>}Import rows</button></div><div className="mt-4 max-h-96 overflow-auto"><table className="admin-table"><thead><tr>{Object.keys(rows[0]).slice(0,8).map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.slice(0,30).map((row,i)=><tr key={i}>{Object.values(row).slice(0,8).map((v,j)=><td key={j}>{String(v??"")}</td>)}</tr>)}</tbody></table></div></>}{result&&<div className="mt-5 rounded-lg bg-[#183E32] p-4 text-sm font-bold text-white">{result.imported} imported · {result.failed} failed. {result.failed>0&&<button onClick={errorCsv} className="ml-3 underline">Download error CSV</button>}</div>}</section></div>;
}
