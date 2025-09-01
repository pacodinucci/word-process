import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  // Guardar temporalmente
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "word-"));
  const inPath = path.join(tmpDir, file.name);
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(inPath, buf);

  try {
    // Convertir a HTML con LibreOffice
    // Salida va al mismo directorio
    await execFileAsync("soffice", [
      "--headless",
      "--convert-to",
      "html",
      "--outdir",
      tmpDir,
      inPath,
    ]);

    const outName = file.name.replace(/\.[^.]+$/, ".html");
    const outPath = path.join(tmpDir, outName);
    const html = await fs.readFile(outPath, "utf8");

    // Puedes además generar texto simple si querés:
    const text = html
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .trim();

    return NextResponse.json({ html, text });
  } catch (e: any) {
    console.error("[/api/word/convert] Error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Convert error" },
      { status: 500 }
    );
  } finally {
    // Limpieza (best effort)
    setTimeout(() => fs.rm(tmpDir, { recursive: true, force: true }), 10_000);
  }
}
