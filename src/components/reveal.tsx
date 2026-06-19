"use client";
import { motion } from "framer-motion";
export function Reveal({children,className="",delay=0,style}:{children?:React.ReactNode;className?:string;delay?:number;style?:React.CSSProperties}){return <motion.div style={style} className={className} initial={{opacity:0,y:28}} whileInView={{opacity:1,y:0}} viewport={{once:true,margin:"-80px"}} transition={{duration:.65,delay,ease:[.2,.8,.2,1]}}>{children}</motion.div>}
