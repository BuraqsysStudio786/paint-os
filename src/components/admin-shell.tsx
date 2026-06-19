"use client";

import Link from "next/link";
import { BarChart3, Building2, FileText, Import, Layers3, LogOut, Menu, Package, Palette, Settings, Users, X } from "lucide-react";
import { useState } from "react";
import { logoutAction } from "@/app/actions";

const links=[["Overview","",BarChart3],["Clients","clients",Building2],["Catalogue","clients",Package],["Colours","clients",Palette],["Imports","clients",Import],["Dealers","clients",Building2],["Leads","clients",Users],["Documents","clients",FileText],["Content","clients",Layers3],["Settings","settings",Settings]];

export function AdminShell({children}:{children:React.ReactNode}) {
  const [open,setOpen]=useState(false);
      return <div className="min-h-screen bg-[#f2f2ed] text-[#1d2521]"><aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#142e25] p-4 text-white transition-transform lg:translate-x-0 ${open?"translate-x-0":"-translate-x-full"}`}><div className="flex items-center justify-between px-2 py-4"><Link href="/admin"><strong>PAINT WEBSITE <span className="text-[#F4C95D]">OS</span></strong></Link><button className="lg:hidden" onClick={()=>setOpen(false)}><X/></button></div><div className="mt-6 rounded-xl border border-white/10 p-4"><span className="text-xs text-white/45">Agency workspace</span><strong className="mt-1 block">Paint OS Studio</strong></div><nav className="mt-6 grid gap-1">{links.map(([label,href,Icon])=><Link onClick={()=>setOpen(false)} href={`/admin/${href}`} key={label as string} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold text-white/65 hover:bg-white/8 hover:text-white"><Icon size={17}/>{label as string}</Link>)}</nav><div className="absolute bottom-5 left-4 right-4 grid gap-2"><Link className="flex items-center justify-center gap-2 rounded-full bg-[#F4C95D] px-4 py-3 text-sm font-black text-[#142e25]" href="/site/aurora-paints" target="_blank">Preview Aurora ↗</Link><form action={logoutAction}><button className="flex w-full items-center justify-center gap-2 py-2 text-xs font-bold text-white/50 hover:text-white"><LogOut size={14}/>Log out</button></form></div></aside><div className="lg:pl-64"><header className="sticky top-0 z-30 flex h-18 items-center justify-between border-b border-black/5 bg-[#f2f2ed]/85 px-5 backdrop-blur-xl"><button onClick={()=>setOpen(true)} className="lg:hidden"><Menu/></button><div><span className="text-xs text-black/40">Database connected</span><strong className="block text-sm">Paint Website OS</strong></div><div className="flex items-center gap-3"><span className="hidden rounded-full bg-[#1E4D3A]/8 px-3 py-1 text-xs font-bold text-[#1E4D3A] sm:block">Production MVP</span><span className="grid size-9 place-items-center rounded-full bg-[#1E4D3A] text-sm font-bold text-white">BK</span></div></header><main className="p-5 md:p-8">{children}</main></div></div>
}

export function AdminHeader({eyebrow,title,copy,action}:{eyebrow:string;title:string;copy?:string;action?:React.ReactNode}) {
  return <div className="mb-8 flex items-end justify-between gap-4"><div><span className="text-xs font-black uppercase tracking-[.18em] text-[#D94F30]">{eyebrow}</span><h1 className="mt-2 text-3xl font-black tracking-[-.04em] md:text-5xl">{title}</h1>{copy&&<p className="mt-2 max-w-2xl text-sm text-black/45">{copy}</p>}</div>{action}</div>
}

export function AdminCard({children,className=""}:{children:React.ReactNode;className?:string}) {return <section className={`rounded-[1.5rem] border border-black/6 bg-white p-5 shadow-sm ${className}`}>{children}</section>}
