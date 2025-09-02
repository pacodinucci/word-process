import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const getErrorMessage = (e: unknown): string =>
  e instanceof Error
    ? e.message
    : typeof e === "string"
    ? e
    : "Error procesando el archivo.";
