// components/global/word-dropzone.tsx
"use client";

import React, { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Loader2 } from "lucide-react";
import * as mammoth from "mammoth";

type Props = {
  /** Si se provee, NO se parsea en el cliente y se llama directo con el File */
  onPickFile?: (file: File) => void | Promise<void>;
  /** Comportamiento anterior: parsea en el cliente y entrega {html, text, file} */
  onFileProcessed?: (data: {
    html?: string;
    text?: string;
    file: File;
  }) => void | Promise<void>;
  /** Para deshabilitar mientras el server procesa */
  isProcessingFile?: boolean;
};

export const WordDropzone: React.FC<Props> = ({
  onPickFile,
  onFileProcessed,
  isProcessingFile = false,
}) => {
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      setError(null);
      const file = acceptedFiles?.[0];
      if (!file) return;

      const ext = file.name.toLowerCase().split(".").pop();
      if (ext !== "docx") {
        setError("Formato no soportado. Solo .docx");
        return;
      }

      try {
        // Opción B: si hay onPickFile, entregamos el File y salimos
        if (onPickFile) {
          await onPickFile(file);
          return;
        }

        // Comportamiento original: parsear en el cliente
        if (!onFileProcessed) return;

        const arrayBuffer = await file.arrayBuffer();
        const { value: html } = await mammoth.convertToHtml({ arrayBuffer });
        const { value: text } = await mammoth.extractRawText({ arrayBuffer });

        await onFileProcessed({ html, text, file });
      } catch (e: any) {
        console.error("[WordDropzone] error:", e);
        setError(e?.message ?? "Error procesando el archivo.");
      }
    },
    [onPickFile, onFileProcessed]
  );

  const { getRootProps, getInputProps, isDragActive, fileRejections } =
    useDropzone({
      onDrop,
      multiple: false,
      disabled: isProcessingFile,
      accept: {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
          [".docx"],
      },
    });

  return (
    <div
      {...getRootProps({
        className:
          "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer select-none " +
          (isProcessingFile ? "opacity-60 pointer-events-none " : "") +
          (isDragActive ? "border-blue-400 " : "border-neutral-300 "),
        "aria-busy": isProcessingFile,
      })}
    >
      <input {...getInputProps()} />
      <div className="flex items-center justify-center gap-2">
        {isProcessingFile && <Loader2 className="h-4 w-4 animate-spin" />}
        <p className="text-sm">
          {isProcessingFile
            ? "Procesando…"
            : isDragActive
            ? "Soltá el archivo aquí…"
            : "Click o arrastrá un .docx"}
        </p>
      </div>

      {(error || fileRejections.length > 0) && (
        <p className="mt-3 text-sm text-red-600">
          {error ?? "Archivo rechazado. Asegurate de subir un .docx"}
        </p>
      )}
    </div>
  );
};
