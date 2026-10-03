import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"Recoord — Turn ideas into work you can return to",description:"An open-source workspace for projects, conversations, and editable documents.",icons:{icon:"/favicon.svg"}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
