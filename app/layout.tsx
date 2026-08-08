import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Archivo, Archivo_Black, Bowlby_One_SC } from "next/font/google";
import "./globals.css";

const archivo = Archivo({ variable: "--font-body", subsets: ["latin"] });
const archivoBlack = Archivo_Black({ variable: "--font-display", weight: "400", subsets: ["latin"] });
const sportClassic = Bowlby_One_SC({ variable: "--font-sport", weight: "400", subsets: ["latin"] });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3001";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;
  return {
    title: "Quiniela MNF 2026 | Rotary Juárez Concordia",
    description: "Tablero interactivo de la quiniela Monday Night Football 2026 de Rotary Juárez Concordia.",
    openGraph: { title: "Quiniela MNF 2026", description: "17 juegos · 100 casillas · una gran causa", images: [{ url: image, width: 1536, height: 1024 }] },
    twitter: { card: "summary_large_image", title: "Quiniela MNF 2026", description: "17 juegos · 100 casillas · una gran causa", images: [image] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body className={`${archivo.variable} ${archivoBlack.variable} ${sportClassic.variable}`}>{children}</body></html>;
}
