import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { redirect } from "next/navigation";
import { db } from "./db";

const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET || "development-only-change-me");
export async function createSession(user: {id:string;email:string;role:string}) {
  const token = await new SignJWT(user).setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("7d").sign(secret);
  (await cookies()).set("paintos_session",token,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:60*60*24*7});
}
export async function clearSession(){(await cookies()).delete("paintos_session")}
export async function getSession(){
  const token=(await cookies()).get("paintos_session")?.value;if(!token)return null;
  try{return (await jwtVerify(token,secret)).payload as {id:string;email:string;role:string}}catch{return null}
}
export async function requireAdmin(){const session=await getSession();if(!session)redirect("/admin/login");return session}
export async function currentUser(){const session=await getSession();return session?db.user.findUnique({where:{id:session.id}}):null}
