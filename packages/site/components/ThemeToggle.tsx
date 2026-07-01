"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()

  // Both icons render; CSS (the `dark:` variant) decides which is visible based
  // on the html class next-themes sets. This avoids a hydration mismatch
  // without needing a mounted guard, since the markup is theme-independent.
  // resolvedTheme resolves "system" to the concrete light/dark it maps to, so
  // toggling from a system default flips to the opposite of what's on screen.
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      title="Toggle theme (D)"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="text-muted-foreground hover:text-foreground"
    >
      <Sun className="h-4 w-4 hidden dark:block" />
      <Moon className="h-4 w-4 block dark:hidden" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
