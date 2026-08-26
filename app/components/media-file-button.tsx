"use client";

import { ReactNode, useRef } from "react";

type MediaFileButtonProps = {
  accept: string;
  capture?: boolean | "environment" | "user";
  multiple?: boolean;
  disabled?: boolean;
  className?: string;
  name?: string;
  onFiles: (files: FileList) => void;
  children: ReactNode;
};

function mountFileInput(accept: string, multiple: boolean | undefined, capture: MediaFileButtonProps["capture"]) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  if (multiple) input.multiple = true;
  if (capture) {
    input.setAttribute("capture", capture === true ? "environment" : capture);
  }
  input.setAttribute("aria-hidden", "true");
  input.tabIndex = -1;
  input.style.position = "fixed";
  input.style.top = "0";
  input.style.left = "0";
  input.style.width = "100px";
  input.style.height = "100px";
  input.style.opacity = "0.01";
  document.body.appendChild(input);
  return input;
}

export default function MediaFileButton({
  accept,
  capture,
  multiple,
  disabled,
  className,
  onFiles,
  children,
}: MediaFileButtonProps) {
  const openingRef = useRef(false);

  function openPicker() {
    if (disabled || openingRef.current) return;
    openingRef.current = true;

    const input = mountFileInput(accept, multiple, capture);
    let settled = false;

    const cleanup = () => {
      if (settled) return;
      settled = true;
      openingRef.current = false;
      input.remove();
    };

    const cancelTimer = window.setTimeout(cleanup, 4000);

    input.addEventListener("change", () => {
      window.clearTimeout(cancelTimer);
      if (input.files?.length) onFiles(input.files);
      cleanup();
    }, { once: true });

    try {
      input.click();
    } catch {
      window.clearTimeout(cancelTimer);
      cleanup();
    }
  }

  return (
    <button type="button" className={className} disabled={disabled} onClick={openPicker}>
      {children}
    </button>
  );
}
