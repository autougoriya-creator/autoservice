"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="cursor-pointer rounded-md bg-[var(--ink)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1d2d3a]"
    >
      Печать / PDF
    </button>
  );
}
