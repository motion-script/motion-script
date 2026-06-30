import { Geist_Mono, DM_Sans, Young_Serif, Pixelify_Sans } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@/lib/utils";

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-sans' })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

const youngSerif = Young_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-serif",
})

const pixelifySans = Pixelify_Sans({
  subsets: ["latin"],
  variable: "--font-code",
})

export const metadata = {
  title: "MotionScript — Open Source Motion Design Tool",
  description: "Create stunning motion graphics with code. An open-source After Effects alternative powered by the web.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", fontMono.variable, "font-sans", dmSans.variable, youngSerif.variable, pixelifySans.variable)}
    >
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
