import type { Metadata } from "next";
import { Manrope, Playfair_Display } from "next/font/google";
import "./globals.css";
const manrope=Manrope({variable:"--font-manrope",subsets:["latin"]});const playfair=Playfair_Display({variable:"--font-playfair",subsets:["latin"]});
export const metadata:Metadata={title:{default:"Paint Website OS",template:"%s | Paint Website OS"},description:"Database-powered multi-tenant paint website platform"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body className={`${manrope.variable} ${playfair.variable}`}>{children}</body></html>}
