"use client";

export function ThemeToggle({ initial }: { initial: "light" | "dark" }) {
  return (
    <button
      className="btn btn-small"
      type="button"
      onClick={() => {
        const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
        document.documentElement.classList.toggle("dark", next === "dark");
        document.cookie = `theme=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
      }}
    >
      {initial === "dark" ? "Light mode" : "Dark mode"}
    </button>
  );
}
