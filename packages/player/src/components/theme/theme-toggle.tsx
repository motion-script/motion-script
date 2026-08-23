import { useTheme } from "@/providers/theme-provider";
import { Moon, Sun } from "lucide-react";


export function ThemeToggle() {
    const { theme, setTheme } = useTheme();
    const isDark = theme === 'dark';

    return (
        <button
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Toggle theme"
        >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
    );
}
