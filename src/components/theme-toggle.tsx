"use client";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const stored = localStorage.getItem("theme");
    
    if (stored === "dark" || (!stored && prefersDark)) {
      setIsDark(true);
      document.documentElement.style.colorScheme = "dark";
    } else {
      setIsDark(false);
      document.documentElement.style.colorScheme = "light";
    }
  }, []);

  const toggleTheme = () => {
    const newIsDark = !isDark;
    setIsDark(newIsDark);
    localStorage.setItem("theme", newIsDark ? "dark" : "light");
    document.documentElement.style.colorScheme = newIsDark ? "dark" : "light";
    
    if (newIsDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  if (!mounted) return null;

  return (
    <button
      onClick={toggleTheme}
      aria-label="Toggle theme"
      className="rounded-full p-2 hover:bg-alabaster-grey-100 dark:hover:bg-ink-black-800 transition-colors"
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? (
        <svg className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 2a1 1 0 011 1v2a1 1 0 11-2 0V3a1 1 0 011-1zM4.22 4.22a1 1 0 011.415 0l1.414 1.414a1 1 0 01-1.415 1.415L4.22 5.636a1 1 0 010-1.414zm11.314 0a1 1 0 010 1.414l-1.414 1.414a1 1 0 01-1.415-1.415l1.414-1.414a1 1 0 011.415 0zM10 18a1 1 0 01-1-1v-2a1 1 0 112 0v2a1 1 0 01-1 1zm6.14-2.07a1 1 0 011.415 0l1.414 1.415a1 1 0 01-1.414 1.414l-1.415-1.414a1 1 0 010-1.415zm-11.313 0a1 1 0 010 1.415L2.293 17.07a1 1 0 01-1.414-1.414l1.414-1.415a1 1 0 011.414 0zM18 10a1 1 0 011 1v2a1 1 0 11-2 0v-2a1 1 0 011-1zM2 10a1 1 0 011 1v2a1 1 0 11-2 0v-2a1 1 0 011-1z" />
        </svg>
      ) : (
        <svg className="h-5 w-5 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
          <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
        </svg>
      )}
    </button>
  );
}
