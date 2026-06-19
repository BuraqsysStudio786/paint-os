import { z } from "zod";
import { db } from "../db";
import { diagnoseProblem } from "../utils";

const recommendation=z.object({productId:z.string(),reason:z.string(),system:z.array(z.string()),shadeIds:z.array(z.string())});
export async function runProductFinder(clientId:string,input:Record<string,string>){
  const products=await db.product.findMany({where:{clientId}});const shades=await db.shade.findMany({where:{clientId,isTrending:true},take:3});const text=Object.values(input).join(" ").toLowerCase();const product=products.find(p=>text.includes("damp")?p.name.includes("Damp"):text.includes("exterior")?p.interiorExterior==="exterior":text.includes("wood")?p.name.includes("Wood"):text.includes("metal")?p.name.includes("Metal"):p.isBestSeller)||products[0];
  const output=recommendation.parse({productId:product.id,reason:`Recommended for ${input.surface||"your surface"} and ${input.finish||"your preferred finish"}.`,system:product.recommendedSystemJson,shadeIds:shades.map(s=>s.id)});await db.aISession.create({data:{clientId,type:"product_finder",inputJson:input,outputJson:output}});return output;
}
export async function runProblemSolver(clientId:string,input:{problem:string;exterior:boolean}){const output=diagnoseProblem(input.problem,input.exterior);await db.aISession.create({data:{clientId,type:"problem_solver",inputJson:input,outputJson:output}});return output}
export async function generateContent(type:string,context:Record<string,string>){return `${context.name||"Aurora"} brings a considered balance of performance and colour to every ${type}.`}
